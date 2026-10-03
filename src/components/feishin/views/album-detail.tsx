"use client";
// Feishin rebuild — album detail route (hero header + track table, faithful to feishin album page)
import { useEffect, useMemo, useState } from "react";
import { Play, SkipForward, FastForward, MoreHorizontal } from "lucide-react";
import { fetchAlbum, fetchAlbumTracks } from "@/lib/jellyfin";
import type { Album, Song } from "@/lib/types";
import { formatLongDuration, extractDominantColor } from "@/lib/format";
import { useJfQuery } from "@/hooks/use-jf";
import { useRouterStore } from "@/store/router-store";
import { usePlayerStore } from "@/store/player-store";
import { ItemImage, RatingStars, FavoriteHeart, Kebab } from "../shared";
import { SongTable } from "../song-table";
import { useSongActions } from "../song-actions";
import { DropdownMenuNS as DropdownMenu } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const FALLBACK_COLOR: [number, number, number] = [70, 78, 96];

export function AlbumDetailView({ albumId }: { albumId: string }) {
  const navigate = useRouterStore((s) => s.navigate);
  const actions = useSongActions();
  const currentSong = usePlayerStore((s) => s.queue[s.currentIndex]);

  const albumQ = useJfQuery(`album:${albumId}`, () => fetchAlbum(albumId), 10 * 60_000);
  const tracksQ = useJfQuery(`album:${albumId}:tracks`, () => fetchAlbumTracks(albumId), 5 * 60_000);
  const album = albumQ.data ?? undefined;
  const songs: Song[] = useMemo(() => tracksQ.data ?? [], [tracksQ.data]);
  const fav = usePlayerStore((s) => (album ? !!s.favoriteAlbums[album.id] : false));

  const [color, setColor] = useState<[number, number, number]>(FALLBACK_COLOR);
  useEffect(() => {
    if (!album) return;
    let cancelled = false;
    extractDominantColor(album.coverUrl).then((c) => {
      if (!cancelled && c) setColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [album]);

  if (albumQ.loading) {
    return (
      <div className="px-8 pb-24 pt-8" data-testid="album-detail-loading">
        <div className="flex items-end gap-6">
          <div className="h-[210px] w-[210px] shrink-0 animate-pulse rounded-[4px] bg-[var(--elevated)]" />
          <div className="flex-1 space-y-3 pb-2">
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--elevated)]" />
            <div className="h-10 w-2/3 animate-pulse rounded bg-[var(--elevated)]" />
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-[var(--elevated)]" />
          </div>
        </div>
      </div>
    );
  }

  if (!album) {
    return <div className="p-8 text-[var(--fg-dim)]">Album not found</div>;
  }

  const isPlayingHere = currentSong && songs.some((s) => s.id === currentSong.id);

  // hero background gradient from album cover color
  const [r, g, b] = color;

  return (
    <div className="pb-24" data-testid="album-detail">
      {/* hero */}
      <div className="relative overflow-hidden px-8 pb-6 pt-8">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background: `radial-gradient(120% 140% at 20% 0%, rgba(${r},${g},${b},0.5) 0%, rgba(${Math.round(r * 0.4)},${Math.round(g * 0.4)},${Math.round(b * 0.4)},0.35) 45%, transparent 75%)`,
          }}
        />
        <div className="relative flex items-end gap-6">
          <ItemImage
            src={album.coverUrl}
            alt={`${album.name} cover`}
            className="h-[210px] w-[210px] shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
          />
          <div className="flex min-w-0 flex-1 flex-col justify-end pb-1">
            <div className="fs-title-xs mb-1">Album</div>
            <h1 className="mb-1.5 truncate text-[38px] font-black leading-tight tracking-tight text-[var(--fg)]">
              {album.name}
            </h1>
            <div className="mb-2 text-[13px] text-[var(--fg-dim)]">
              {album.trackCount || songs.length} tracks · {formatLongDuration(album.duration || songs.reduce((n, s) => n + s.duration, 0))} ·{" "}
              {album.playCount.toLocaleString()} plays
            </div>
            <button
              type="button"
              onClick={() => navigate({ view: "artist", id: album.artistId })}
              className="w-fit text-[14px] font-bold text-[var(--primary)] hover:underline"
            >
              {album.artistName}
            </button>
          </div>
          <div className="flex flex-col items-end gap-3 self-end pb-1">
            <div className="flex items-center gap-3">
              <RatingStars value={album.rating} onChange={(v) => toast(`Rated ${v || "0"} stars`, { duration: 1200 })} />
              <FavoriteHeart
                isFavorite={fav}
                onToggle={() => {
                  usePlayerStore.getState().toggleAlbumFavorite(album.id);
                  toast(!fav ? "Added to favorites" : "Removed from favorites");
                }}
              />
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button type="button" aria-label="Album options" className="fs-icon-btn p-1">
                    <Kebab />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" className="fs-menu-content">
                    <DropdownMenu.Item
                      className="flex cursor-pointer rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
                      onSelect={() => {
                        actions.addLater(songs);
                      }}
                    >
                      Add to queue
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="flex cursor-pointer rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
                      onSelect={() => navigate({ view: "artist", id: album.artistId })}
                    >
                      Go to artist
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="fs-pill" onClick={() => actions.play(songs, 0)}>
                <Play size={15} className="fill-current" />
                Play
              </button>
              <button
                type="button"
                className="fs-pill"
                onClick={() => {
                  if (isPlayingHere) {
                    actions.play(songs, Math.min(songs.length - 1, songs.findIndex((s) => s.id === currentSong!.id) + 1));
                  } else {
                    actions.play(songs, 0);
                  }
                }}
              >
                {isPlayingHere ? <FastForward size={15} /> : <SkipForward size={15} />}
                Next
              </button>
              <button type="button" className="fs-pill" onClick={() => actions.play(songs, songs.length - 1)}>
                <FastForward size={15} />
                Last
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* track table */}
      <div className="px-8">
        {tracksQ.loading ? (
          <div className="flex flex-col gap-2 pt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[52px] animate-pulse rounded-[4px] bg-[var(--elevated)]" />
            ))}
          </div>
        ) : (
          <SongTable songs={songs} queueContext={songs} />
        )}
      </div>
    </div>
  );
}
