"use client";
// Feishin rebuild — auth/server store (feishin's server management)
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ServerType = "jellyfin" | "navidrome" | "subsonic";

export interface ServerConfig {
  id: string;
  name: string;
  type: ServerType;
  url: string;
  username: string;
  savePassword?: boolean;
}

interface AuthState {
  servers: ServerConfig[];
  currentServerId: string | null;
  addServer: (s: Omit<ServerConfig, "id">) => ServerConfig;
  removeServer: (id: string) => void;
  setCurrentServer: (id: string | null) => void;
  currentServer: () => ServerConfig | undefined;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      servers: [],
      currentServerId: null,
      addServer: (s) => {
        const server: ServerConfig = { ...s, id: `srv-${Date.now()}` };
        set((st) => ({ servers: [...st.servers, server], currentServerId: server.id }));
        return server;
      },
      removeServer: (id) =>
        set((st) => ({
          servers: st.servers.filter((s) => s.id !== id),
          currentServerId: st.currentServerId === id ? null : st.currentServerId,
        })),
      setCurrentServer: (id) => set({ currentServerId: id }),
      currentServer: () => {
        const st = get();
        return st.servers.find((s) => s.id === st.currentServerId);
      },
    }),
    {
      name: "feishin-auth",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
