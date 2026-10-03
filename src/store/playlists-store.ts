"use client";
// Feishin rebuild — user playlists store (create/rename/delete/add/remove)
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface UserPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  public: boolean;
}

interface PlaylistsState {
  playlists: UserPlaylist[];
  create: (name: string) => UserPlaylist;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  addTrack: (playlistId: string, trackId: string) => void;
  removeTrack: (playlistId: string, trackId: string) => void;
  reorder: (playlistId: string, from: number, to: number) => void;
}

export const usePlaylistsStore = create<PlaylistsState>()(
  persist(
    (set) => ({
      playlists: [
        {
          id: "pl-1",
          name: "2026–01–12",
          trackIds: ["tr0000", "tr0013", "tr0022", "tr0031", "tr0044", "tr0057", "tr0066", "tr0075", "tr0084", "tr0095", "tr0104", "tr0113"],
          createdAt: 1767811200000,
          public: false,
        },
        {
          id: "pl-2",
          name: "Deep Focus",
          trackIds: ["tr0004", "tr0040", "tr0041", "tr0052", "tr0053", "tr0054", "tr0060", "tr0061", "tr0076", "tr0089", "tr0090", "tr0101", "tr0102"],
          createdAt: 1767000000000,
          public: false,
        },
        {
          id: "pl-3",
          name: "Weekend Drive",
          trackIds: ["tr0009", "tr0010", "tr0011", "tr0012", "tr0067", "tr0068", "tr0069", "tr0070", "tr0071", "tr0107", "tr0108", "tr0109", "tr0110", "tr0111"],
          createdAt: 1735689600000,
          public: false,
        },
      ],
      create: (name) => {
        const pl: UserPlaylist = { id: `pl-${Date.now()}`, name, trackIds: [], createdAt: Date.now(), public: false };
        set((s) => ({ playlists: [pl, ...s.playlists] }));
        return pl;
      },
      remove: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      rename: (id, name) =>
        set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, name } : p)) })),
      addTrack: (playlistId, trackId) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId && !p.trackIds.includes(trackId) ? { ...p, trackIds: [...p.trackIds, trackId] } : p,
          ),
        })),
      removeTrack: (playlistId, trackId) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((t) => t !== trackId) } : p,
          ),
        })),
      reorder: (playlistId, from, to) =>
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const arr = [...p.trackIds];
            const [item] = arr.splice(from, 1);
            arr.splice(to, 0, item);
            return { ...p, trackIds: arr };
          }),
        })),
    }),
    {
      name: "feishin-playlists",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
