"use client";
// Feishin rebuild — artists list route (grid of artist cards, server-paginated)
import { useEffect, useState } from "react";
import { fetchArtistsPage } from "@/lib/jellyfin";
import type { Artist } from "@/lib/types";
import { useRouterStore } from "@/store/router-store";
import { ItemImage, CtxItem, CtxSeparator } from "../shared";
import { usePlayerStore } from "@/store/player-store";
import { useSongActions } from "../song-actions";
import { useJfQuery } from "@/hooks/use-jf";
import { ContextMenuNS as ContextMenu } from "@/components/ui/context-menu";

const PAGE_SIZE = 60;

function ArtistContextMenu({ artist, children }: { artist: Artist; children: React.ReactNode }) {
  const actions = useSongActions();
  const fav = usePlayerStore((s) => !!s.favoriteArtists[artist.id]);
  const toggleArtistFav = usePlayerStore((s) => s.toggleArtistFavorite);
  const playArtistRadio = async () => {
    const songs = await fetchSongsForRadio(artist.id);
    if (songs.length > 0) {
      actions.play(songs, Math.floor(Math.random() * songs.length));
      toastShuffle();
    }
  };
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="fs-menu-content">
          <CtxItem onSelect={playArtistRadio}>Play artist radio</CtxItem>
          <CtxSeparator />
          <CtxItem
            onSelect={() => {
              toggleArtistFav(artist.id);
            }}
          >
            {fav ? "Remove from favorites" : "Add to favorites"}
          </CtxItem>
          <CtxItem onSelect={() => actions.goToArtist(artist.id)}>Go to {artist.name}</CtxItem>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

async function fetchSongsForRadio(artistId: string) {
  const { fetchArtistTopSongs } = await import("@/lib/jellyfin");
  return fetchArtistTopSongs(artistId, 25);
}

function toastShuffle() {
  import("sonner").then(({ toast }) => toast("Artist radio started", { duration: 1200 }));
}

export function ArtistsView() {
  const navigate = useRouterStore((s) => s.navigate);
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [accumulated, setAccumulated] = useState<Artist[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedFilter(filter);
      setPagesLoaded(1);
    }, 400);
    return () => clearTimeout(t);
  }, [filter]);

  useEffect(() => {
    setAccumulated([]);
  }, [debouncedFilter]);

  const isSearch = debouncedFilter.trim().length > 0;
  const queryKey = isSearch ? `artists:search:${debouncedFilter}` : `artists:${pagesLoaded}`;

  const { data, loading } = useJfQuery(
    queryKey,
    () =>
      fetchArtistsPage({
        startIndex: isSearch ? 0 : (pagesLoaded - 1) * PAGE_SIZE,
        limit: isSearch ? 60 : PAGE_SIZE,
        searchTerm: isSearch ? debouncedFilter.trim() : undefined,
      }),
    isSearch ? 60_000 : 5 * 60_000,
  );

  useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => {
      if (isSearch) return data.artists;
      const seen = new Set(prev.map((a) => a.id));
      const merged = [...prev];
      for (const a of data.artists) {
        if (!seen.has(a.id)) {
          seen.add(a.id);
          merged.push(a);
        }
      }
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const total = data?.total ?? 0;

  return (
    <div className="px-8 pb-24 pt-8" data-testid="artists-view">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-2xl font-black tracking-tight text-[var(--fg)]">Artists</h1>
        {!loading && total > 0 && <span className="text-[13px] text-[var(--fg-dim)]">{total.toLocaleString()}</span>}
      </div>
      <div className="mb-6">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search artists"
          aria-label="Search artists"
          className="fs-input h-9 w-[280px] px-3 text-[13px]"
        />
      </div>

      {loading && accumulated.length === 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-square w-full animate-pulse rounded-[4px] bg-[var(--elevated)]" />
              <div className="mt-2 h-3.5 w-3/4 animate-pulse rounded bg-[var(--elevated)]" />
            </div>
          ))}
        </div>
      ) : accumulated.length === 0 ? (
        <div className="py-16 text-center text-[13.5px] text-[var(--fg-dim)]">
          {isSearch ? `No artists matching "${debouncedFilter}"` : "No artists found"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {accumulated.map((artist) => (
              <ArtistContextMenu key={artist.id} artist={artist}>
                <div
                  className="group cursor-pointer"
                  onClick={() => navigate({ view: "artist", id: artist.id })}
                  role="link"
                  aria-label={`Open artist ${artist.name}`}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigate({ view: "artist", id: artist.id })}
                >
                  <div className="relative overflow-hidden rounded-[4px]">
                    <ItemImage src={artist.imageUrl} alt={`${artist.name} image`} className="aspect-square w-full" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="mt-2 truncate text-[13.5px] font-bold text-[var(--fg)]">{artist.name}</div>
                  <div className="truncate text-[12.5px] text-[var(--fg-dim)]">{artist.genre}</div>
                </div>
              </ArtistContextMenu>
            ))}
          </div>
          {!isSearch && loading && (
            <div className="py-4 text-center text-[12.5px] text-[var(--fg-dim)]">Loading more artists…</div>
          )}
          {!isSearch && !loading && pagesLoaded * PAGE_SIZE < total && (
            <div className="flex justify-center py-4">
              <button type="button" className="fs-pill !py-2 text-[13px]" onClick={() => setPagesLoaded((p) => p + 1)}>
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
