// Feishin rebuild — image proxy with on-disk cache + upstream concurrency limiting
// Jellyfin image extraction is slow (~1-2s each); we cache bytes on disk so repeat
// views are instant and parallel page loads don't hammer the server.
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { jfFetch, getConnectionRaw } from "@/lib/jf-server";

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
      return NextResponse.json({ error: `Image ${upstream.status}` }, { status: upstream.status });
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

function sniffContentType(buf: Buffer): string {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).toString("ascii") === "\x89PNG\r\n\x1a\n") return "image/png";
  if (buf.length > 6 && (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
  if (buf.length > 12 && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "image/jpeg";
}
