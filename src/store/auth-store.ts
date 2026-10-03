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

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

interface AuthState {
  servers: ServerConfig[];
  currentServerId: string | null;
  status: ConnectionStatus;
  serverInfo: { name: string; version: string } | null;
  connectError: string | null;
  addServer: (s: Omit<ServerConfig, "id">) => ServerConfig;
  removeServer: (id: string) => void;
  setCurrentServer: (id: string | null) => void;
  setStatus: (status: ConnectionStatus, info?: { name: string; version: string } | null, error?: string | null) => void;
  currentServer: () => ServerConfig | undefined;
}

/** Default Jellyfin server — credentials live server-side in src/lib/jf-server.ts */
const DEFAULT_SERVER: ServerConfig = {
  id: "srv-desalyn",
  name: "desalyn",
  type: "jellyfin",
  url: "https://manitou.dyabavadra.com",
  username: "dyabavadra",
  savePassword: true,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      servers: [DEFAULT_SERVER],
      currentServerId: DEFAULT_SERVER.id,
      status: "idle",
      serverInfo: null,
      connectError: null,
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
      setCurrentServer: (id) => set({ currentServerId: id, status: "idle", serverInfo: null, connectError: null }),
      setStatus: (status, info = null, error = null) => set({ status, serverInfo: info, connectError: error }),
      currentServer: () => {
        const st = get();
        return st.servers.find((s) => s.id === st.currentServerId);
      },
    }),
    {
      name: "feishin-auth",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ servers: s.servers, currentServerId: s.currentServerId }),
    },
  ),
);
