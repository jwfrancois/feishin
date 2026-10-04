// Library Agent — listening digest job ("memory" duty).
//
// Once a day the agent snapshots per-artist play counts from Jellyfin (tracks
// sorted by PlayCount, aggregated per artist). All rows of one run share a
// single batch timestamp and today's batch is replaced on re-run, so each day
// holds exactly one authoritative snapshot.
//
// The monthly "most-played artists" digest diffs the newest batch against the
// oldest batch inside the current month (month-to-date). Early in a month —
// or before any baseline exists — it falls back to a trailing-30-day window,
// and if even that spans fewer than two snapshot days it reports "collecting"
// with a clear explanation instead of inventing numbers.
import { db } from "@/lib/db";
import { jfJson, type JfFetchOptions } from "@/lib/jf-server";
import { norm } from "./audit";

interface JfAudioItem {
  Id: string;
  Name?: string;
  PlayCount?: number;
  UserData?: { PlayCount?: number };
  ArtistItems?: { Name: string; Id: string }[];
  AlbumArtists?: { Name: string; Id: string }[];
}

class RunLog {
  lines: string[] = [];
  add(s: string) {
    const ts = new Date().toISOString().slice(11, 19);
    this.lines.push(`[${ts}] ${s}`);
    if (this.lines.length > 120) this.lines.splice(0, this.lines.length - 120);
  }
}

export interface DigestResult {
  processed: number; // played tracks examined
  enriched: number; // artist rows snapshotted
  missing: number;
  logLines: string[];
}

const PAGE_SIZE = 500;
const MAX_TRACKS = 8000; // hard cap — covers the played tail of even huge libraries
const MAX_SNAPSHOT_ROWS = 4000; // per-artist rows kept per batch

// ------------------------------------------------------------------ snapshot

export async function runDigestSnapshot(): Promise<DigestResult> {
  const log = new RunLog();
  const artists = new Map<string, { artistName: string; artistId: string; plays: number; tracks: number }>();
  let processed = 0;
  let exhausted = false;

  for (let start = 0; start < MAX_TRACKS && !exhausted; start += PAGE_SIZE) {
    const sp = new URLSearchParams({
      includeItemTypes: "Audio",
      recursive: "true",
      // UserData is required: the server stores play counts there and the
      // PlayCount sort only engages once the field is requested
      fields: "UserData,Artists,AlbumArtists",
      sortBy: "PlayCount",
      sortOrder: "Descending",
      startIndex: String(start),
      limit: String(PAGE_SIZE),
    });
    const data = (await jfJson("Items", { params: sp } as JfFetchOptions)) as {
      Items?: JfAudioItem[];
      TotalRecordCount?: number;
    };
    const items = data.Items ?? [];
    if (items.length === 0) break;
    for (const item of items) {
      const plays = item.UserData?.PlayCount ?? item.PlayCount ?? 0;
      if (plays <= 0) {
        // sorted descending — nothing beyond this point has any plays
        exhausted = true;
        break;
      }
      processed++;
      const art = item.ArtistItems?.[0] ?? item.AlbumArtists?.[0];
      const artistName = art?.Name ?? item.AlbumArtists?.[0]?.Name ?? "";
      if (!artistName) continue; // radio shows / loose files with no artist — keep the digest clean
      const key = norm(artistName) || artistName.toLowerCase();
      const hit = artists.get(key);
      if (hit) {
        hit.plays += plays;
        hit.tracks += 1;
      } else {
        artists.set(key, { artistName, artistId: art?.Id ?? "", plays, tracks: 1 });
      }
    }
    if (items.length < PAGE_SIZE) exhausted = true;
  }

  log.add(`scanned ${processed.toLocaleString()} played tracks across ${artists.size.toLocaleString()} artists`);

  if (artists.size > 0) {
    const batchTime = new Date(); // one shared timestamp — the batch identity
    const startOfToday = new Date(batchTime.getFullYear(), batchTime.getMonth(), batchTime.getDate());
    await db.playSnapshot.deleteMany({ where: { takenAt: { gte: startOfToday } } });
    const rows = [...artists.entries()]
      .map(([artistKey, a]) => ({
        takenAt: batchTime,
        level: "artist",
        artistKey,
        artistName: a.artistName,
        artistId: a.artistId,
        playCount: a.plays,
        trackCount: a.tracks,
      }))
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, MAX_SNAPSHOT_ROWS);
    for (let i = 0; i < rows.length; i += 400) {
      await db.playSnapshot.createMany({ data: rows.slice(i, i + 400) });
    }
    log.add(`snapshot stored: ${rows.length.toLocaleString()} artist rows @ ${batchTime.toISOString()}`);
    const top = rows[0];
    if (top) log.add(`current leader: ${top.artistName} (${top.playCount.toLocaleString()} plays)`);
  } else {
    log.add("no plays recorded yet — nothing to snapshot");
  }

  return { processed, enriched: artists.size, missing: 0, logLines: log.lines };
}

// -------------------------------------------------------------------- digest

export interface DigestArtist {
  artistName: string;
  artistId: string;
  delta: number; // plays gained inside the window
  total: number; // lifetime plays at the latest snapshot
  isNew: boolean; // no plays at baseline — new this window
}

export interface MonthlyDigest {
  status: "ready" | "collecting";
  windowLabel: string; // e.g. "October 2026 · month to date"
  baselineAt: string | null;
  latestAt: string | null;
  days: number; // days spanned by the window
  artists: DigestArtist[];
  totalPlays: number; // summed deltas
  artistsTracked: number; // artists with plays at the latest snapshot
  snapshotDays: number; // distinct snapshot days stored overall
  reason?: string; // collecting explanation for the UI
}

const DAY_MS = 86_400_000;

export async function computeMonthlyDigest(): Promise<MonthlyDigest> {
  // NOTE: sort in JS — SQLite/Prisma groupBy ordering is not guaranteed
  const batchTimes = (await db.playSnapshot.groupBy({ by: ["takenAt"] }))
    .map((b) => b.takenAt)
    .sort((a, b) => b.getTime() - a.getTime()); // newest first
  const snapshotDays = batchTimes.length;

  const collecting = (reason: string, latestAt: Date | null = null): MonthlyDigest => ({
    status: "collecting",
    windowLabel: "building baseline",
    baselineAt: null,
    latestAt: latestAt?.toISOString() ?? null,
    days: 0,
    artists: [],
    totalPlays: 0,
    artistsTracked: 0,
    snapshotDays,
    reason,
  });

  if (snapshotDays === 0) {
    return collecting("No snapshot yet — the agent takes one every day (or trigger one now).");
  }

  const latestAt = batchTimes[0];

  // month-to-date window first, trailing 30 days as fallback
  const startOfMonth = new Date(Date.UTC(latestAt.getUTCFullYear(), latestAt.getUTCMonth(), 1));
  const trailingStart = new Date(latestAt.getTime() - 30 * DAY_MS);
  const monthBatches = batchTimes.filter((t) => t.getTime() >= startOfMonth.getTime());

  let baselineBatch: Date | undefined;
  let windowLabel = `${latestAt.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${latestAt.getUTCFullYear()} · month to date`;
  if (monthBatches.length >= 2) {
    baselineBatch = monthBatches[monthBatches.length - 1]; // oldest in the month window
  } else {
    const trailBatches = batchTimes.filter((t) => t.getTime() >= trailingStart.getTime());
    if (trailBatches.length >= 2) {
      baselineBatch = trailBatches[trailBatches.length - 1];
      windowLabel = "trailing 30 days";
    }
  }
  if (!baselineBatch || baselineBatch.getTime() === latestAt.getTime()) {
    return collecting(
      `Collecting your listening baseline — ${snapshotDays} snapshot day${snapshotDays === 1 ? "" : "s"} stored so far. The digest unlocks once the window spans at least two days.`,
      latestAt,
    );
  }

  const [latestRows, baselineRows] = await Promise.all([
    db.playSnapshot.findMany({ where: { takenAt: latestAt } }),
    db.playSnapshot.findMany({ where: { takenAt: baselineBatch } }),
  ]);

  const baseMap = new Map(baselineRows.map((r) => [r.artistKey, r]));
  const artists: DigestArtist[] = latestRows
    .map((r) => {
      const base = baseMap.get(r.artistKey);
      const delta = r.playCount - (base?.playCount ?? 0);
      return {
        artistName: r.artistName,
        artistId: r.artistId,
        delta,
        total: r.playCount,
        isNew: !base,
      };
    })
    .filter((a) => a.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 25);

  const days = Math.max(1, Math.round((latestAt.getTime() - baselineBatch.getTime()) / DAY_MS));
  const windowLabelText =
    windowLabel === "trailing 30 days" ? "Most-played artists — trailing 30 days" : `Most-played artists — ${windowLabel}`;

  return {
    status: "ready",
    windowLabel: windowLabelText,
    baselineAt: baselineBatch.toISOString(),
    latestAt: latestAt.toISOString(),
    days,
    artists,
    totalPlays: artists.reduce((acc, a) => acc + a.delta, 0),
    artistsTracked: latestRows.length,
    snapshotDays,
  };
}
