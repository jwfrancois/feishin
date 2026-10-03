// Library Agent — Wikipedia source for artist biographies.
// Uses the REST summary endpoint + action-API search to resolve the right page.
import { agentFetchJson, cleanQueryPart } from "../http";

export interface WikiSummary {
  title: string;
  extract: string;
  thumbnailUrl?: string;
  pageUrl?: string;
}

interface RestSummary {
  title?: string;
  titles?: { normalized?: string };
  extract?: string;
  type?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

interface ActionSearch {
  query?: { search?: { title: string; snippet?: string }[] };
}

/** Search Wikipedia for the best-matching page, then fetch its summary. Returns null if nothing sensible. */
export async function wikiArtistBio(artist: string): Promise<WikiSummary | null> {
  const q = cleanQueryPart(artist);
  if (!q) return null;
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&format=json&origin=*`;
  const search = await agentFetchJson<ActionSearch>(searchUrl, { timeoutMs: 10_000 });
  const candidates = search?.query?.search ?? [];
  if (candidates.length === 0) return null;

  // prefer an exact/near title match; skip obvious disambiguation pages when alternatives exist
  const lower = q.toLowerCase();
  const ordered = [...candidates].sort((a, b) => {
    const aExact = a.title.toLowerCase() === lower ? 1 : 0;
    const bExact = b.title.toLowerCase() === lower ? 1 : 0;
    return bExact - aExact;
  });

  for (const cand of ordered.slice(0, 2)) {
    const title = cand.title;
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`;
    const sum = await agentFetchJson<RestSummary>(url, { timeoutMs: 10_000 });
    if (!sum?.extract) continue;
    if (sum.type === "disambiguation" || /may refer to/i.test(sum.extract)) continue;
    return {
      title: sum.titles?.normalized ?? title,
      extract: sum.extract,
      thumbnailUrl: sum.thumbnail?.source,
      pageUrl: sum.content_urls?.desktop?.page,
    };
  }
  return null;
}
