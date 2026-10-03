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
  /** Seed the default server from the server-side proxy config (/api/jf/__ready).
   *  Credentials/URL come from the server's environment — never from source. */
  seedServer: (info: { url?: string; username?: string; name?: string }) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      servers: [],
      currentServerId: null,
      status: "idle",
      serverInfo: null,
      connectError: null,
      seedServer: (info) => {
        const url = (info.url ?? "").replace(/\/+$/, "");
        if (!url) return;
        const st = get();
        const existing = st.servers.find((s) => s.url.replace(/\/+$/, "") === url);
        if (existing) {
          if (st.currentServerId !== existing.id) set({ currentServerId: existing.id, status: "idle", serverInfo: null, connectError: null });
          return;
        }
        const server: ServerConfig = {
          id: "srv-default",
          name: info.name || "Jellyfin",
          type: "jellyfin",
          url,
          username: info.username ?? "",
          savePassword: true,
        };
        set((s) => ({ servers: [...s.servers, server], currentServerId: server.id, status: "idle", serverInfo: null, connectError: null }));
      },
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
