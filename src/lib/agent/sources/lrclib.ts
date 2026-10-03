// Library Agent — LRCLIB source for lyrics (free, no API key, synced LRC supported).
// https://lrclib.net — politely throttled.
import { RateLimiter, agentFetchJson, cleanQueryPart } from "../http";

const limiter = new RateLimiter(400);

export interface LrcLibResult {
  syncedLyrics: string | null; // "[mm:ss.xx] line" LRC text
  plainLyrics: string | null;
}

interface LrcLibResponse {
  id?: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
}

export async function lrclibGetLyrics(params: {
  artist: string;
  track: string;
  album?: string;
  durationSec?: number;
}): Promise<LrcLibResult | null> {
  const artist = cleanQueryPart(params.artist);
  const track = cleanQueryPart(params.track);
  if (!artist || !track) return null;
  const sp = new URLSearchParams({
    artist_name: artist,
    track_name: track,
  });
  if (params.album) sp.set("album_name", cleanQueryPart(params.album));
  if (params.durationSec && params.durationSec > 0) sp.set("duration", String(Math.round(params.durationSec)));
  const url = `https://lrclib.net/api/get?${sp.toString()}`;
  const data = await limiter.run(() => agentFetchJson<LrcLibResponse>(url, { timeoutMs: 12_000, headers: { "Lrclib-Client": "FeishinLibraryAgent/1.0" } }));
  if (!data) return null;
  if (data.instrumental) return { syncedLyrics: null, plainLyrics: null };
  const synced = data.syncedLyrics?.trim() || null;
  const plain = data.plainLyrics?.trim() || null;
  if (!synced && !plain) return null;
  return { syncedLyrics: synced, plainLyrics: plain };
}
