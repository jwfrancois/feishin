// Library Agent — iTunes Search API source (album artwork + year/genre metadata).
// No API key; artworkUrl100 can be upscaled to 600x600 safely.
import { agentFetchJson, cleanQueryPart } from "../http";

export interface ItunesAlbum {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl100?: string;
  releaseDate?: string;
  trackCount?: number;
  primaryGenreName?: string;
  copyright?: string;
}

interface ItunesResponse {
  resultCount: number;
  results: ItunesAlbum[];
}

export async function itunesSearchAlbum(album: string, artist: string): Promise<ItunesAlbum | null> {
  const q = `${cleanQueryPart(artist)} ${cleanQueryPart(album)}`.trim();
  if (!q) return null;
  const url = `https://itunes.apple.com/search?media=music&entity=album&limit=3&term=${encodeURIComponent(q)}`;
  const data = await agentFetchJson<ItunesResponse>(url, { timeoutMs: 10_000 });
  return data?.results?.[0] ?? null;
}

/** Upscale the 100x100 artwork placeholder to the real 600x600 variant. */
export function bestItunesArtwork(album: ItunesAlbum): string | null {
  if (!album.artworkUrl100) return null;
  return album.artworkUrl100.replace(/\/\d+x\d+bb\./, "/600x600bb.");
}
