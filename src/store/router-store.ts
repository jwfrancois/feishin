"use client";
// Feishin rebuild — router store (single-page view navigation, like feishin's HashRouter)
import { create } from "zustand";

export type Route =
  | { view: "home" }
  | { view: "albums" }
  | { view: "album"; id: string }
  | { view: "artists" }
  | { view: "artist"; id: string }
  | { view: "tracks" }
  | { view: "genres" }
  | { view: "genre"; name: string }
  | { view: "playlists" }
  | { view: "playlist"; id: string }
  | { view: "search"; query?: string }
  | { view: "favorites"; tab?: "tracks" | "albums" | "artists" }
  | { view: "agent" }
  | { view: "settings"; section?: string }
  | { view: "now-playing" };

interface RouterState {
  history: Route[];
  historyIndex: number;
  navigate: (route: Route, replace?: boolean) => void;
  back: () => void;
  forward: () => void;
  canBack: () => boolean;
  canForward: () => boolean;
  current: () => Route;
}

export const useRouterStore = create<RouterState>((set, get) => ({
  history: [{ view: "home" }],
  historyIndex: 0,
  navigate: (route, replace = false) => {
    const s = get();
    const history = replace
      ? [...s.history.slice(0, s.historyIndex), route]
      : [...s.history.slice(0, s.historyIndex + 1), route];
    set({ history, historyIndex: history.length - 1 });
  },
  back: () => {
    const s = get();
    if (s.historyIndex > 0) set({ historyIndex: s.historyIndex - 1 });
  },
  forward: () => {
    const s = get();
    if (s.historyIndex < s.history.length - 1) set({ historyIndex: s.historyIndex + 1 });
  },
  canBack: () => get().historyIndex > 0,
  canForward: () => get().historyIndex < get().history.length - 1,
  current: () => {
    const s = get();
    return s.history[s.historyIndex];
  },
}));
