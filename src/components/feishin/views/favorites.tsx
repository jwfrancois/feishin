"use client";
// Feishin rebuild — favorites route (songs / albums / artists tabs)
import { useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { allTracks, allAlbums, allArtists, getAlbumCover, trackToSong } from "@/lib/library";
import { usePlayerStore } from "@/store/player-store";
import { useRouterStore } from "@/store/router-store";
import { SongTable } from "../song-table";
import { AlbumCard } from "../album-card";
import { ItemImage } from "../shared";

const TABS = ["Songs", "Albums", "Artists"] as const;

export function FavoritesView({ initialTab = "Songs" }: { initialTab?: (typeof TABS)[number] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab);
  const favTracks = usePlayerStore((s) => s.favoriteTracks);
  const favAlbums = usePlayerStore((s) => s.favoriteAlbums);
  const favArtists = usePlayerStore((s) => s.favoriteArtists);
  const starredAt = usePlayerStore((s) => s.starredAt);
  const navigate = useRouterStore((s) => s.navigate);

  const songs = useMemo(
    () =>
      allTracks
        .filter((t) => favTracks[t.id])
        .sort((a, b) => (starredAt[b.id] ?? 0) - (starredAt[a.id] ?? 0))
        .map((t) => trackToSong(t, getAlbumCover(t.albumId))),
    [favTracks, starredAt],
  );
  const albums = useMemo(() => allAlbums.filter((a) => favAlbums[a.id]), [favAlbums]);
  const artists = useMemo(() => allArtists.filter((a) => favArtists[a.id]), [favArtists]);

  return (
    <div className="px-8 pb-24 pt-8" data-testid="favorites-view">
      <h1 className="mb-6 text-2xl font-black tracking-tight text-[var(--fg)]">Favorites</h1>
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
        (songs.length > 0 ? (
          <SongTable songs={songs} columns={["tracknum", "title", "artist", "album", "duration", "fav"]} />
        ) : (
          <div className="flex flex-col items-center gap-2 py-20 text-[var(--fg-dim)]">
            <Heart size={28} />
            <span className="text-[13.5px]">Songs you favorite will appear here</span>
          </div>
        ))}

      {tab === "Albums" &&
        (albums.length > 0 ? (
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
        (artists.length > 0 ? (
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
