"use client";
// Feishin rebuild — album card (grid + carousel item, with playcount badge & hover play)
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Album } from "@/lib/types";
import { useRouterStore } from "@/store/router-store";
import { useSongActions } from "./song-actions";
import { getTracksByAlbum, trackToSong } from "@/lib/library";
import { ItemImage } from "./shared";

export function AlbumCard({
  album,
  badge,
  onPlay,
  width,
}: {
  album: Album;
  badge?: string;
  onPlay?: () => void;
  width?: string;
}) {
  const navigate = useRouterStore((s) => s.navigate);
  const actions = useSongActions();

  return (
    <div className={cn("group shrink-0", width ?? "w-[164px]")}>
      <div
        className="relative cursor-pointer overflow-hidden rounded-[4px]"
        onClick={() => navigate({ view: "album", id: album.id })}
        role="link"
        aria-label={`Open album ${album.name}`}
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && navigate({ view: "album", id: album.id })}
      >
        <ItemImage src={album.coverUrl} alt={`${album.name} cover`} className="aspect-square w-full" />
        {badge && (
          <span className="absolute right-1.5 top-1.5 min-w-[22px] rounded-[4px] bg-[var(--primary)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--primary-contrast)]">
            {badge}
          </span>
        )}
        <button
          type="button"
          aria-label={`Play ${album.name}`}
          onClick={(e) => {
            e.stopPropagation();
            if (onPlay) {
              onPlay();
            } else {
              const songs = getTracksByAlbum(album.id).map((t) => trackToSong(t, album.coverUrl));
              actions.play(songs, 0);
            }
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] shadow-lg">
            <Play size={22} className="ml-0.5 fill-[var(--primary-contrast)] text-[var(--primary-contrast)]" />
          </span>
        </button>
      </div>
      <button
        type="button"
        onClick={() => navigate({ view: "album", id: album.id })}
        className="mt-2 block w-full truncate text-left text-[13.5px] font-bold text-[var(--fg)] hover:underline"
      >
        {album.name}
      </button>
      <button
        type="button"
        onClick={() => navigate({ view: "artist", id: album.artistId })}
        className="block w-full truncate text-left text-[12.5px] text-[var(--fg-dim)] hover:text-[var(--fg)]"
      >
        {album.artistName}
      </button>
    </div>
  );
}
