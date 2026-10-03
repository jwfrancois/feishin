"use client";
// Feishin rebuild — tracks route (all songs, server-paginated + client filter/sort)
import { useEffect, useState } from "react";
import { fetchTracksPage } from "@/lib/jellyfin";
import type { Song } from "@/lib/types";
import { SongTable } from "../song-table";
import { useJfQuery } from "@/hooks/use-jf";

const PAGE_SIZE = 100;

export function TracksView() {
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [accumulated, setAccumulated] = useState<Song[]>([]);

  const { data, loading } = useJfQuery(
    `tracks:${pagesLoaded}`,
    () => fetchTracksPage({ startIndex: (pagesLoaded - 1) * PAGE_SIZE, limit: PAGE_SIZE }),
    5 * 60_000,
  );

  useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => {
      const seen = new Set(prev.map((s) => s.id));
      const merged = [...prev];
      for (const s of data.songs) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          merged.push(s);
        }
      }
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    setAccumulated([]);
  }, [pagesLoaded]);

  const total = data?.total ?? 0;
  const canLoadMore = pagesLoaded * PAGE_SIZE < total;

  return (
    <div className="px-8 pb-24 pt-8" data-testid="tracks-view">
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-2xl font-black tracking-tight text-[var(--fg)]">Tracks</h1>
        <span className="text-[13px] text-[var(--fg-dim)]">
          {total > 0 ? `${accumulated.length.toLocaleString()} of ${total.toLocaleString()}` : `${accumulated.length} tracks`}
        </span>
      </div>

      {loading && accumulated.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="h-[52px] animate-pulse rounded-[4px] bg-[var(--elevated)]" />
          ))}
        </div>
      ) : (
        <SongTable songs={accumulated} />
      )}

      {canLoadMore && (
        <div className="flex justify-center py-4">
          <button type="button" className="fs-pill !py-2 text-[13px]" disabled={loading} onClick={() => setPagesLoaded((p) => p + 1)}>
            {loading ? "Loading…" : `Load more (${total - accumulated.length} remaining)`}
          </button>
        </div>
      )}
    </div>
  );
}
