// Library Agent — Deezer public API source (album covers, artist photos, release metadata).
// No API key required; gentle throttling via limiter.
import { RateLimiter, agentFetchJson, cleanQueryPart } from "../http";

const limiter = new RateLimiter(250);

export interface DeezerAlbum {
  id: number;
  title: string;
  cover_medium?: string;
  cover_big?: string;
  cover_xl?: string;
  release_date?: string;
  nb_tracks?: number;
  genres?: { data?: { name: string }[] };
  fans?: number;
}

interface DzSearchResponse<T> {
  data?: T[];
  total?: number;
}

export async function dzSearchAlbum(album: string, artist: string): Promise<DeezerAlbum | null> {
  const q = `${cleanQueryPart(artist)} ${cleanQueryPart(album)}`.trim();
  if (!q) return null;
  const url = `https://api.deezer.com/search/album?limit=3&q=${encodeURIComponent(q)}`;
  const data = await limiter.run(() => agentFetchJson<DzSearchResponse<DeezerAlbum>>(url, { timeoutMs: 10_000 }));
  return data?.data?.[0] ?? null;
}

export async function dzArtistPicture(artist: string): Promise<{ url: string; fans?: number } | null> {
  const q = cleanQueryPart(artist);
  if (!q) return null;
  const url = `https://api.deezer.com/search/artist?limit=1&q=${encodeURIComponent(q)}`;
  const data = await limiter.run(() =>
    agentFetchJson<DzSearchResponse<{ id: number; name: string; picture_xl?: string; picture_big?: string; fans?: number }>>(url, {
      timeoutMs: 10_000,
    }),
  );
  const hit = data?.data?.[0];
  if (!hit) return null;
  const pic = hit.picture_xl || hit.picture_big;
  return pic ? { url: pic, fans: hit.fans } : null;
}

/** Pick the best artwork variant Deezer offers. */
export function bestDzCover(album: DeezerAlbum): string | null {
  return album.cover_xl || album.cover_big || album.cover_medium || null;
}
