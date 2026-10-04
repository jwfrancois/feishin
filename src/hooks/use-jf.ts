"use client";
// Feishin rebuild — tiny async query hook with module-level cache + dedupe + invalidation
import { useCallback, useEffect, useState } from "react";

interface Entry {
  data?: unknown;
  error?: string;
  promise?: Promise<unknown>;
  ts: number;
  ttl: number;
}

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function startFetch(key: string, fetcher: () => Promise<unknown>, ttl: number): Promise<unknown> {
  const promise = (async () => {
    try {
      const data = await fetcher();
      cache.set(key, { data, ts: Date.now(), ttl });
      return data;
    } catch (err) {
      cache.set(key, { error: err instanceof Error ? err.message : "Request failed", ts: Date.now(), ttl });
      throw err;
    } finally {
      notify(key);
    }
  })();
  cache.set(key, { promise, ts: Date.now(), ttl });
  return promise;
}

export function useJfQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  ttlMs = 60_000,
): { data: T | undefined; error: string | undefined; loading: boolean; refetch: () => void } {
  const [, bump] = useState(0);

  useEffect(() => {
    if (!key) return;
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(() => bump((v) => v + 1));
    const entry = cache.get(key);
    if (!entry || (!entry.data && !entry.promise && !entry.error)) {
      startFetch(key, fetcher, ttlMs);
    } else if (entry.error && Date.now() - entry.ts > ttlMs) {
      startFetch(key, fetcher, ttlMs);
    } else if (entry.data && Date.now() - entry.ts > ttlMs && !entry.promise) {
      // stale — revalidate in background
      startFetch(key, fetcher, ttlMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refetch = useCallback(() => {
    if (!key) return;
    cache.delete(key);
    startFetch(key, fetcher, ttlMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return { data: undefined, error: undefined, loading: false, refetch };

  const entry = cache.get(key);
  if (!entry) {
    return { data: undefined, error: undefined, loading: true, refetch };
  }
  if (entry.promise && entry.data === undefined && !entry.error) {
    return { data: undefined, error: undefined, loading: true, refetch };
  }
  return {
    data: entry.data as T | undefined,
    error: entry.error,
    loading: entry.data === undefined,
    refetch,
  };
}

/** Drop cached entries whose key contains `prefix`, triggering refetches in mounted components. */
export function invalidateJf(prefix: string) {
  for (const key of [...cache.keys()]) {
    if (key.includes(prefix)) {
      cache.delete(key);
      notify(key);
    }
  }
}
