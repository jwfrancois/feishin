"use client";
// Feishin rebuild — settings store (theme, sidebar, playback prefs — feishin's settings.store)
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_THEME } from "@/lib/themes";

export interface SettingsState {
  theme: string;
  accent: string | null; // override accent color
  sidebar: {
    collapsed: boolean;
    image: boolean; // sidebar now-playing image
  };
  rightQueueExpanded: boolean;
  sideQueueLayout: "list" | "compact";
  playback: {
    scrobble: boolean;
    gapless: boolean;
    crossfade: number;
    volumeWheelStep: number;
    skipButtons: boolean;
  };
  general: {
    language: string;
    showRatings: boolean;
    sidebarPlaylistList: boolean;
    pauseOnEmptyQueue: boolean;
  };
  hotkeysNotified: boolean;
  setTheme: (id: string) => void;
  setAccent: (c: string | null) => void;
  setSidebar: (patch: Partial<SettingsState["sidebar"]>) => void;
  toggleRightQueue: () => void;
  setRightQueue: (v: boolean) => void;
  setSideQueueLayout: (l: "list" | "compact") => void;
  setPlayback: (patch: Partial<SettingsState["playback"]>) => void;
  setGeneral: (patch: Partial<SettingsState["general"]>) => void;
  setHotkeysNotified: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      accent: null,
      sidebar: { collapsed: false, image: true },
      rightQueueExpanded: false,
      sideQueueLayout: "list",
      playback: {
        scrobble: true,
        gapless: true,
        crossfade: 0,
        volumeWheelStep: 5,
        skipButtons: false,
      },
      general: {
        language: "en",
        showRatings: true,
        sidebarPlaylistList: true,
        pauseOnEmptyQueue: false,
      },
      hotkeysNotified: false,
      setTheme: (id) => set({ theme: id }),
      setAccent: (c) => set({ accent: c }),
      setSidebar: (patch) => set((s) => ({ sidebar: { ...s.sidebar, ...patch } })),
      toggleRightQueue: () => set((s) => ({ rightQueueExpanded: !s.rightQueueExpanded })),
      setRightQueue: (v) => set({ rightQueueExpanded: v }),
      setSideQueueLayout: (l) => set({ sideQueueLayout: l }),
      setPlayback: (patch) => set((s) => ({ playback: { ...s.playback, ...patch } })),
      setGeneral: (patch) => set((s) => ({ general: { ...s.general, ...patch } })),
      setHotkeysNotified: (v) => set({ hotkeysNotified: v }),
    }),
    {
      name: "feishin-settings",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
