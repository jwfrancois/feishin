// Library Agent — write-back: pushes scraped findings INTO Jellyfin itself, so
// the enriched library is portable to every Jellyfin client (not just this app).
//
// Non-destructive policy: the agent only FILLS gaps on the server, never
// overwrites values that are already present.
//   bio      -> artist Overview (only when empty) + source attribution
//   artwork  -> Primary image upload (only when the item has no Primary tag)
//   metadata -> ProductionYear / Genres (only when missing)
//   lyrics   -> POST /Audio/{id}/Lyrics?fileName=lyrics.lrc (Jellyfin 10.9+)
// Every attempt is tracked per finding: serverStatus none | synced | failed.
import { db } from "@/lib/db";
import { jfJson, jfFetch, jfRaw, invalidateJfCache, type JfFetchOptions } from "@/lib/jf-server";
import { agentFetch } from "./http";

interface FindingRow {
  id: string;
  itemId: string;
  itemType: string;
  itemName: string;
  kind: string;
  source: string;
  status: string;
  payload: string;
  serverStatus: string;
}

interface JfFullItem {
  Id: string;
  Name?: string;
  Type?: string;
  Overview?: string;
  Genres?: string[];
  ProductionYear?: number;
  ImageTags?: { Primary?: string };
  [key: string]: unknown;
}

export interface ApplyResult {
  findingId: string;
  item: string;
  kind: string;
  ok: boolean;
  detail: string;
}

// ---------------------------------------------------------------- helpers

function payloadOf(f: FindingRow): Record<string, unknown> {
  try {
    return JSON.parse(f.payload || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function getFullItem(itemId: string): Promise<JfFullItem> {
  // `item/{id}` alias -> Users/{userId}/Items/{id} (full DTO, user-scoped)
  return (await jfJson(`item/${itemId}`, {} as JfFetchOptions)) as unknown as JfFullItem;
}

/** Persist the write-back result on the finding row. */
async function markServer(f: FindingRow, ok: boolean, detail: string, alsoApplied: boolean): Promise<void> {
  await db.agentFinding.update({
    where: { id: f.id },
    data: {
      serverStatus: ok ? "synced" : "failed",
      serverError: ok ? null : detail.slice(0, 500),
      serverSyncedAt: ok ? new Date() : null,
      ...(ok && alsoApplied ? { status: "applied" } : {}),
    },
  });
}

function mimeFor(url: string, contentType: string | null): string {
  const ct = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (ct.startsWith("image/")) return ct;
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  return "image/jpeg";
}

// ---------------------------------------------------------------- writers

/** bio -> artist Overview (Wikipedia extract + attribution). Fill-if-empty. */
async function writeBio(f: FindingRow): Promise<string> {
  const payload = payloadOf(f);
  const text = typeof payload.text === "string" ? payload.text : "";
  const url = typeof payload.url === "string" ? payload.url : "";
  if (!text) throw new Error("finding payload has no bio text");
  const item = await getFullItem(f.itemId);
  if (item.Overview?.trim()) return "skipped — server already has an overview";
  item.Overview = `${text}\n\nSource: Wikipedia${url ? ` — ${url}` : ""}`;
  const res = await jfFetch(`Items/${f.itemId}`, { method: "POST", body: item });
  if (!res.ok) throw new Error(`server rejected overview update (${res.status})`);
  return `overview written (${text.length} chars, attributed)`;
}

/** artwork -> Primary image binary upload. Fill-if-missing. */
async function writeArtwork(f: FindingRow): Promise<string> {
  const payload = payloadOf(f);
  const url = typeof payload.url === "string" ? payload.url : "";
  if (!url) throw new Error("finding payload has no image url");
  const item = await getFullItem(f.itemId);
  if (item.ImageTags?.Primary) return "skipped — server already has a primary image";
  const imgRes = await agentFetch(url, { timeoutMs: 25_000 });
  if (!imgRes || !imgRes.ok) throw new Error(`failed to download image from ${f.source}`);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  if (bytes.byteLength < 1024) throw new Error(`downloaded image too small (${bytes.byteLength} B)`);
  const mime = mimeFor(url, imgRes.headers.get("content-type"));
  const up = await jfRaw(`Items/${f.itemId}/Images/Primary`, { method: "POST", contentType: mime, body: bytes });
  if (!up.ok) {
    const t = await up.text().catch(() => "");
    throw new Error(`image upload failed (${up.status})${t ? `: ${t.slice(0, 160)}` : ""}`);
  }
  return `primary image uploaded (${Math.round(bytes.byteLength / 1024)} KB ${mime.replace("image/", "")}, via ${f.source})`;
}

/** metadata -> ProductionYear / Genres. Fill-if-missing, never overwrites. */
async function writeMetadata(f: FindingRow): Promise<string> {
  const payload = payloadOf(f);
  const year = typeof payload.year === "number" ? payload.year : undefined;
  const genres = Array.isArray(payload.genres) ? (payload.genres as string[]).filter((g) => typeof g === "string" && g.trim()) : [];
  const item = await getFullItem(f.itemId);
  const changes: string[] = [];
  if (year && !item.ProductionYear) {
    item.ProductionYear = year;
    changes.push(`year ${year}`);
  }
  if (genres.length && (!item.Genres || item.Genres.length === 0)) {
    item.Genres = genres;
    changes.push(`genres [${genres.join(", ")}]`);
  }
  if (changes.length === 0) return "skipped — server already has this metadata";
  const res = await jfFetch(`Items/${f.itemId}`, { method: "POST", body: item });
  if (!res.ok) throw new Error(`server rejected metadata update (${res.status})`);
  return `metadata written: ${changes.join(" · ")}`;
}

/** lyrics -> POST /Audio/{id}/Lyrics?fileName=lyrics.lrc with the raw lyric file
 *  as body. Jellyfin parses .lrc uploads into synced lyrics; .txt into plain lines. */
async function writeLyrics(f: FindingRow): Promise<string> {
  const payload = payloadOf(f);
  const synced = typeof payload.synced === "string" ? payload.synced : "";
  const plain = typeof payload.plain === "string" ? payload.plain : "";
  if (!synced && !plain) throw new Error("finding payload has no lyrics");
  const body = synced || plain;
  const fileName = synced ? "lyrics.lrc" : "lyrics.txt";
  const res = await jfRaw(`Audio/${f.itemId}/Lyrics`, {
    method: "POST",
    params: new URLSearchParams({ fileName }),
    contentType: "text/plain",
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`lyrics upload failed (${res.status})${t ? `: ${t.slice(0, 160)}` : ""}`);
  }
  const lineCount = (synced || plain).split("\n").filter((l) => l.trim()).length;
  return `lyrics written (${lineCount} lines, ${synced ? "synced" : "plain"})`;
}

// ---------------------------------------------------------------- public API

const WRITERS: Record<string, (f: FindingRow) => Promise<string>> = {
  bio: writeBio,
  artwork: writeArtwork,
  metadata: writeMetadata,
  lyrics: writeLyrics,
};

/** Apply one finding to the Jellyfin server. Safe to re-run (skips already-synced). */
export async function applyFindingToJellyfin(findingId: string): Promise<ApplyResult> {
  const f = (await db.agentFinding.findUnique({ where: { id: findingId } })) as FindingRow | null;
  if (!f) return { findingId, item: "?", kind: "?", ok: false, detail: "finding not found" };
  const label = `${f.kind} "${f.itemName || f.itemId}"`;
  if (f.status !== "found" && f.status !== "applied") {
    return { findingId: f.id, item: label, kind: f.kind, ok: false, detail: `nothing to write (status: ${f.status})` };
  }
  if (f.serverStatus === "synced") {
    return { findingId: f.id, item: label, kind: f.kind, ok: true, detail: "already synced to Jellyfin" };
  }
  const writer = WRITERS[f.kind];
  if (!writer) return { findingId: f.id, item: label, kind: f.kind, ok: false, detail: `no writer for kind "${f.kind}"` };
  try {
    const detail = await writer(f);
    const applied = detail !== "skipped — server already has an overview" &&
      detail !== "skipped — server already has a primary image" &&
      detail !== "skipped — server already has this metadata";
    await markServer(f, true, detail, applied);
    if (applied) invalidateJfCache(); // app queries must see the server-side change
    return { findingId: f.id, item: label, kind: f.kind, ok: true, detail };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "write-back failed";
    await markServer(f, false, detail, false).catch(() => undefined);
    return { findingId: f.id, item: label, kind: f.kind, ok: false, detail };
  }
}

// ---------------------------------------------------------------- batch

// Batch flag lives on globalThis — Next.js bundles each route separately, so
// plain module state would be duplicated per route (see jf-server.ts note).
interface GlobalWb {
  __feishinWbBatch?: boolean;
}
const g = globalThis as typeof globalThis & GlobalWb;

export function isBatchRunning(): boolean {
  return g.__feishinWbBatch ?? false;
}

export interface BatchResult {
  applied: number;
  skipped: number;
  failed: number;
  results: ApplyResult[];
}

/** Write every eligible finding (found, not yet synced) to Jellyfin, politely, in sequence. */
export async function applyBatchToJellyfin(opts: { limit?: number; kind?: string } = {}): Promise<BatchResult> {
  if (isBatchRunning()) return { applied: 0, skipped: 0, failed: 0, results: [] };
  g.__feishinWbBatch = true;
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  try {
    const rows = (await db.agentFinding.findMany({
      where: {
        status: { in: ["found", "applied"] },
        serverStatus: { not: "synced" },
        ...(opts.kind ? { kind: opts.kind } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    })) as FindingRow[];

    const results: ApplyResult[] = [];
    let applied = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      const r = await applyFindingToJellyfin(row.id);
      results.push(r);
      if (!r.ok) failed++;
      else if (r.detail.startsWith("skipped") || r.detail.startsWith("already synced")) skipped++;
      else applied++;
      await new Promise((res) => setTimeout(res, 350)); // polite spacing
    }
    return { applied, skipped, failed, results };
  } finally {
    g.__feishinWbBatch = false;
  }
}
