"use client";
// Feishin rebuild — player store (queue + playback state, persisted)
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { RepeatMode, Song } from "@/lib/types";
import { setFavorite } from "@/lib/jellyfin";

interface PlayerState {
  queue: Song[];
  currentIndex: number;
  isPlaying: boolean;
  position: number;
  duration: number;
  seekTarget: number | null;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  favoriteTracks: Record<string, boolean>;
  favoriteAlbums: Record<string, boolean>;
  favoriteArtists: Record<string, boolean>;
  localPlayCounts: Record<string, number>;
  starredAt: Record<string, number>;
  // actions
  setQueue: (songs: Song[], startIndex?: number, autoplay?: boolean) => void;
  playSong: (song: Song, contextQueue?: Song[]) => void;
  playAt: (index: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  setPosition: (p: number) => void;
  setDuration: (d: number) => void;
  seek: (p: number) => void;
  clearSeek: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (songs: Song[], mode?: "next" | "later") => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  toggleTrackFavorite: (id: string) => void;
  toggleAlbumFavorite: (id: string) => void;
  toggleArtistFavorite: (id: string) => void;
  scrobble: (id: string) => void;
  getPlayCount: (id: string, base?: number) => number;
  current: () => Song | undefined;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      currentIndex: 0,
      isPlaying: false,
      position: 0,
      duration: 0,
      seekTarget: null,
      volume: 0.85,
      muted: false,
      shuffle: false,
      repeat: "off",
      favoriteTracks: {},
      favoriteAlbums: {},
      favoriteArtists: {},
      localPlayCounts: {},
      starredAt: {},

      current: () => {
        const s = get();
        return s.queue[s.currentIndex];
      },

      setQueue: (songs, startIndex = 0, autoplay = true) => {
        if (songs.length === 0) return;
        set({ queue: songs, currentIndex: Math.max(0, Math.min(startIndex, songs.length - 1)), isPlaying: autoplay, position: 0 });
      },

      playSong: (song, contextQueue) => {
        const q = contextQueue && contextQueue.length ? contextQueue : [song];
        const idx = Math.max(
          0,
          q.findIndex((s) => s.id === song.id),
        );
        set({ queue: q, currentIndex: idx, isPlaying: true, position: 0 });
      },

      playAt: (index) => {
        const s = get();
        if (index < 0 || index >= s.queue.length) return;
        set({ currentIndex: index, isPlaying: true, position: 0 });
      },

      play: () => {
        const s = get();
        if (s.queue.length === 0) return;
        set({ isPlaying: true });
      },

      pause: () => set({ isPlaying: false }),

      toggle: () => {
        const s = get();
        if (s.queue.length === 0) return;
        set({ isPlaying: !s.isPlaying });
      },

      stop: () => set({ isPlaying: false, position: 0 }),

      next: () => {
        const s = get();
        if (s.queue.length === 0) return;
        if (s.shuffle) {
          let idx = s.currentIndex;
          if (s.queue.length > 1) {
            while (idx === s.currentIndex) idx = Math.floor(Math.random() * s.queue.length);
          }
          set({ currentIndex: idx, isPlaying: true, position: 0 });
          return;
        }
        if (s.currentIndex < s.queue.length - 1) {
          set({ currentIndex: s.currentIndex + 1, isPlaying: true, position: 0 });
        } else if (s.repeat === "all") {
          set({ currentIndex: 0, isPlaying: true, position: 0 });
        } else {
          set({ isPlaying: false, position: 0 });
        }
      },

      previous: () => {
        const s = get();
        if (s.queue.length === 0) return;
        if (s.position > 3) {
          set({ position: 0, seekTarget: 0 });
          return;
        }
        if (s.currentIndex > 0) {
          set({ currentIndex: s.currentIndex - 1, isPlaying: true, position: 0 });
        } else {
          set({ position: 0, seekTarget: 0 });
        }
      },

      setPosition: (p) => set({ position: p }),
      setDuration: (d) => set({ duration: d }),
      seek: (p) => set({ seekTarget: p, position: p }),
      clearSeek: () => set({ seekTarget: null }),

      setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)), muted: false }),
      toggleMute: () => set((s) => ({ muted: !s.muted })),
      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
      cycleRepeat: () =>
        set((s) => ({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })),

      addToQueue: (songs, mode = "later") => {
        const s = get();
        if (s.queue.length === 0) {
          set({ queue: songs, currentIndex: 0 });
          return;
        }
        const insertAt = mode === "next" ? s.currentIndex + 1 : s.queue.length;
        const queue = [...s.queue];
        queue.splice(insertAt, 0, ...songs);
        set({ queue });
      },

      removeFromQueue: (index) => {
        const s = get();
        if (index === s.currentIndex) return; // don't remove playing song
        const queue = s.queue.filter((_, i) => i !== index);
        const currentIndex = index < s.currentIndex ? s.currentIndex - 1 : s.currentIndex;
        set({ queue, currentIndex });
      },

      clearQueue: () => set({ queue: [], currentIndex: 0, isPlaying: false, position: 0 }),

      toggleTrackFavorite: (id) =>
        set((s) => {
          const favoriteTracks = { ...s.favoriteTracks };
          const starredAt = { ...s.starredAt };
          const nowFav = !favoriteTracks[id];
          if (nowFav) {
            favoriteTracks[id] = true;
            starredAt[id] = Date.now();
          } else {
            delete favoriteTracks[id];
            delete starredAt[id];
          }
          // sync to Jellyfin (best-effort)
          setFavorite(id, nowFav).catch(() => {});
          return { favoriteTracks, starredAt };
        }),

      toggleAlbumFavorite: (id) =>
        set((s) => {
          const favoriteAlbums = { ...s.favoriteAlbums };
          const nowFav = !favoriteAlbums[id];
          if (nowFav) favoriteAlbums[id] = true;
          else delete favoriteAlbums[id];
          setFavorite(id, nowFav).catch(() => {});
          return { favoriteAlbums };
        }),

      toggleArtistFavorite: (id) =>
        set((s) => {
          const favoriteArtists = { ...s.favoriteArtists };
          const nowFav = !favoriteArtists[id];
          if (nowFav) favoriteArtists[id] = true;
          else delete favoriteArtists[id];
          setFavorite(id, nowFav).catch(() => {});
          return { favoriteArtists };
        }),

      scrobble: (id) =>
        set((s) => ({
          localPlayCounts: { ...s.localPlayCounts, [id]: (s.localPlayCounts[id] ?? 0) + 1 },
        })),

      getPlayCount: (id, base = 0) => {
        return base + (get().localPlayCounts[id] ?? 0);
      },
    }),
    {
      name: "feishin-player",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      // v3: drop persisted queue/currentIndex — older builds could persist song objects
      // with broken stream URLs (mock-era or interim formats) that broke playback
      migrate: (persisted) => ({
        ...(persisted as Record<string, unknown>),
        queue: [],
        currentIndex: 0,
        isPlaying: false,
      }),
      partialize: (s) => ({
        queue: s.queue,
        currentIndex: s.currentIndex,
        volume: s.volume,
        muted: s.muted,
        shuffle: s.shuffle,
        repeat: s.repeat,
        favoriteTracks: s.favoriteTracks,
        favoriteAlbums: s.favoriteAlbums,
        favoriteArtists: s.favoriteArtists,
        localPlayCounts: s.localPlayCounts,
        starredAt: s.starredAt,
      }),
    },
  ),
);
