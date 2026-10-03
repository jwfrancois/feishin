// Library Agent — shared HTTP utilities for internet sources.
// Politeness is a hard requirement: MusicBrainz mandates ≤1 req/s and a
// descriptive User-Agent; the other APIs are throttled mildly so we never
// look like an abusive scraper.

export const AGENT_USER_AGENT =
  "FeishinLibraryAgent/1.0 (https://github.com/jwfrancois/feishin; media library manager)";

/** Simple serial queue that enforces a minimum spacing between requests. */
export class RateLimiter {
  private chain: Promise<void> = Promise.resolve();
  private lastAt = 0;

  constructor(private minSpacingMs: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const wait = this.lastAt + this.minSpacingMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastAt = Date.now();
    });
    this.chain = next.catch(() => undefined);
    return next.then(fn);
  }
}

/** fetch with hard timeout + agent UA; returns null on any network failure. */
export async function agentFetch(
  url: string,
  opts: { timeoutMs?: number; method?: string; headers?: Record<string, string>; redirect?: RequestRedirect } = {},
): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: opts.method ?? "GET",
      redirect: opts.redirect ?? "follow",
      headers: { "User-Agent": AGENT_USER_AGENT, ...(opts.headers ?? {}) },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

export async function agentFetchJson<T>(url: string, opts?: { timeoutMs?: number; headers?: Record<string, string> }): Promise<T | null> {
  const res = await agentFetch(url, { ...opts, headers: { Accept: "application/json", ...(opts?.headers ?? {}) } });
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Strip pieces that confuse search APIs (feat., parentheses, file junk). */
export function cleanQueryPart(s: string): string {
  return s
    .replace(/\((feat|ft|with|deluxe|remaster(ed)?|explicit)[^)]*\)/gi, "")
    .replace(/\[(feat|ft|with|deluxe|remaster(ed)?|explicit)[^\]]*\]/gi, "")
    .replace(/\s+-\s+(remaster|single|album version|explicit).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
