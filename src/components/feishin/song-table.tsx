"use client";
// Feishin rebuild — song table (feishin's virtualized item table: # / TITLE / ... / duration / heart)
import { useMemo, useState } from "react";
import { Clock, Heart, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Song } from "@/lib/types";
import { usePlayerStore } from "@/store/player-store";
import { formatDuration } from "@/lib/library";
import { ItemImage, FavoriteHeart } from "./shared";
import { ContextMenuNS as ContextMenu } from "@/components/ui/context-menu";
import { SongContextMenuContent } from "./song-actions";
import { useSongActions } from "./song-actions";
import { useRouterStore } from "@/store/router-store";

export type SongColumn = "tracknum" | "title" | "artist" | "album" | "genre" | "year" | "plays" | "duration" | "fav";

export const DEFAULT_COLUMNS: SongColumn[] = ["tracknum", "title", "artist", "album", "genre", "year", "plays", "duration", "fav"];

const COLUMN_LABELS: Record<SongColumn, string> = {
  tracknum: "#",
  title: "TITLE",
  artist: "ARTIST",
  album: "ALBUM",
  genre: "GENRE",
  year: "YEAR",
  plays: "PLAYS",
  duration: "",
  fav: "",
};

export function SongTable({
  songs,
  columns = DEFAULT_COLUMNS,
  showSearch = true,
  showCoverArt = true,
  queueContext,
  onRemoveFromQueue,
  allowRemove = false,
  onRemove,
  compact = false,
}: {
  songs: Song[];
  columns?: SongColumn[];
  showSearch?: boolean;
  showCoverArt?: boolean;
  queueContext?: Song[];
  onRemoveFromQueue?: (index: number) => void;
  allowRemove?: boolean;
  onRemove?: (song: Song) => void;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ col: SongColumn; dir: "asc" | "desc" } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const currentSong = usePlayerStore((s) => s.queue[s.currentIndex]);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const favMap = usePlayerStore((s) => s.favoriteTracks);
  const toggleFav = usePlayerStore((s) => s.toggleTrackFavorite);
  const actions = useSongActions();
  const navigate = useRouterStore((s) => s.navigate);
  const playCounts = usePlayerStore((s) => s.localPlayCounts);

  const contextQueue = useMemo(() => queueContext ?? songs, [queueContext, songs]);

  const visibleSongs = useMemo(() => {
    let arr = filter
      ? songs.filter(
          (s) =>
            s.name.toLowerCase().includes(filter.toLowerCase()) ||
            s.artist.toLowerCase().includes(filter.toLowerCase()) ||
            s.album.toLowerCase().includes(filter.toLowerCase()),
        )
      : songs;
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      arr = [...arr].sort((a, b) => {
        switch (sort.col) {
          case "title":
            return a.name.localeCompare(b.name) * dir;
          case "artist":
            return a.artist.localeCompare(b.artist) * dir;
          case "album":
            return a.album.localeCompare(b.album) * dir;
          case "genre":
            return (a.genre ?? "").localeCompare(b.genre ?? "") * dir;
          case "year":
            return ((a.year ?? 0) - (b.year ?? 0)) * dir;
          case "plays":
            return (((a.playCount ?? 0) + (playCounts[a.id] ?? 0)) - ((b.playCount ?? 0) + (playCounts[b.id] ?? 0))) * dir;
          case "duration":
            return (a.duration - b.duration) * dir;
          case "tracknum":
            return ((a.trackNumber ?? 0) - (b.trackNumber ?? 0)) * dir;
          default:
            return 0;
        }
      });
    }
    return arr;
  }, [songs, filter, sort, playCounts]);

  const headerButton = (col: SongColumn) => {
    const active = sort?.col === col;
    return (
      <button
        type="button"
        className={cn(
          "flex items-center gap-1 text-[11px] font-bold tracking-[0.08em] uppercase",
          active ? "text-[var(--primary)]" : "text-[var(--fg-dim)] hover:text-[var(--fg)]",
        )}
        onClick={() =>
          setSort((s) => (s?.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }))
        }
      >
        {COLUMN_LABELS[col]}
        {active && <span className="text-[9px]">{sort?.dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    );
  };

  return (
    <div className="flex flex-col" data-testid="song-table">
      {showSearch && (
        <div className="mb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search"
              aria-label="Filter songs"
              className="fs-input h-10 w-full pl-9 pr-3 text-[13px]"
            />
          </div>
        </div>
      )}

      <div className="min-w-full overflow-x-auto">
        <div className="min-w-[860px]">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2">
          {columns.map((col, i) => {
            if (col === "tracknum") return <div key={i} className="w-8 shrink-0 text-center">{headerButton(col)}</div>;
            if (col === "title") return <div key={i} className="min-w-0 flex-1">{headerButton(col)}</div>;
            if (col === "artist") return <div key={i} className="w-[180px] shrink-0">{headerButton(col)}</div>;
            if (col === "album") return <div key={i} className="w-[180px] shrink-0">{headerButton(col)}</div>;
            if (col === "genre") return <div key={i} className="w-[110px] shrink-0">{headerButton(col)}</div>;
            if (col === "year") return <div key={i} className="w-[60px] shrink-0">{headerButton(col)}</div>;
            if (col === "plays") return <div key={i} className="w-[70px] shrink-0 text-right">{headerButton(col)}</div>;
            if (col === "duration")
              return (
                <div key={i} className="w-[54px] shrink-0 text-[var(--fg-dim)]">
                  <Clock size={14} className="ml-auto" />
                </div>
              );
            if (col === "fav") return <div key={i} className="w-[40px] shrink-0" />;
            return null;
          })}
          {allowRemove && <div className="w-8 shrink-0" />}
        </div>

        {/* rows */}
        <div>
          {visibleSongs.map((song) => {
            const isCurrent = currentSong?.id === song.id;
            const isFav = !!favMap[song.id];
            return (
              <ContextMenu.Root key={song.id}>
                <ContextMenu.Trigger asChild>
                  <div
                    className="fs-row flex cursor-default items-center gap-3 border-b border-[var(--border)]/40 px-3"
                    style={{ height: compact ? 44 : 52 }}
                    data-playing={isCurrent}
                    data-selected={selectedId === song.id}
                    onClick={() => setSelectedId(song.id)}
                    onDoubleClick={() => actions.play(contextQueue, contextQueue.findIndex((s) => s.id === song.id))}
                    data-testid="song-row"
                  >
                    {columns.map((col, i) => {
                      switch (col) {
                        case "tracknum":
                          return (
                            <button
                              key={i}
                              type="button"
                              aria-label={`Play ${song.name}`}
                              onClick={() => actions.toggle(contextQueue, contextQueue.findIndex((s) => s.id === song.id))}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] text-[12px] tabular-nums text-[var(--fg-dim)] hover:bg-[var(--elevated)] hover:text-[var(--fg)]"
                            >
                              {isCurrent && isPlaying ? (
                                <span className="fs-eq" aria-label="Playing">
                                  <span /><span /><span />
                                </span>
                              ) : (
                                <>
                                  <span className="group-hover:hidden">{song.trackNumber ?? "-"}</span>
                                </>
                              )}
                            </button>
                          );
                        case "title":
                          return (
                            <div key={i} className="flex min-w-[180px] flex-1 items-center gap-3">
                              {showCoverArt && (
                                <ItemImage src={song.albumCoverUrl} alt={`${song.album} cover`} className="h-9 w-9" />
                              )}
                              <span className="fs-track-title truncate text-[13.5px] font-semibold text-[var(--fg)]">
                                {song.name}
                              </span>
                            </div>
                          );
                        case "artist":
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => actions.goToArtist(song.artistId)}
                              className="w-[180px] shrink-0 truncate text-left text-[13px] text-[var(--fg-dim)] hover:text-[var(--fg)] hover:underline"
                            >
                              {song.artist}
                            </button>
                          );
                        case "album":
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => actions.goToAlbum(song.albumId)}
                              className="w-[180px] shrink-0 truncate text-left text-[13px] text-[var(--fg-dim)] hover:text-[var(--fg)] hover:underline"
                            >
                              {song.album}
                            </button>
                          );
                        case "genre":
                          return (
                            <span key={i} className="w-[110px] shrink-0 truncate text-[13px] text-[var(--fg-dim)]">
                              {song.genre}
                            </span>
                          );
                        case "year":
                          return (
                            <span key={i} className="w-[60px] shrink-0 text-[13px] tabular-nums text-[var(--fg-dim)]">
                              {song.year}
                            </span>
                          );
                        case "plays":
                          return (
                            <span key={i} className="w-[70px] shrink-0 text-right text-[12.5px] tabular-nums text-[var(--fg-dim)]">
                              {(song.playCount ?? 0) + (playCounts[song.id] ?? 0)}
                            </span>
                          );
                        case "duration":
                          return (
                            <span key={i} className="w-[54px] shrink-0 text-right text-[12.5px] tabular-nums text-[var(--fg-dim)]">
                              {formatDuration(song.duration)}
                            </span>
                          );
                        case "fav":
                          return (
                            <div key={i} className="flex w-[40px] shrink-0 justify-end">
                              <FavoriteHeart isFavorite={isFav} onToggle={() => {
                                toggleFav(song.id);
                              }} />
                            </div>
                          );
                        default:
                          return null;
                      }
                    })}
                    {allowRemove && (
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => (onRemoveFromQueue ? onRemoveFromQueue(songs.indexOf(song)) : onRemove?.(song))}
                        className="w-8 shrink-0 text-center text-[var(--fg-dim)] hover:text-[var(--fg)]"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content className="fs-menu-content">
                    <SongContextMenuContent
                      song={song}
                      contextQueue={contextQueue}
                      onGoToLyrics={() => navigate({ view: "now-playing" })}
                    />
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            );
          })}
          {visibleSongs.length === 0 && (
            <div className="py-10 text-center text-[13px] text-[var(--fg-dim)]">No results</div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
