// Library Agent — library audit job ("quality control" duty).
// Sweeps the song library in small rolling windows (a few pages per run) so
// even six-figure libraries are covered politely over successive runs:
//   1. duplicates  — same normalized title + album artist appearing more than once
//                    (songs sorted by name, so copies land in the same window)
//   2. quality     — low-bitrate sources (< 176 kbps) that degrade a lossless-ish library
// Findings are in-app knowledge only (never written back to Jellyfin). Each run
// audits its window from scratch and prunes findings that no longer apply within
// that window — the list self-corrects as the cursor wraps around the library.
import { db } from "@/lib/db";
import { jfJson, type JfFetchOptions } from "@/lib/jf-server";
import { ensureConfig, updateConfig } from "../config";

interface JfAudioItem {
  Id: string;
  Name?: string;
  Album?: string;
  ProductionYear?: number;
  AlbumArtists?: { Name: string; Id: string }[];
  MediaSources?: {
    MediaStreams?: { Type?: string; Bitrate?: number; Codec?: string }[];
  }[];
}

class RunLog {
  lines: string[] = [];
  add(s: string) {
    const ts = new Date().toISOString().slice(11, 19);
    this.lines.push(`[${ts}] ${s}`);
    if (this.lines.length > 120) this.lines.splice(0, this.lines.length - 120);
  }
}

export interface AuditResult {
  processed: number;
  enriched: number;
  missing: number;
  logLines: string[];
}

// quality threshold: below this the source is likely a low-tier transcode
// (128 kbps mp3/wma, 96 kbps aac voice rips…) even in otherwise lossless libraries
const LOW_BITRATE = 176_000;
const MAX_FINDINGS_PER_KIND = 60;
const PAGE_SIZE = 500; // songs per Jellyfin page
const PAGES_PER_RUN = 6; // 3,000 songs per run — a 192k library is covered in ~64 hourly runs
const OVERLAP = 120; // look past the window end so same-title copies straddling the boundary are still caught
const DUPES_KIND = "dupes";
const QUALITY_KIND = "quality";

/** Normalize for comparison: lowercase, strip diacritics/punctuation, collapse spaces, drop a leading "the ". */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

interface CopyInfo {
  id: string;
  name: string;
  album: string;
  year?: number;
  bitrate?: number;
}

function bestBitrate(item: JfAudioItem): { bitrate?: number; codec?: string } {
  let best: { bitrate?: number; codec?: string } = {};
  for (const src of item.MediaSources ?? []) {
    for (const st of src.MediaStreams ?? []) {
      if (st.Type && st.Type !== "Audio") continue;
      if (typeof st.Bitrate === "number" && (best.bitrate === undefined || st.Bitrate > best.bitrate)) {
        best = { bitrate: st.Bitrate, codec: st.Codec };
      }
    }
  }
  return best;
}

export async function runAuditJob(): Promise<AuditResult> {
  const log = new RunLog();
  const cfg = await ensureConfig();
  const start = Math.max(0, cfg.auditCursor);
  const want = PAGES_PER_RUN * PAGE_SIZE + OVERLAP;

  // ------------------------------------------------------------- fetch the window
  const window: JfAudioItem[] = [];
  let total = 0;
  for (let page = start; page < start + want && (total === 0 || page < total); page += PAGE_SIZE) {
    const sp = new URLSearchParams({
      includeItemTypes: "Audio",
      recursive: "true",
      fields: "MediaSources,AlbumArtists,ProductionYear",
      sortBy: "SortName", // stable order — same-title copies sort together
      sortOrder: "Ascending",
      startIndex: String(page),
      limit: String(PAGE_SIZE),
    });
    const data = (await jfJson("Items", { params: sp } as JfFetchOptions)) as { Items?: JfAudioItem[]; TotalRecordCount?: number };
    total = data.TotalRecordCount || total;
    const items = data.Items ?? [];
    window.push(...items);
    if (items.length < PAGE_SIZE) break;
  }

  // advance the rolling cursor (past the fetched pages, wrapped)
  let next = start + PAGES_PER_RUN * PAGE_SIZE;
  let wrapped = false;
  if (total > 0 && next >= total) {
    next = 0;
    wrapped = true;
  }
  await updateConfig({ auditCursor: next });
  const range = total > 0 ? `songs ${start.toLocaleString()}–${Math.min(start + window.length, total).toLocaleString()} of ${total.toLocaleString()}` : "empty window";
  log.add(`audit window: ${range}${wrapped ? " (wrapped to start)" : ""}`);

  // ------------------------------------------------------------- duplicates (within the window)
  const groups = new Map<string, JfAudioItem[]>();
  for (const s of window) {
    const title = norm(s.Name ?? "");
    if (!title) continue;
    const artist = norm(s.AlbumArtists?.[0]?.Name ?? "");
    const key = `${title}::${artist}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }
  const dupeGroups = [...groups.values()].filter((g) => g.length > 1);
  if (dupeGroups.length) log.add(`duplicates in window: ${dupeGroups.length} titles with more than one copy`);

  const windowIds = new Set(window.map((s) => s.Id));
  let enriched = 0;
  for (const group of dupeGroups.slice(0, MAX_FINDINGS_PER_KIND)) {
    const anchor = [...group].sort((a, b) => a.Id.localeCompare(b.Id))[0];
    const artist = group[0].AlbumArtists?.[0]?.Name ?? "";
    const copies: CopyInfo[] = group.slice(0, 6).map((c) => ({ id: c.Id, name: c.Name ?? "", album: c.Album ?? "", year: c.ProductionYear, bitrate: bestBitrate(c).bitrate }));
    const extra = group.length > 6 ? ` (+${group.length - 6} more)` : "";
    const summary = `${group.length} copies — "${group[0].Name ?? "?"}" by ${artist || "?"}${extra}`;
    await db.agentFinding.upsert({
      where: { itemId_kind: { itemId: anchor.Id, kind: DUPES_KIND } },
      update: { status: "found", source: "jellyfin", payload: JSON.stringify({ count: group.length, copies }), summary, itemName: group[0].Name ?? "", itemSubtitle: artist, itemType: "song" },
      create: { itemId: anchor.Id, itemType: "song", itemName: group[0].Name ?? "", itemSubtitle: artist, kind: DUPES_KIND, status: "found", source: "jellyfin", payload: JSON.stringify({ count: group.length, copies }), summary },
    });
    enriched++;
  }
  // prune: only findings whose anchor song lives in the CURRENT window (older windows self-correct on wrap)
  const dupeAnchors = new Set(dupeGroups.flatMap((g) => g.map((s) => s.Id)));
  const existingDupes = await db.agentFinding.findMany({ where: { kind: DUPES_KIND, itemId: { in: [...windowIds] } }, select: { id: true, itemId: true } });
  const deadDupes = existingDupes.filter((f) => !dupeAnchors.has(f.itemId));
  if (deadDupes.length) await db.agentFinding.deleteMany({ where: { id: { in: deadDupes.map((f) => f.id) } } });

  // ------------------------------------------------------------- quality (within the window)
  const lowQ: { item: JfAudioItem; bitrate: number; codec?: string }[] = [];
  let noBitrate = 0;
  for (const s of window) {
    const br = bestBitrate(s);
    if (br.bitrate === undefined) {
      noBitrate++;
      continue;
    }
    if (br.bitrate < LOW_BITRATE) lowQ.push({ item: s, bitrate: br.bitrate, codec: br.codec });
  }
  lowQ.sort((a, b) => a.bitrate - b.bitrate);
  if (lowQ.length) log.add(`low quality in window: ${lowQ.length} songs below ${Math.round(LOW_BITRATE / 1000)} kbps`);

  for (const q of lowQ.slice(0, MAX_FINDINGS_PER_KIND)) {
    const kbps = Math.round(q.bitrate / 1000);
    const codec = (q.codec ?? "").toUpperCase();
    const album = q.item.Album ?? q.item.AlbumArtists?.[0]?.Name ?? "";
    const summary = `${kbps} kbps ${codec || "audio"} — low-quality source in your library`;
    await db.agentFinding.upsert({
      where: { itemId_kind: { itemId: q.item.Id, kind: QUALITY_KIND } },
      update: { status: "found", source: "jellyfin", payload: JSON.stringify({ bitrate: q.bitrate, codec: q.codec }), summary, itemName: q.item.Name ?? "", itemSubtitle: album, itemType: "song" },
      create: { itemId: q.item.Id, itemType: "song", itemName: q.item.Name ?? "", itemSubtitle: album, kind: QUALITY_KIND, status: "found", source: "jellyfin", payload: JSON.stringify({ bitrate: q.bitrate, codec: q.codec }), summary },
    });
    enriched++;
  }
  const qAnchors = new Set(lowQ.map((q) => q.item.Id));
  const existingQ = await db.agentFinding.findMany({ where: { kind: QUALITY_KIND, itemId: { in: [...windowIds] } }, select: { id: true, itemId: true } });
  const deadQ = existingQ.filter((f) => !qAnchors.has(f.itemId));
  if (deadQ.length) await db.agentFinding.deleteMany({ where: { id: { in: deadQ.map((f) => f.id) } } });

  log.add(`audit finished — window had ${window.length} songs, ${enriched} findings updated`);
  return { processed: window.length, enriched, missing: 0, logLines: log.lines };
}
