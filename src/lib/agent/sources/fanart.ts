// Library Agent — Fanart.tv source for artist photos.
// Fanart.tv serves high-quality artist thumbnails/backgrounds keyed by MusicBrainz
// MBID. It requires a (free, personal) API key — get one at https://fanart.tv/get-an-api-key/
// and set it in Agent → Settings (persisted in the agent DB) or via the FANARTTV_API_KEY
// env var. This is the dependable artist-photo source when Deezer's CDN blocks the network.
import { db } from "@/lib/db";
import { agentFetch, agentFetchJson, cleanQueryPart } from "../http";
import { mbSearchArtist } from "./musicbrainz";

/** Well-known MBID (Coldplay) used by the health probe to verify key validity. */
export const FANART_KNOWN_MBID = "cc197bad-dc9c-440d-a5b5-d52ba2e14234";

interface FanartImage {
  url: string;
  likes?: string;
}

interface FanartMusicResponse {
  name?: string;
  mbid_id?: string;
  artistbackground?: FanartImage[];
  artistthumb?: FanartImage[];
  musiclogo?: FanartImage[];
}

/** Resolve the effective API key: agent settings (DB) first, then env var. */
export async function getFanartApiKey(): Promise<string> {
  try {
    const row = await db.agentConfig.findUnique({ where: { id: "singleton" }, select: { fanartApiKey: true } });
    const fromDb = (row?.fanartApiKey ?? "").trim();
    if (fromDb) return fromDb;
  } catch {
    /* column not migrated yet — fall through to env */
  }
  return (process.env.FANARTTV_API_KEY ?? "").trim();
}

function bestImage(list?: FanartImage[]): string | null {
  if (!list || list.length === 0) return null;
  const sorted = [...list].sort((a, b) => (Number(b.likes ?? 0) || 0) - (Number(a.likes ?? 0) || 0));
  return sorted[0]?.url ?? null;
}

export interface FanartPhoto {
  url: string;
  kind: "artistthumb" | "artistbackground";
  mbid: string;
}

/** Artist photo for a name — square thumb preferred, wide background as fallback. */
export async function fanartArtistPhoto(name: string, mbidHint?: string): Promise<FanartPhoto | null> {
  const key = await getFanartApiKey();
  if (!key) return null;
  const q = cleanQueryPart(name);
  if (!q) return null;

  let mbid = (mbidHint ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(mbid)) {
    const artist = await mbSearchArtist(q).catch(() => null);
    mbid = artist?.mbid ?? "";
  }
  if (!mbid) return null;

  const data = await agentFetchJson<FanartMusicResponse>(
    `https://webservice.fanart.tv/v3/music/${mbid}?api_key=${encodeURIComponent(key)}`,
    { timeoutMs: 12_000 },
  );
  const thumb = bestImage(data?.artistthumb);
  const bg = bestImage(data?.artistbackground);
  const url = thumb ?? bg;
  if (!url) return null;
  return { url, kind: thumb ? "artistthumb" : "artistbackground", mbid };
}

/** Health-probe: "ok" (key works) | "bad-key" (401/403) | "no-key" | "down". */
export async function fanartProbe(): Promise<"ok" | "bad-key" | "no-key" | "down"> {
  const key = await getFanartApiKey();
  if (!key) return "no-key";
  const res = await agentFetch(
    `https://webservice.fanart.tv/v3/music/${FANART_KNOWN_MBID}?api_key=${encodeURIComponent(key)}`,
    { timeoutMs: 8_000 },
  );
  if (!res) return "down";
  void res.body?.cancel();
  if (res.ok) return "ok";
  if (res.status === 401 || res.status === 403) return "bad-key";
  return "down";
}
