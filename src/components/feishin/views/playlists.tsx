"use client";
// Feishin rebuild — playlists routes (list + detail), backed by Jellyfin playlists
import { useEffect, useState } from "react";
import { Play, MoreHorizontal, ListPlus, Trash2, Pencil } from "lucide-react";
import {
  fetchPlaylistsPage,
  fetchPlaylistItems,
  fetchPlaylistDetail,
  deletePlaylist,
  renamePlaylist,
  removeFromPlaylist,
} from "@/lib/jellyfin";
import type { Playlist, Song } from "@/lib/types";
import { useJfQuery, invalidateJf } from "@/hooks/use-jf";
import { useRouterStore } from "@/store/router-store";
import { ItemImage, CtxItem, CtxSeparator } from "../shared";
import { SongTable } from "../song-table";
import { useSongActions } from "../song-actions";
import { CreatePlaylistDialog } from "../dialogs";
import { DropdownMenuNS as DropdownMenu } from "@/components/ui/dropdown-menu";
import { ContextMenuNS as ContextMenu } from "@/components/ui/context-menu";
import { toast } from "sonner";
import { formatLongDuration } from "@/lib/format";

const PLAYLIST_PAGE = 40;

export function PlaylistsView() {
  const navigate = useRouterStore((s) => s.navigate);
  const [createOpen, setCreateOpen] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [accumulated, setAccumulated] = useState<Playlist[]>([]);

  const { data, loading } = useJfQuery(
    `playlists:page:${pagesLoaded}`,
    () => fetchPlaylistsPage({ startIndex: (pagesLoaded - 1) * PLAYLIST_PAGE, limit: PLAYLIST_PAGE }),
    60_000,
  );

  // merge pages
  useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const merged = [...prev];
      for (const p of data.playlists) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          merged.push(p);
        }
      }
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const total = data?.total ?? 0;

  return (
    <div className="px-8 pb-24 pt-8" data-testid="playlists-view">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-black tracking-tight text-[var(--fg)]">Playlists</h1>
          {total > 0 && <span className="text-[13px] text-[var(--fg-dim)]">{total.toLocaleString()}</span>}
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className="fs-pill !px-4 !py-2">
          <ListPlus size={15} />
          New playlist
        </button>
      </div>

      {loading && accumulated.length === 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-square w-full animate-pulse rounded-[4px] bg-[var(--elevated)]" />
              <div className="mt-2 h-3.5 w-3/4 animate-pulse rounded bg-[var(--elevated)]" />
            </div>
          ))}
        </div>
      ) : accumulated.length === 0 ? (
        <div className="py-16 text-center text-[13.5px] text-[var(--fg-dim)]">No playlists on the server yet</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {accumulated.map((pl) => (
              <ContextMenu.Root key={pl.id}>
                <ContextMenu.Trigger asChild>
                  <div className="group cursor-pointer" onClick={() => navigate({ view: "playlist", id: pl.id })}>
                    <ItemImage
                      src={pl.coverUrl}
                      alt={`${pl.name} cover`}
                      className="aspect-square w-full"
                    />
                    <div className="mt-2 truncate text-[13.5px] font-bold text-[var(--fg)]">{pl.name}</div>
                    <div className="truncate text-[12.5px] text-[var(--fg-dim)]">
                      {pl.trackCount} tracks · {formatLongDuration(pl.duration)}
                    </div>
                  </div>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content className="fs-menu-content">
                    <CtxItem onSelect={() => navigate({ view: "playlist", id: pl.id })}>Open</CtxItem>
                    <CtxSeparator />
                    <CtxItem
                      onSelect={async () => {
                        try {
                          await deletePlaylist(pl.id);
                          toast(`Deleted "${pl.name}"`);
                          invalidateJf("playlists");
                          setAccumulated((prev) => prev.filter((p) => p.id !== pl.id));
                        } catch {
                          toast.error(`Could not delete "${pl.name}"`);
                        }
                      }}
                      icon={<Trash2 size={15} />}
                    >
                      Delete
                    </CtxItem>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            ))}
          </div>
          {pagesLoaded * PLAYLIST_PAGE < total && (
            <div className="flex justify-center py-4">
              <button type="button" className="fs-pill !py-2 text-[13px]" disabled={loading} onClick={() => setPagesLoaded((p) => p + 1)}>
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
      <CreatePlaylistDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export function PlaylistDetailView({ playlistId }: { playlistId: string }) {
  const detailQ = useJfQuery(`playlist:${playlistId}`, () => fetchPlaylistDetail(playlistId), 5 * 60_000);
  const itemsQ = useJfQuery(`playlist:${playlistId}:items`, () => fetchPlaylistItems(playlistId), 60_000);
  const actions = useSongActions();
  const navigate = useRouterStore((s) => s.navigate);
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");

  const pl: Playlist | undefined = detailQ.data ?? undefined;
  const songs: Song[] = itemsQ.data ?? [];

  if (detailQ.loading && !pl) {
    return (
      <div className="px-8 pb-24 pt-10">
        <div className="flex items-end gap-6">
          <div className="h-[210px] w-[210px] shrink-0 animate-pulse rounded-[4px] bg-[var(--elevated)]" />
          <div className="flex-1 space-y-3 pb-2">
            <div className="h-10 w-1/2 animate-pulse rounded bg-[var(--elevated)]" />
            <div className="h-3.5 w-1/4 animate-pulse rounded bg-[var(--elevated)]" />
          </div>
        </div>
      </div>
    );
  }

  if (!pl) {
    return <div className="p-8 text-[var(--fg-dim)]">Playlist not found</div>;
  }

  const displayName = pl.name;
  const totalDuration = songs.reduce((n, s) => n + s.duration, 0);
  const cover = pl.coverUrl || songs[0]?.albumCoverUrl;

  return (
    <div className="pb-24" data-testid="playlist-detail">
      <div className="relative overflow-hidden px-8 pb-6 pt-10">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background: "radial-gradient(120% 140% at 20% 0%, rgba(55,116,252,0.25) 0%, transparent 70%)",
          }}
        />
        <div className="relative flex items-end gap-6">
          <ItemImage src={cover} alt={`${displayName} cover`} className="h-[210px] w-[210px] shadow-[0_12px_36px_rgba(0,0,0,0.55)]" />
          <div className="flex min-w-0 flex-1 flex-col justify-end pb-1">
            <div className="fs-title-xs mb-1">Playlist</div>
            {renaming ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={async () => {
                  if (name.trim() && name.trim() !== displayName) {
                    try {
                      await renamePlaylist(playlistId, name.trim());
                      toast(`Renamed to "${name.trim()}"`);
                      invalidateJf("playlists");
                      invalidateJf(`playlist:${playlistId}`);
                    } catch {
                      toast.error("Rename failed");
                    }
                  }
                  setRenaming(false);
                }}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    if (name.trim() && name.trim() !== displayName) {
                      try {
                        await renamePlaylist(playlistId, name.trim());
                        toast(`Renamed to "${name.trim()}"`);
                        invalidateJf("playlists");
                        invalidateJf(`playlist:${playlistId}`);
                      } catch {
                        toast.error("Rename failed");
                      }
                    }
                    setRenaming(false);
                  }
                }}
                className="fs-input mb-1 w-[420px] px-2 py-1 text-[30px] font-black"
              />
            ) : (
              <h1 className="mb-1.5 truncate text-[38px] font-black leading-tight tracking-tight text-[var(--fg)]">
                {displayName}
              </h1>
            )}
            <div className="text-[13px] text-[var(--fg-dim)]">
              {(itemsQ.data?.length ?? pl.trackCount)} tracks · {formatLongDuration(totalDuration)}
            </div>
          </div>
          <div className="flex items-center gap-2 self-end pb-1">
            <button type="button" className="fs-pill" onClick={() => actions.play(songs, 0)} disabled={songs.length === 0}>
              <Play size={15} className="fill-current" />
              Play
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button type="button" aria-label="Playlist options" className="fs-icon-btn p-2">
                  <MoreHorizontal size={18} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" className="fs-menu-content">
                  <DropdownMenu.Item
                    className="flex cursor-pointer rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
                    onSelect={() => {
                      setName(displayName);
                      setRenaming(true);
                    }}
                  >
                    <Pencil size={14} />
                    Rename
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="flex cursor-pointer rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
                    onSelect={async () => {
                      try {
                        await deletePlaylist(playlistId);
                        toast(`Deleted "${displayName}"`);
                        invalidateJf("playlists");
                        navigate({ view: "playlists" });
                      } catch {
                        toast.error("Delete failed");
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    Delete playlist
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>
      <div className="px-8">
        {itemsQ.loading && songs.length === 0 ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-[52px] animate-pulse rounded-[4px] bg-[var(--elevated)]" />
            ))}
          </div>
        ) : (
          <SongTable
            songs={songs}
            queueContext={songs}
            allowRemove
            onRemove={async (song: Song) => {
              try {
                // Jellyfin removal uses the PlaylistItemIds entry id from the items response
                await removeFromPlaylist(playlistId, [song.playlistEntryId ?? song.id]);
                toast(`Removed "${song.name}" from "${displayName}"`);
                invalidateJf(`playlist:${playlistId}`);
              } catch {
                toast.error(`Could not remove "${song.name}"`);
              }
            }}
          />
        )}
      </div>
      <CreatePlaylistDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
