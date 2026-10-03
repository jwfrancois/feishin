// Library Agent — MusicBrainz source (album metadata, artist lookup) + Cover Art Archive.
// MB policy: max 1 request/second, descriptive User-Agent, identify with contact URL.
import { RateLimiter, agentFetch, agentFetchJson, cleanQueryPart } from "../http";

const MB_BASE = "https://musicbrainz.org/ws/2";
const limiter = new RateLimiter(1100); // slightly above the mandated 1/s

export interface MbReleaseGroup {
  mbid: string;
  title: string;
  firstReleaseDate?: string;
  primaryType?: string;
  score?: number;
}

export interface MbDiscogRelease {
  mbid: string;
  title: string;
  year?: string;
  primaryType?: string;
  secondaryTypes?: string[];
}

interface MbSearchResponse {
  "release-groups"?: {
    id: string;
    title: string;
    "first-release-date"?: string;
    "primary-type"?: string;
    score?: number;
  }[];
  artists?: { id: string; name: string; score?: number; disambiguation?: string }[];
}

interface MbBrowseResponse {
  "release-groups"?: {
    id: string;
    title: string;
    "first-release-date"?: string;
    "primary-type"?: string;
    "secondary-types"?: string[];
  }[];
  "release-group-count"?: number;
}

interface MbArtistLookup {
  id: string;
  name: string;
  type?: string;
  country?: string;
  "life-span"?: { begin?: string; end?: string };
  tags?: { name: string; count: number }[];
}

export async function mbSearchReleaseGroup(album: string, artist: string): Promise<MbReleaseGroup | null> {
  const query = `releasegroup:"${cleanQueryPart(album)}" AND artist:"${cleanQueryPart(artist)}"`;
  const url = `${MB_BASE}/release-group?query=${encodeURIComponent(query)}&limit=1&fmt=json`;
  const data = await limiter.run(() => agentFetchJson<MbSearchResponse>(url, { timeoutMs: 10_000 }));
  const hit = data?.["release-groups"]?.[0];
  if (!hit) return null;
  return {
    mbid: hit.id,
    title: hit.title,
    firstReleaseDate: hit["first-release-date"],
    primaryType: hit["primary-type"],
    score: hit.score,
  };
}

export async function mbSearchArtist(name: string): Promise<{ mbid: string; type?: string; country?: string; begin?: string; genres: string[] } | null> {
  const query = `artist:"${cleanQueryPart(name)}"`;
  const url = `${MB_BASE}/artist?query=${encodeURIComponent(query)}&limit=1&fmt=json`;
  const data = await limiter.run(() => agentFetchJson<MbSearchResponse>(url, { timeoutMs: 10_000 }));
  const hit = data?.artists?.[0];
  if (!hit) return null;
  // one extra lookup for tags/genres/country (still rate-limited)
  const detail = await limiter.run(() => agentFetchJson<MbArtistLookup>(`${MB_BASE}/artist/${hit.id}?inc=tags&fmt=json`, { timeoutMs: 10_000 }));
  return {
    mbid: hit.id,
    type: detail?.type,
    country: detail?.country,
    begin: detail?.["life-span"]?.begin,
    genres: (detail?.tags ?? [])
      .slice(0, 5)
      .map((t) => t.name)
      .filter((g) => g.length < 30),
  };
}

/** Browse ALL release-groups of an artist (MBID), newest first — the internet discography. */
export async function mbArtistReleaseGroups(mbid: string, limit = 100): Promise<MbDiscogRelease[]> {
  if (!/^[0-9a-f-]{36}$/i.test(mbid)) return [];
  const url = `${MB_BASE}/release-group?artist=${mbid}&limit=${Math.min(Math.max(limit, 1), 100)}&fmt=json`;
  const data = await limiter.run(() => agentFetchJson<MbBrowseResponse>(url, { timeoutMs: 15_000 }));
  const groups = data?.["release-groups"] ?? [];
  return groups
    .map((g) => ({
      mbid: g.id,
      title: g.title,
      year: g["first-release-date"]?.slice(0, 4),
      primaryType: g["primary-type"],
      secondaryTypes: g["secondary-types"] ?? [],
    }))
    .sort((a, b) => (b.year ?? "").localeCompare(a.year ?? ""));
}

// ---------------------------------------------------------------- Cover Art Archive

/** Resolve a Cover Art Archive front image URL for a release-group MBID (302 → real file). */
export async function caaFrontUrl(mbid: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(mbid)) return null;
  const url = `https://coverartarchive.org/release-group/${mbid}/front-500`;
  const res = await agentFetch(url, { method: "HEAD", timeoutMs: 12_000 });
  if (res && res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) return res.url || url;
  return null;
}
