// Feishin rebuild — server-side Jellyfin connection manager + cached fetch
// Runs ONLY inside Next.js route handlers (never bundled to the client).
// Credentials stay on the server; the browser talks to our own /api/* routes.

interface JfConnection {
  url: string;
  username: string;
  password: string;
  apiKey: string;
}

const DEFAULT_CONN: JfConnection = {
  url: "https://manitou.dyabavadra.com",
  username: "dyabavadra",
  password: "bonjour66",
  apiKey: "14c48564a8e040869d1587d27715fde0",
};

interface ConnState {
  conn: JfConnection;
  token: string | null;
  userId: string | null;
  serverName: string | null;
  serverVersion: string | null;
  musicLibraryId: string | null;
  authPromise: Promise<void> | null;
}

// Next.js bundles each route handler separately — module-level state would be
// duplicated per route. Share ONE connection + cache via globalThis.
interface GlobalJf {
  __feishinJfState?: ConnState;
  __feishinJfCache?: Map<string, CacheEntry>;
}
const g = globalThis as typeof globalThis & GlobalJf;

const state: ConnState = (g.__feishinJfState ??= {
  conn: { ...DEFAULT_CONN },
  token: null,
  userId: null,
  serverName: null,
  serverVersion: null,
  musicLibraryId: null,
  authPromise: null,
});

const AUTH_HEADER = `MediaBrowser Client="Feishin Web", Device="Feishin Web", DeviceId="feishin-web-client", Version="0.16.0"`;

function apiUrl(path: string, params?: URLSearchParams): string {
  const base = state.conn.url.replace(/\/+$/, "");
  const qs = params && [...params.keys()].length > 0 ? `?${params.toString()}` : "";
  return `${base}/${path.replace(/^\/+/, "")}${qs}`;
}

async function authenticateByName(): Promise<void> {
  const res = await fetch(apiUrl("Users/AuthenticateByName"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Emby-Authorization": AUTH_HEADER,
      Authorization: AUTH_HEADER,
    },
    body: JSON.stringify({ Username: state.conn.username, Pw: state.conn.password }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Jellyfin auth failed (${res.status})`);
  const data = (await res.json()) as {
    AccessToken: string;
    User: { Id: string; Name: string };
    ServerId?: string;
  };
  state.token = data.AccessToken;
  state.userId = data.User.Id;
}

async function ensureAuthenticated(force = false): Promise<void> {
  if (state.authPromise && !force) return state.authPromise;
  state.authPromise = (async () => {
    try {
      // verify existing token first (cheap call)
      if (state.token && !force) {
        const ok = await fetch(apiUrl("System/Info"), {
          headers: authHeaders(),
          signal: AbortSignal.timeout(15_000),
        });
        if (ok.ok) {
          await loadServerMeta();
          return;
        }
        state.token = null;
      }
      try {
        await authenticateByName();
      } catch {
        // fall back to the provided API key (admin token)
        state.token = state.conn.apiKey || null;
        state.userId = state.userId ?? (await findUserId());
      }
      if (!state.token) throw new Error("Jellyfin authentication failed");
      await loadServerMeta();
    } finally {
      state.authPromise = null;
    }
  })();
  return state.authPromise;
}

async function findUserId(): Promise<string | null> {
  const res = await fetch(apiUrl("Users"), { headers: authHeaders(), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const users = (await res.json()) as { Id: string; Name: string }[];
  const match = users.find((u) => u.Name === state.conn.username);
  return match?.Id ?? users[0]?.Id ?? null;
}

async function loadServerMeta(): Promise<void> {
  try {
    const res = await fetch(apiUrl("System/Info"), { headers: authHeaders(), signal: AbortSignal.timeout(15_000) });
    if (res.ok) {
      const info = (await res.json()) as { ServerName?: string; Version?: string };
      state.serverName = info.ServerName ?? null;
      state.serverVersion = info.Version ?? null;
    }
    // discover the music library (first music collection) once
    if (state.userId && !state.musicLibraryId) {
      const res2 = await fetch(apiUrl(`Users/${state.userId}/Items`), {
        headers: authHeaders(),
        signal: AbortSignal.timeout(20_000),
      });
      if (res2.ok) {
        const data = (await res2.json()) as { Items: { Id: string; Name: string; CollectionType?: string }[] };
        const music = data.Items?.find((i) => i.CollectionType === "music");
        state.musicLibraryId = music?.Id ?? null;
      }
    }
  } catch {
    // non-fatal
  }
}

function authHeaders(): Record<string, string> {
  return {
    "X-Emby-Token": state.token ?? "",
    "X-Emby-Authorization": AUTH_HEADER,
    Authorization: AUTH_HEADER,
  };
}

export interface JfFetchOptions {
  method?: "GET" | "POST" | "DELETE";
  params?: URLSearchParams;
  body?: unknown;
  extraHeaders?: Record<string, string>;
}

/** Low-level authenticated fetch against the configured Jellyfin server. Retries once on 401. */
export async function jfFetch(path: string, opts: JfFetchOptions = {}): Promise<Response> {
  await ensureAuthenticated();
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = { ...authHeaders(), ...(opts.extraHeaders ?? {}) };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(apiUrl(path, opts.params), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(120_000),
    });
  };
  let res = await doFetch();
  if (res.status === 401) {
    await ensureAuthenticated(true);
    res = await doFetch();
  }
  return res;
}

/** Authenticated fetch that returns parsed JSON, injecting the userId/musicLibraryId automatically. */
export async function jfJson(path: string, opts: JfFetchOptions = {}): Promise<unknown> {
  const params = opts.params ?? new URLSearchParams();
  // inject userId into typical user-scoped queries
  if (state.userId) {
    if ((path === "Items" || path === "Genres" || path === "Artists/AlbumArtists") && !params.get("userId")) {
      params.set("userId", state.userId);
    }
    if (path.startsWith("Items/") && path.endsWith("/Similar") && !params.get("userId")) {
      params.set("userId", state.userId);
    }
  }
  if (state.musicLibraryId && (path === "Items" || path === "Genres" || path === "Artists/AlbumArtists") && !params.get("parentId")) {
    params.set("parentId", state.musicLibraryId);
  }
  // convenience aliases handled here
  let realPath = path;
  const body = opts.body !== undefined ? { ...(opts.body as Record<string, unknown>) } : undefined;
  if (state.userId) {
    // item/{id} -> Users/{userId}/Items/{id} (single-item fetch, user-scoped UserData)
    const itemMatch = /^item\/([A-Za-z0-9]+)$/.exec(realPath);
    if (itemMatch) realPath = `Users/${state.userId}/Items/${itemMatch[1]}`;
    if (/^favorite\//.test(path) && opts.method) {
      realPath = `Users/${state.userId}/FavoriteItems/${path.slice("favorite/".length)}`;
    }
    if (realPath === "Playlists" && opts.method === "POST" && body && !body.UserId) {
      body.UserId = state.userId;
    }
    if (realPath.startsWith("Sessions/Playing") && body) {
      if (!body.UserId) body.UserId = state.userId;
      if (!body.DeviceId) body.DeviceId = "feishin-web-client";
    }
  }
  const res = await jfFetch(realPath, { ...opts, params, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jellyfin ${opts.method ?? "GET"} ${realPath} -> ${res.status} ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

// ---------------------------------------------------------------- cache (SWR)

interface CacheEntry {
  ts: number;
  ttl: number;
  data?: unknown;
  promise?: Promise<unknown>;
}

const cache: Map<string, CacheEntry> = (g.__feishinJfCache ??= new Map());

export function invalidateJfCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.includes(prefix)) cache.delete(key);
  }
}

/** GET with in-memory TTL cache + stale-while-revalidate. */
export async function jfGetCached(path: string, params: URLSearchParams, ttlMs = 5 * 60_000): Promise<unknown> {
  const key = `${path}?${params.toString()}`;
  const entry = cache.get(key);
  const now = Date.now();

  if (entry?.data !== undefined && now - entry.ts < ttlMs) {
    return entry.data; // fresh
  }
  if (entry?.promise) return entry.promise; // in-flight dedupe

  const promise = (async () => {
    const data = await jfJson(path, { params });
    cache.set(key, { ts: Date.now(), ttl: ttlMs, data });
    return data;
  })();

  if (entry?.data !== undefined) {
    // stale-while-revalidate: serve stale, refresh in background
    promise.catch(() => cache.delete(key));
    return entry.data;
  }

  cache.set(key, { ts: now, ttl: ttlMs, promise });
  try {
    return await promise;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

export function getConnectionState() {
  return {
    serverName: state.serverName,
    serverVersion: state.serverVersion,
    userId: state.userId,
    musicLibraryId: state.musicLibraryId,
    url: state.conn.url,
    username: state.conn.username,
  };
}

/** Raw connection material (used by the audio proxy to put the token in the query string). */
export function getConnectionRaw() {
  return { token: state.token ?? "", apiKey: state.conn.apiKey, url: state.conn.url };
}

/** Reconfigure the connection (used by the "add server" flow). */
export async function configureConnection(conn: Partial<JfConnection>): Promise<ReturnType<typeof getConnectionState>> {
  state.conn = { ...state.conn, ...conn };
  state.token = null;
  state.userId = null;
  state.musicLibraryId = null;
  state.serverName = null;
  state.serverVersion = null;
  cache.clear();
  await ensureAuthenticated(true);
  return getConnectionState();
}

export async function ensureReady(): Promise<ReturnType<typeof getConnectionState>> {
  await ensureAuthenticated();
  return getConnectionState();
}

export { AUTH_HEADER };
