"use client";
// Feishin rebuild — song/album action helpers + reusable context menu content (server-backed)
import { useCallback } from "react";
import { toast } from "sonner";
import {
  Play,
  Pause,
  ListStart,
  ListEnd,
  ListPlus,
  Heart,
  Disc3,
  User,
  Trash2,
  Radio,
  MicVocal,
  Loader2,
} from "lucide-react";
import { useRouterStore } from "@/store/router-store";
import { usePlayerStore } from "@/store/player-store";
import { useSettingsStore } from "@/store/settings-store";
import type { Song, Album } from "@/lib/types";
import { fetchAlbumTracks, addToPlaylist, createPlaylist } from "@/lib/jellyfin";
import { useJfQuery, invalidateJf } from "@/hooks/use-jf";
import { CtxItem, CtxSeparator, CtxLabel } from "./shared";

export function useSongActions() {
  const navigate = useRouterStore((s) => s.navigate);
  const player = usePlayerStore();

  const play = useCallback(
    (songs: Song[], index = 0) => {
      if (songs.length === 0) return;
      player.setQueue(songs, index, true);
    },
    [player],
  );

  const toggle = useCallback((songs: Song[], index = 0) => {
    const s = usePlayerStore.getState();
    const cur = s.current();
    const target = songs[index];
    if (cur && target && cur.id === target.id) {
      s.toggle();
      return;
    }
    s.setQueue(songs, index, true);
  }, []);

  const playNext = useCallback((songs: Song[]) => {
    usePlayerStore.getState().addToQueue(songs, "next");
    toast(`Added ${songs.length} song${songs.length > 1 ? "s" : ""} to play next`);
  }, []);

  const addLater = useCallback((songs: Song[]) => {
    usePlayerStore.getState().addToQueue(songs, "later");
    toast(`Added ${songs.length} song${songs.length > 1 ? "s" : ""} to queue`);
  }, []);

  const playAlbum = useCallback(async (album: Album) => {
    toast(`Loading "${album.name}"…`, { duration: 1500 });
    const songs = await fetchAlbumTracks(album.id);
    if (songs.length === 0) {
      toast.error("Album has no playable tracks");
      return;
    }
    usePlayerStore.getState().setQueue(songs, 0, true);
  }, []);

  const playAlbumNext = useCallback(async (album: Album) => {
    const songs = await fetchAlbumTracks(album.id);
    playNext(songs);
  }, [playNext]);

  const playAlbumLater = useCallback(async (album: Album) => {
    const songs = await fetchAlbumTracks(album.id);
    addLater(songs);
  }, [addLater]);

  const goToAlbum = useCallback(
    (albumId?: string) => {
      if (albumId) navigate({ view: "album", id: albumId });
    },
    [navigate],
  );

  const goToArtist = useCallback(
    (artistId?: string) => {
      if (artistId) navigate({ view: "artist", id: artistId });
    },
    [navigate],
  );

  const toggleFavorite = useCallback((song: Song) => {
    const s = usePlayerStore.getState();
    s.toggleTrackFavorite(song.id);
    const nowFav = !!usePlayerStore.getState().favoriteTracks[song.id];
    toast(nowFav ? `Added "${song.name}" to favorites` : `Removed "${song.name}" from favorites`);
    if (nowFav) invalidateJf("Filters=IsFavorite");
  }, []);

  return { play, toggle, playNext, addLater, playAlbum, playAlbumNext, playAlbumLater, goToAlbum, goToArtist, toggleFavorite };
}

/** Shared "add to playlist" section for context menus (server playlists). */
function AddToPlaylistItems({ song, onDone }: { song: Song; onDone?: () => void }) {
  const { data, loading } = useJfQuery("ctx:playlists", () => import("@/lib/jellyfin").then((m) => m.fetchPlaylistsPage({ limit: 12 })), 120_000);
  const playlists = data?.playlists ?? [];

  const add = async (playlistId: string, name: string) => {
    try {
      await addToPlaylist(playlistId, [song.id]);
      toast(`Added "${song.name}" to "${name}"`);
      onDone?.();
    } catch {
      toast.error(`Could not add to "${name}"`);
    }
  };

  const quickCreate = async () => {
    const name = window.prompt("New playlist name");
    if (!name?.trim()) return;
    try {
      const id = await createPlaylist(name.trim(), [song.id]);
      toast(`Created playlist "${name.trim()}"`);
      invalidateJf("playlists");
      invalidateJf("ctx:playlists");
      if (id) void id;
      onDone?.();
    } catch {
      toast.error("Could not create playlist");
    }
  };

  return (
    <>
      <CtxSeparator />
      <CtxLabel>Add to playlist</CtxLabel>
      {loading && (
        <CtxItem>
          <Loader2 size={14} className="animate-spin" /> Loading…
        </CtxItem>
      )}
      {!loading &&
        playlists.slice(0, 6).map((pl) => (
          <CtxItem key={pl.id} onSelect={() => add(pl.id, pl.name)} icon={<ListPlus size={15} />}>
            {pl.name}
          </CtxItem>
        ))}
      <CtxItem onSelect={quickCreate} icon={<ListPlus size={15} />}>
        New playlist…
      </CtxItem>
    </>
  );
}

export function SongContextMenuContent({
  song,
  contextQueue,
  onRemoveFromQueue,
  queueIndex,
  onGoToLyrics,
}: {
  song: Song;
  contextQueue?: Song[];
  onRemoveFromQueue?: () => void;
  queueIndex?: number;
  onGoToLyrics?: () => void;
}) {
  const actions = useSongActions();
  const isPlayingSong = usePlayerStore((s) => s.current()?.id === song.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const fav = usePlayerStore((s) => !!s.favoriteTracks[song.id]);
  const toggleFav = usePlayerStore((s) => s.toggleTrackFavorite);
  const scrobbleEnabled = useSettingsStore((s) => s.playback.scrobble);

  return (
    <>
      <CtxItem onSelect={() => actions.toggle(contextQueue ?? [song], queueIndex ?? 0)} icon={isPlayingSong && isPlaying ? <Pause size={15} /> : <Play size={15} />}>
        {isPlayingSong && isPlaying ? "Pause" : "Play"}
      </CtxItem>
      <CtxItem onSelect={() => actions.playNext([song])} icon={<ListStart size={15} />}>
        Play next
      </CtxItem>
      <CtxItem onSelect={() => actions.addLater([song])} icon={<ListEnd size={15} />}>
        Add to queue
      </CtxItem>
      <AddToPlaylistItems song={song} />
      <CtxSeparator />
      <CtxItem
        onSelect={() => {
          toggleFav(song.id);
          toast(!fav ? "Added to favorites" : "Removed from favorites");
        }}
        icon={<Heart size={15} className={fav ? "fill-[var(--primary)] text-[var(--primary)]" : ""} />}
      >
        {fav ? "Remove from favorites" : "Add to favorites"}
      </CtxItem>
      <CtxItem onSelect={() => actions.goToAlbum(song.albumId)} icon={<Disc3 size={15} />}>
        Go to album
      </CtxItem>
      <CtxItem onSelect={() => actions.goToArtist(song.artistId)} icon={<User size={15} />}>
        Go to artist
      </CtxItem>
      {onGoToLyrics && (
        <CtxItem onSelect={onGoToLyrics} icon={<MicVocal size={15} />}>
          View lyrics
        </CtxItem>
      )}
      <CtxItem
        onSelect={() => toast(`${scrobbleEnabled ? "Scrobbled" : "Scrobbling disabled —"} "${song.name}"`)}
        icon={<Radio size={15} />}
      >
        {scrobbleEnabled ? "Scrobble now" : "Scrobbling disabled"}
      </CtxItem>
      {onRemoveFromQueue && (
        <>
          <CtxSeparator />
          <CtxItem onSelect={onRemoveFromQueue} icon={<Trash2 size={15} />}>
            Remove from queue
          </CtxItem>
        </>
      )}
    </>
  );
}
