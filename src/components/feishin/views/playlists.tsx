"use client";
// Feishin rebuild — playlists routes (list + detail)
import { useMemo, useState } from "react";
import { Play, MoreHorizontal, ListPlus, Trash2, Pencil, Clock } from "lucide-react";
import {
  getTracksByPlaylist,
  getPlaylist,
  trackToSong,
  formatLongDuration,
  allPlaylists as manifestPlaylists,
} from "@/lib/library";
import { usePlaylistsStore } from "@/store/playlists-store";
import { useRouterStore } from "@/store/router-store";
import { ItemImage, CtxItem, CtxSeparator } from "../shared";
import { SongTable } from "../song-table";
import { useSongActions } from "../song-actions";
import { CreatePlaylistDialog } from "../dialogs";
import { DropdownMenuNS as DropdownMenu } from "@/components/ui/dropdown-menu";
import { ContextMenuNS as ContextMenu } from "@/components/ui/context-menu";
import { toast } from "sonner";
import type { Song } from "@/lib/types";

export function PlaylistsView() {
  const navigate = useRouterStore((s) => s.navigate);
  const userPlaylists = usePlaylistsStore((s) => s.playlists);
  const removePlaylist = usePlaylistsStore((s) => s.remove);
  const [createOpen, setCreateOpen] = useState(false);

  const items = [
    ...userPlaylists.map((p) => ({
      id: p.id,
      name: p.name,
      trackIds: p.trackIds,
      coverUrl: undefined as string | undefined,
      duration: p.trackIds.length * 115,
      user: true,
    })),
    ...manifestPlaylists.map((p) => ({ ...p, user: false })),
  ];

  return (
    <div className="px-8 pb-24 pt-8" data-testid="playlists-view">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight text-[var(--fg)]">Playlists</h1>
        <button type="button" onClick={() => setCreateOpen(true)} className="fs-pill !px-4 !py-2">
          <ListPlus size={15} />
          New playlist
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {items.map((pl) => (
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
                  {pl.trackIds.length} tracks · {formatLongDuration(pl.duration)}
                </div>
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className="fs-menu-content">
                <CtxItem onSelect={() => navigate({ view: "playlist", id: pl.id })}>Open</CtxItem>
                {pl.user && (
                  <>
                    <CtxSeparator />
                    <CtxItem
                      onSelect={() => {
                        removePlaylist(pl.id);
                        toast(`Deleted "${pl.name}"`);
                      }}
                      icon={<Trash2 size={15} />}
                    >
                      Delete
                    </CtxItem>
                  </>
                )}
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ))}
      </div>
      <CreatePlaylistDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export function PlaylistDetailView({ playlistId }: { playlistId: string }) {
  const userPl = usePlaylistsStore((s) => s.playlists.find((p) => p.id === playlistId));
  const manifestPl = getPlaylist(playlistId);
  const removePlaylist = usePlaylistsStore((s) => s.remove);
  const removeTrack = usePlaylistsStore((s) => s.removeTrack);
  const navigate = useRouterStore((s) => s.navigate);
  const actions = useSongActions();
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const rename = usePlaylistsStore((s) => s.rename);

  const tracks = useMemo(() => {
    if (userPl) {
      return userPl.trackIds.map((tid) => getTrack(tid)).filter(Boolean) as Track[];
    }
    if (manifestPl) return getTracksByPlaylist(manifestPl.id);
    return [];
  }, [userPl, manifestPl]);

  const songs = useMemo(() => tracks.map((t) => trackToSong(t, getAlbumCover(t.albumId))), [tracks]);

  if (!userPl && !manifestPl) {
    return <div className="p-8 text-[var(--fg-dim)]">Playlist not found</div>;
  }

  const displayName = userPl?.name ?? manifestPl!.name;
  const totalDuration = songs.reduce((n, s) => n + s.duration, 0);
  const cover = manifestPl?.coverUrl ?? songs[0]?.albumCoverUrl;

  return (
    <div className="pb-24" data-testid="playlist-detail">
      <div className="relative overflow-hidden px-8 pb-6 pt-10">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background:
              manifestPl
                ? `radial-gradient(120% 140% at 20% 0%, rgba(${manifestPl.color.join(",")},0.5) 0%, transparent 70%)`
                : "radial-gradient(120% 140% at 20% 0%, rgba(55,116,252,0.25) 0%, transparent 70%)",
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
                onBlur={() => {
                  if (userPl && name.trim()) rename(userPl.id, name.trim());
                  setRenaming(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (userPl && name.trim()) rename(userPl.id, name.trim());
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
              {songs.length} tracks · {formatLongDuration(totalDuration)}
            </div>
          </div>
          <div className="flex items-center gap-2 self-end pb-1">
            <button type="button" className="fs-pill" onClick={() => actions.play(songs, 0)} disabled={songs.length === 0}>
              <Play size={15} className="fill-current" />
              Play
            </button>
            {userPl && (
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
                      icon={<Pencil size={14} />}
                    >
                      Rename
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="flex cursor-pointer rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
                      onSelect={() => {
                        removePlaylist(userPl.id);
                        toast(`Deleted "${displayName}"`);
                        navigate({ view: "playlists" });
                      }}
                    >
                      Delete playlist
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
        </div>
      </div>
      <div className="px-8">
        <SongTable
          songs={songs}
          queueContext={songs}
          allowRemove={!!userPl}
          onRemove={(song: Song) => {
            if (userPl) {
              removeTrack(userPl.id, song.id);
              toast(`Removed "${song.name}" from "${displayName}"`);
            }
          }}
        />
      </div>
      <CreatePlaylistDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

// helper to resolve a track lazily
import { getTrack } from "@/lib/library";
import type { Track } from "@/lib/types";
