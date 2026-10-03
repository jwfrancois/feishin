"use client";
// Feishin rebuild — favorites route (songs / albums / artists tabs, backed by server IsFavorite)
import { useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchFavorites, mapAlbum, mapArtist, mapSong } from "@/lib/jellyfin";
import { useJfQuery, invalidateJf } from "@/hooks/use-jf";
import { useRouterStore } from "@/store/router-store";
import { SongTable } from "../song-table";
import { AlbumCard } from "../album-card";
import { ItemImage } from "../shared";
import type { Album, Artist, Song } from "@/lib/types";

const TABS = ["Songs", "Albums", "Artists"] as const;

export function FavoritesView({ initialTab = "Songs" }: { initialTab?: (typeof TABS)[number] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab);
  const navigate = useRouterStore((s) => s.navigate);

  const songsQ = useJfQuery("fav:songs", async () => {
    const { items } = await fetchFavorites("Audio");
    return items.map(mapSong);
  }, 30_000);
  const albumsQ = useJfQuery("fav:albums", async () => {
    const { items } = await fetchFavorites("MusicAlbum");
    return items.map(mapAlbum);
  }, 30_000);
  const artistsQ = useJfQuery("fav:artists", async () => {
    const { items } = await fetchFavorites("MusicArtist");
    return items.map(mapArtist);
  }, 30_000);

  const songs: Song[] = useMemo(() => songsQ.data ?? [], [songsQ.data]);
  const albums: Album[] = useMemo(() => albumsQ.data ?? [], [albumsQ.data]);
  const artists: Artist[] = useMemo(() => artistsQ.data ?? [], [artistsQ.data]);

  return (
    <div className="px-8 pb-24 pt-8" data-testid="favorites-view">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight text-[var(--fg)]">Favorites</h1>
        <button type="button" className="fs-pill !py-2 text-[12.5px]" onClick={() => invalidateJf("fav:")}>
          Refresh
        </button>
      </div>
      <div className="mb-6 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-[4px] px-3 py-1.5 text-[12.5px] font-bold uppercase tracking-wide transition-colors",
              tab === t ? "bg-[var(--elevated)] text-[var(--primary)]" : "text-[var(--fg-dim)] hover:bg-[var(--hover)] hover:text-[var(--fg)]",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Songs" &&
        (songsQ.loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[52px] animate-pulse rounded-[4px] bg-[var(--elevated)]" />
            ))}
          </div>
        ) : songs.length > 0 ? (
          <SongTable songs={songs} columns={["tracknum", "title", "artist", "album", "duration", "fav"]} />
        ) : (
          <div className="flex flex-col items-center gap-2 py-20 text-[var(--fg-dim)]">
            <Heart size={28} />
            <span className="text-[13.5px]">Songs you favorite will appear here</span>
          </div>
        ))}

      {tab === "Albums" &&
        (albumsQ.loading ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-square w-full animate-pulse rounded-[4px] bg-[var(--elevated)]" />
              </div>
            ))}
          </div>
        ) : albums.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} width="w-full" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-20 text-[var(--fg-dim)]">
            <Heart size={28} />
            <span className="text-[13.5px]">Albums you favorite will appear here</span>
          </div>
        ))}

      {tab === "Artists" &&
        (artistsQ.loading ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-square w-full animate-pulse rounded-[4px] bg-[var(--elevated)]" />
              </div>
            ))}
          </div>
        ) : artists.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {artists.map((artist) => (
              <button
                key={artist.id}
                type="button"
                onClick={() => navigate({ view: "artist", id: artist.id })}
                className="text-left"
              >
                <ItemImage src={artist.imageUrl} alt={artist.name} className="aspect-square w-full rounded-[4px]" />
                <div className="mt-2 truncate text-[13.5px] font-bold text-[var(--fg)]">{artist.name}</div>
                <div className="truncate text-[12.5px] text-[var(--fg-dim)]">{artist.genre}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-20 text-[var(--fg-dim)]">
            <Heart size={28} />
            <span className="text-[13.5px]">Artists you favorite will appear here</span>
          </div>
        ))}
    </div>
  );
}
