// Library Agent — health job. Periodically probes every layer of the system:
// Jellyfin reachability/auth, library stats, actual media-file readability
// (catches unmounted shares), the image pipeline, disk cache, process health
// (memory / event-loop lag), the agent database, and internet source reachability.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { jfFetch, jfJson, getConnectionState, getConnectionRaw } from "@/lib/jf-server";
import { ensureConfig, DEFAULT_SOURCES } from "../config";
import { agentFetch } from "../http";
import { fanartProbe } from "../sources/fanart";

export type CheckStatus = "ok" | "warn" | "fail";

export interface ShareHealth {
  path: string;
  readable: number;
  total: number;
}

export interface HealthCheck {
  name: string;
  status: CheckStatus;
  latencyMs: number;
  detail: string;
  shares?: ShareHealth[]; // per-share readability (media files check only)
}

export interface HealthResult {
  overall: "healthy" | "degraded" | "critical";
  score: number;
  checks: HealthCheck[];
  serverName: string;
  serverVersion: string;
  serverLatency: number;
  albumCount: number;
  songCount: number;
  mediaReadable: number;
  cacheMb: number;
  memoryMb: number;
  internetOk: boolean;
}

const IMG_CACHE_DIR = join(process.cwd(), ".cache", "jf-img");

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const t0 = Date.now();
  const result = await fn();
  return { ms: Date.now() - t0, result };
}

interface ServerCheck {
  check: HealthCheck;
  serverName: string;
  serverVersion: string;
}

async function checkServer(): Promise<ServerCheck> {
  try {
    const { ms, result } = await timed(async () => (await jfFetch("System/Info", {})).json());
    const info = result as { ServerName?: string; Version?: string };
    const latency = Math.min(ms, 99_999);
    return {
      check: {
        name: "Jellyfin server",
        status: latency < 3_000 ? "ok" : "warn",
        latencyMs: latency,
        detail: `${info.ServerName ?? "server"} v${info.Version ?? "?"} responded in ${ms} ms`,
      },
      serverName: info.ServerName ?? "",
      serverVersion: info.Version ?? "",
    };
  } catch (err) {
    return {
      check: {
        name: "Jellyfin server",
        status: "fail",
        latencyMs: 0,
        detail: `Unreachable: ${err instanceof Error ? err.message : "error"}`,
      },
      serverName: "",
      serverVersion: "",
    };
  }
}

async function checkLibraryCounts(): Promise<HealthCheck & { albums: number; songs: number }> {
  try {
    const [albums, songs] = await Promise.all([
      jfJson("Items", { params: new URLSearchParams({ includeItemTypes: "MusicAlbum", recursive: "true", limit: "0" }) }),
      jfJson("Items", { params: new URLSearchParams({ includeItemTypes: "Audio", recursive: "true", limit: "0" }) }),
    ]);
    const a = (albums as { TotalRecordCount?: number }).TotalRecordCount ?? 0;
    const s = (songs as { TotalRecordCount?: number }).TotalRecordCount ?? 0;
    return {
      name: "Library index",
      status: a > 0 && s > 0 ? "ok" : "warn",
      latencyMs: 0,
      detail: `${a.toLocaleString()} albums · ${s.toLocaleString()} songs indexed`,
      albums: a,
      songs: s,
    } as HealthCheck & { albums: number; songs: number };
  } catch (err) {
    return {
      name: "Library index",
      status: "fail",
      latencyMs: 0,
      detail: `Query failed: ${err instanceof Error ? err.message : "error"}`,
      albums: 0,
      songs: 0,
    } as HealthCheck & { albums: number; songs: number };
  }
}

/** Sample random tracks and Range-probe them to detect unmounted media shares.
 *  Results are grouped per share root (e.g. /mnt/nas_share, /mnt1/unraid_share)
 *  so a remount on one share is visible — and recovery vs. the previous snapshot
 *  is called out explicitly. */
async function checkMediaReadable(): Promise<HealthCheck & { fraction: number }> {
  try {
    // previous readability, for recovery detection ("share remounted -> score recovers")
    const prev = await db.healthSnapshot
      .findFirst({ orderBy: { id: "desc" }, select: { mediaReadable: true } })
      .catch(() => null);

    const data = (await jfJson("Items", {
      params: new URLSearchParams({ includeItemTypes: "Audio", recursive: "true", sortBy: "Random", limit: "10", fields: "Path" }),
    })) as { Items?: { Id: string; Path?: string }[] };
    const samples = (data.Items ?? []).slice(0, 8);
    if (samples.length === 0) {
      return { name: "Media files", status: "warn", latencyMs: 0, detail: "No tracks sampled", fraction: 0 };
    }
    const perShare = new Map<string, { readable: number; total: number }>();
    const shareOf = (p?: string) => (p ? p.split("/").slice(0, 3).join("/") : "unknown");
    let readable = 0;
    let ttfb = 0;
    for (const item of samples) {
      const share = shareOf(item.Path);
      const bucket = perShare.get(share) ?? { readable: 0, total: 0 };
      bucket.total++;
      try {
        const t0 = Date.now();
        const res = await jfFetch(`Audio/${item.Id}`, { extraHeaders: { Range: "bytes=0-1" } });
        const ms = Date.now() - t0;
        void res.body?.cancel();
        if (res.status === 206 || res.status === 200) {
          readable++;
          ttfb += ms;
          bucket.readable++;
        }
      } catch {
        /* unreadable sample */
      }
      perShare.set(share, bucket);
    }
    const fraction = readable / samples.length;
    const shares: ShareHealth[] = [...perShare.entries()]
      .map(([path, b]) => ({ path, readable: b.readable, total: b.total }))
      .sort((a, b) => a.path.localeCompare(b.path));
    const offlineShares = shares.filter((s) => s.readable === 0).map((s) => s.path);
    const recovered = !!prev && prev.mediaReadable < 0.99 && fraction >= 0.99;
    let detail = `${readable}/${samples.length} sampled tracks streamable`;
    if (offlineShares.length) detail += ` — shares offline: ${offlineShares.join(", ")} (remount them; the score recovers on the next check)`;
    else if (fraction < 1) detail += ` — some tracks unreachable`;
    if (recovered) detail += " · share back online — recovered since last check";
    return {
      name: "Media files",
      status: fraction === 1 ? "ok" : fraction === 0 ? "fail" : "warn",
      latencyMs: readable > 0 ? Math.round(ttfb / readable) : 0,
      detail,
      shares,
    } as HealthCheck & { fraction: number };
  } catch (err) {
    return {
      name: "Media files",
      status: "fail",
      latencyMs: 0,
      detail: `Probe failed: ${err instanceof Error ? err.message : "error"}`,
      fraction: 0,
    } as HealthCheck & { fraction: number };
  }
}

/** Probe the upstream image pipeline (what /api/jf-img serves from). */
async function checkImagePipeline(): Promise<HealthCheck> {
  try {
    const data = (await jfJson("Items", {
      params: new URLSearchParams({ includeItemTypes: "MusicAlbum", recursive: "true", sortBy: "Random", limit: "3" }),
    })) as { Items?: { Id: string }[] };
    const album = (data.Items ?? [])[0];
    if (!album) return { name: "Image pipeline", status: "warn", latencyMs: 0, detail: "No albums to sample" };
    const { ms, result } = await timed(async () => jfFetch(`Items/${album.Id}/Images/Primary`, { params: new URLSearchParams({ maxWidth: "64" }) }));
    void result.body?.cancel();
    return {
      name: "Image pipeline",
      status: result.ok ? (ms < 4_000 ? "ok" : "warn") : "warn",
      latencyMs: Math.min(ms, 99_999),
      detail: result.ok ? `Album art served in ${ms} ms` : `Upstream art unavailable (${result.status}) — agent placeholders in use`,
    };
  } catch (err) {
    return {
      name: "Image pipeline",
      status: "warn",
      latencyMs: 0,
      detail: `Probe failed: ${err instanceof Error ? err.message : "error"}`,
    };
  }
}

function cacheSizeMb(): { mb: number; files: number } {
  try {
    if (!existsSync(IMG_CACHE_DIR)) return { mb: 0, files: 0 };
    let total = 0;
    let files = 0;
    for (const f of readdirSync(IMG_CACHE_DIR)) {
      try {
        total += statSync(join(IMG_CACHE_DIR, f)).size;
        files++;
      } catch {
        /* vanished mid-scan */
      }
    }
    return { mb: Math.round((total / 1024 / 1024) * 10) / 10, files };
  } catch {
    return { mb: 0, files: 0 };
  }
}

async function checkEventLoopLag(): Promise<number> {
  const expected = 100;
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, expected));
  return Date.now() - t0 - expected;
}

/** HEAD-probe the internet sources the agent depends on. */
async function checkInternet(): Promise<HealthCheck & { ok: boolean }> {
  const cfg = await ensureConfig();
  const probes: { name: string; url: string; enabled: boolean }[] = [
    { name: "MusicBrainz", url: "https://musicbrainz.org", enabled: cfg.sources.musicbrainz },
    { name: "Deezer", url: "https://api.deezer.com", enabled: cfg.sources.deezer },
    { name: "iTunes", url: "https://itunes.apple.com", enabled: cfg.sources.itunes },
    { name: "Cover Art Archive", url: "https://coverartarchive.org", enabled: cfg.sources.coverart },
    { name: "Wikipedia", url: "https://en.wikipedia.org", enabled: cfg.sources.wikipedia },
    { name: "LRCLIB", url: "https://lrclib.net", enabled: cfg.sources.lrclib },
    { name: "Fanart.tv", url: "https://webservice.fanart.tv", enabled: cfg.sources.fanart },
  ];
  const results = await Promise.all(
    probes.map(async (p) => {
      if (!p.enabled) return { name: p.name, up: true, skipped: true, note: "" };
      // GET (not HEAD — some hosts reject HEAD); ANY response proves reachability
      const res = await agentFetch(p.url, { method: "GET", timeoutMs: 8_000 });
      void res?.body?.cancel();
      return { name: p.name, up: !!res, skipped: false, note: "" };
    }),
  );
  // Fanart.tv needs an API key — verify it and surface the key state explicitly
  const fa = results.find((r) => r.name === "Fanart.tv");
  if (fa && fa.up && !fa.skipped) {
    const state = await fanartProbe();
    if (state === "ok") fa.note = "API key working";
    else if (state === "bad-key") {
      fa.up = false;
      fa.note = "API key rejected (401) — check it in Agent → Settings";
    } else if (state === "no-key") fa.note = "no API key — artist photos off (get a free key at fanart.tv, paste it in Agent → Settings)";
    else fa.note = "API error";
  }
  const checked = results.filter((r) => !r.skipped);
  const up = checked.filter((r) => r.up).length;
  const downNames = checked.filter((r) => !r.up).map((r) => r.name);
  const notes = checked.filter((r) => r.note).map((r) => `${r.name}: ${r.note}`);
  return {
    name: "Internet sources",
    status: checked.length === 0 ? "ok" : up === 0 ? "fail" : up < checked.length ? "warn" : "ok",
    latencyMs: 0,
    detail:
      (checked.length === 0 ? "All sources disabled in settings" : `${up}/${checked.length} reachable${downNames.length ? ` (down: ${downNames.join(", ")})` : ""}`) +
      (notes.length ? ` — ${notes.join(" · ")}` : ""),
    ok: up > 0 || checked.length === 0,
  } as HealthCheck & { ok: boolean };
}

export async function runHealthJob(): Promise<HealthResult> {
  const server = await checkServer();
  const auth = await (async (): Promise<HealthCheck> => {
    const st = getConnectionState();
    const raw = getConnectionRaw();
    const hasCreds = !!(raw.token || raw.apiKey);
    return {
      name: "Authentication",
      status: hasCreds && (st.userId || raw.apiKey) ? "ok" : hasCreds ? "warn" : "fail",
      latencyMs: 0,
      detail: hasCreds ? (st.userId ? `Authenticated as ${st.username}` : "API-key auth (no user session)") : "No credentials configured",
    };
  })();
  const lib = await checkLibraryCounts();
  const media = await checkMediaReadable();
  const images = await checkImagePipeline();
  const net = await checkInternet();
  const dbLatency = await timed(async () => db.agentFinding.count()).then((r) => ({ ms: r.ms, count: r.result })).catch(() => ({ ms: -1, count: 0 }));
  const lag = await checkEventLoopLag();
  const mem = process.memoryUsage();
  const cache = cacheSizeMb();

  const checks: HealthCheck[] = [
    server.check,
    auth,
    { name: "Library index", status: lib.status, latencyMs: lib.latencyMs, detail: lib.detail },
    media,
    images,
    net,
    {
      name: "Agent database",
      status: dbLatency.ms >= 0 ? (dbLatency.ms < 250 ? "ok" : "warn") : "fail",
      latencyMs: Math.max(dbLatency.ms, 0),
      detail: dbLatency.ms >= 0 ? `${dbLatency.ms} ms · ${dbLatency.count.toLocaleString()} stored findings` : "Query failed",
    },
    {
      name: "Artwork cache",
      status: cache.mb < 280 ? "ok" : "warn",
      latencyMs: 0,
      detail: `${cache.mb} MB across ${cache.files.toLocaleString()} files (cap 300 MB, auto-trimmed)`,
    },
    {
      name: "Agent process",
      status: lag < 250 && mem.rss < 900 * 1024 * 1024 ? "ok" : "warn",
      latencyMs: lag,
      detail: `RSS ${(mem.rss / 1024 / 1024).toFixed(0)} MB · uptime ${Math.round(process.uptime() / 60)} min · loop lag ${lag} ms`,
    },
  ];

  const critical = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const overall = critical > 0 ? "critical" : warns > 0 ? "degraded" : "healthy";
  const score = Math.max(0, 100 - critical * 25 - warns * 8);

  return {
    overall,
    score,
    checks,
    serverName: server.serverName,
    serverVersion: server.serverVersion,
    serverLatency: server.check.latencyMs,
    albumCount: lib.albums,
    songCount: lib.songs,
    mediaReadable: media.fraction,
    cacheMb: cache.mb,
    memoryMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
    internetOk: net.ok,
  };
}

/** Persist a health snapshot (JSON columns stored as strings for SQLite). */
export async function recordHealthSnapshot(r: HealthResult): Promise<void> {
  await db.healthSnapshot.create({
    data: {
      overall: r.overall,
      score: r.score,
      checks: JSON.stringify(r.checks),
      serverName: r.serverName,
      serverVersion: r.serverVersion,
      serverLatency: r.serverLatency,
      albumCount: r.albumCount,
      songCount: r.songCount,
      mediaReadable: r.mediaReadable,
      cacheMb: r.cacheMb,
      memoryMb: r.memoryMb,
      internetOk: r.internetOk,
    },
  });
  // keep only the last 240 snapshots
  const old = await db.healthSnapshot.findMany({ orderBy: { id: "desc" }, skip: 240, take: 1000, select: { id: true } });
  if (old.length) await db.healthSnapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}


