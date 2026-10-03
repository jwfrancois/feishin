// Feishin rebuild — image proxy with on-disk cache + upstream concurrency limiting
// Jellyfin image extraction is slow (~1-2s each); we cache bytes on disk so repeat
// views are instant and parallel page loads don't hammer the server.
// Library Agent integration: when the upstream art is unavailable, the proxy
// serves artwork the agent scraped from the internet (AgentFinding), and records
// previously-unseen gaps as "pending" so the next scan resolves them.
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { jfFetch, getConnectionRaw } from "@/lib/jf-server";
import { AGENT_USER_AGENT } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const CACHE_DIR = join(process.cwd(), ".cache", "jf-img");
const CACHE_MAX_BYTES = 300 * 1024 * 1024; // 300 MB cap, trimmed by oldest mtime

// simple semaphore for upstream image fetches
const MAX_CONCURRENT = 6;
let active = 0;
const queue: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

function cachePath(key: string): string {
  return join(CACHE_DIR, `${createHash("sha1").update(key).digest("hex")}.img`);
}

function trimCacheIfNeeded(): void {
  try {
    if (!existsSync(CACHE_DIR)) return;
    const files = readdirSync(CACHE_DIR).map((f) => {
      const p = join(CACHE_DIR, f);
      return { p, size: statSync(p).size, mtime: statSync(p).mtimeMs };
    });
    let total = files.reduce((n, f) => n + f.size, 0);
    if (total <= CACHE_MAX_BYTES) return;
    files.sort((a, b) => a.mtime - b.mtime);
    for (const f of files) {
      if (total <= CACHE_MAX_BYTES) break;
      unlinkSync(f.p);
      total -= f.size;
    }
  } catch {
    /* best effort */
  }
}

/** GET /api/jf-img/{itemId}?tag=...&maxWidth=300&quality=75 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid item id" }, { status: 400 });
  }
  const sp = req.nextUrl.searchParams;
  const params = new URLSearchParams();
  const tag = sp.get("tag");
  if (tag) params.set("tag", tag);
  params.set("maxWidth", sp.get("maxWidth") ?? "300");
  params.set("quality", sp.get("quality") ?? "78");

  const key = `Items/${id}/Images/Primary?${params.toString()}`;
  const file = cachePath(key);

  try {
    if (existsSync(file)) {
      const buf = readFileSync(file);
      const ct = sniffContentType(buf);
      const headers = new Headers({ "Content-Type": ct, "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400" });
      headers.set("Content-Length", String(buf.length));
      return new Response(buf, { status: 200, headers });
    }

    const upstream = await withSlot(() => jfFetch(`Items/${id}/Images/Primary`, { params }));
    if (!upstream.ok) {
      // The item has no Primary image (or the server can't read its media share right now).
      // 1) If the Library Agent previously scraped artwork for this item, serve that.
      // 2) Otherwise record the gap as "pending" so the agent's next scan resolves it,
      //    and serve a deterministic initials tile in the meantime.
      const agentArt = await tryAgentArtwork(id, key);
      if (agentArt) return agentArt;
      void recordPendingArtwork(id, sp.get("name"), sp.get("artist"));
      return imagePlaceholder(id, sp.get("name"));
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const ct = upstream.headers.get("Content-Type") ?? sniffContentType(buf) ?? "image/jpeg";

    // persist to disk (best effort)
    try {
      if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(file, buf);
      trimCacheIfNeeded();
    } catch {
      /* ignore cache write errors */
    }

    const headers = new Headers({
      "Content-Type": ct,
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      "Content-Length": String(buf.length),
    });
    return new Response(buf, { status: 200, headers });
  } catch (err) {
    void getConnectionRaw; // keep import tree-shake-safe
    return NextResponse.json({ error: err instanceof Error ? err.message : "Image proxy failed" }, { status: 502 });
  }
}

/** Serve artwork the Library Agent scraped (payload.url), disk-caching it under the normal key. */
async function tryAgentArtwork(id: string, key: string): Promise<Response | null> {
  try {
    const { db } = await import("@/lib/db");
    const finding = await db.agentFinding.findUnique({ where: { itemId_kind: { itemId: id, kind: "artwork" } } });
    if (!finding || !"found_applied".includes(finding.status)) return null;
    const payload = JSON.parse(finding.payload || "{}") as { url?: string };
    if (!payload.url) return null;
    const res = await fetch(payload.url, {
      headers: { "User-Agent": AGENT_USER_AGENT },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return null; // too small to be real art
    const ct = res.headers.get("Content-Type") ?? sniffContentType(buf);
    if (!ct.startsWith("image/")) return null;
    // persist so the next request is a pure disk-cache hit
    try {
      if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(cachePath(key), buf);
      trimCacheIfNeeded();
    } catch {
      /* best effort */
    }
    void db.agentFinding
      .update({ where: { itemId_kind: { itemId: id, kind: "artwork" } }, data: { status: "applied" } })
      .catch(() => undefined);
    const headers = new Headers({
      "Content-Type": ct,
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
      "Content-Length": String(buf.length),
      "X-Agent-Artwork": finding.source,
    });
    return new Response(buf, { status: 200, headers });
  } catch {
    return null;
  }
}

/** Record an image gap so the Library Agent scan job resolves it from the internet. */
async function recordPendingArtwork(id: string, name: string | null, artist: string | null): Promise<void> {
  try {
    const { db } = await import("@/lib/db");
    const existing = await db.agentFinding.findUnique({ where: { itemId_kind: { itemId: id, kind: "artwork" } } });
    // only queue fresh gaps — never resurrect confirmed-missing items or clobber scraped/applied art
    if (existing) return;
    await db.agentFinding.create({
      data: {
        itemId: id,
        kind: "artwork",
        status: "pending",
        itemType: "album",
        itemName: name ?? "",
        itemSubtitle: artist ?? "",
        summary: "Gap noticed by the image proxy — awaiting scan",
      },
    });
  } catch {
    /* never let bookkeeping break image serving */
  }
}

/** Deterministic gradient + initials tile for items without a servable image. */
function imagePlaceholder(id: string, rawName: string | null): Response {
  // initials: first alphanumeric char of up to two words
  const words = (rawName ?? "")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  let initials = words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  if (!initials) initials = id.slice(0, 2).toUpperCase();

  // deterministic hues from the item id
  const h1 = parseInt(id.slice(0, 4), 16) % 360;
  const h2 = (h1 + 40 + (parseInt(id.slice(4, 8), 16) % 80)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${h1},32%,26%)"/>` +
    `<stop offset="1" stop-color="hsl(${h2},38%,14%)"/></linearGradient></defs>` +
    `<rect width="300" height="300" fill="url(#g)"/>` +
    `<text x="150" y="150" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="700" ` +
    `fill="rgba(255,255,255,0.42)">${initials}</text></svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // short-lived: real art should replace the tile once the server can serve it
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}

function sniffContentType(buf: Buffer): string {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).toString("ascii") === "\x89PNG\r\n\x1a\n") return "image/png";
  if (buf.length > 6 && (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
  if (buf.length > 12 && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "image/jpeg";
}
