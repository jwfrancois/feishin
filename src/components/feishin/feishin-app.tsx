"use client";
// Feishin rebuild — app root: layout grid (sidebar / main / right queue / player bar), view routing
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuthStore } from "@/store/auth-store";
import { useRouterStore } from "@/store/router-store";
import { useSettingsStore } from "@/store/settings-store";
import { applyTheme } from "@/lib/themes";
import { Toaster } from "sonner";
import { AudioEngine } from "./player/audio-engine";
import { PlayerBar } from "./player/player-bar";
import { HifiPanel } from "./player/hifi/hifi-panel";
import { AgentAutoEq } from "./player/hifi/agent-auto-eq";
import { Sidebar } from "./sidebar";
import { RightQueuePanel } from "./layout/right-queue";
import { Hotkeys } from "./hotkeys";
import { LoginView } from "./views/login";
import { HomeView } from "./views/home";
import { AlbumsView } from "./views/albums";
import { AlbumDetailView } from "./views/album-detail";
import { ArtistsView } from "./views/artists";
import { ArtistDetailView } from "./views/artist-detail";
import { TracksView } from "./views/tracks";
import { GenresView, GenreDetailView } from "./views/genres";
import { PlaylistsView, PlaylistDetailView } from "./views/playlists";
import { PodcastsView, PodcastDetailView } from "./views/podcasts";
import { SearchView } from "./views/search";
import { FavoritesView } from "./views/favorites";
import { AgentView } from "./views/agent";
import { SettingsView } from "./views/settings";
import { NowPlayingView } from "./views/now-playing";

function MainContent() {
  const route = useRouterStore((s) => s.history[s.historyIndex]);
  const mainRef = useRef<HTMLDivElement | null>(null);

  // reset scroll on navigation
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [route]);

  switch (route.view) {
    case "home":
      return <HomeView />;
    case "albums":
      return <AlbumsView />;
    case "album":
      return <AlbumDetailView albumId={route.id} />;
    case "artists":
      return <ArtistsView />;
    case "artist":
      return <ArtistDetailView artistId={route.id} />;
    case "tracks":
      return <TracksView />;
    case "genres":
      return <GenresView />;
    case "genre":
      return <GenreDetailView name={route.name} />;
    case "podcasts":
      return <PodcastsView />;
    case "podcast":
      return <PodcastDetailView podcastId={route.id} />;
    case "playlists":
      return <PlaylistsView />;
    case "playlist":
      return <PlaylistDetailView playlistId={route.id} />;
    case "search":
      return <SearchView initialQuery={"query" in route ? route.query : ""} />;
    case "favorites":
      return <FavoritesView initialTab={"tab" in route && route.tab === "albums" ? "Albums" : route.tab === "artists" ? "Artists" : "Songs"} />;
    case "agent":
      return <AgentView />;
    case "settings":
      return <SettingsView section={"section" in route ? route.section : "general"} />;
    case "now-playing":
      return <NowPlayingView />;
    default:
      return <HomeView />;
  }
}

/** Connects to the selected server (server-side proxy performs auth).
 *  With no server selected, probes the proxy once for an env-configured
 *  default (JELLYFIN_* on the server) and seeds it — the credentials
 *  themselves never reach this client bundle. */
function useServerConnection() {
  const currentServer = useAuthStore((s) => s.servers.find((x) => x.id === s.currentServerId));
  const status = useAuthStore((s) => s.status);
  const setStatus = useAuthStore((s) => s.setStatus);
  // false while the initial probe is still pending — used to show a
  // connecting screen instead of flashing the login view
  const [seedPending, setSeedPending] = useState(!useAuthStore.getState().currentServer());

  useEffect(() => {
    if (currentServer || !seedPending) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/jf/__ready", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
        const info = (await res.json().catch(() => null)) as { url?: string; username?: string; serverName?: string } | null;
        if (cancelled) return;
        if (res.ok && info?.url) {
          useAuthStore.getState().seedServer({ url: info.url, username: info.username, name: info.serverName });
        }
        setSeedPending(false);
      } catch {
        if (!cancelled) setSeedPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentServer, seedPending]);

  useEffect(() => {
    if (!currentServer || status === "connected") return;
    let cancelled = false;
    (async () => {
      if (useAuthStore.getState().status !== "connecting") setStatus("connecting");
      try {
        const res = await fetch("/api/jf/__ready", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
        if (!res.ok) throw new Error(`Proxy ${res.status}`);
        const info = (await res.json()) as { serverName?: string; serverVersion?: string };
        if (cancelled) return;
        setStatus("connected", { name: info.serverName ?? currentServer.name, version: info.serverVersion ?? "" });
      } catch (err) {
        if (cancelled) return;
        setStatus("error", null, err instanceof Error ? err.message : "Connection failed");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentServer?.id, status]);

  return { currentServer, status, seedPending };
}

function ConnectingScreen({ status }: { status: string }) {
  const connectError = useAuthStore((s) => s.connectError);
  const currentServer = useAuthStore((s) => s.servers.find((x) => x.id === s.currentServerId));
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-[var(--bg)]" data-testid="connecting-view">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/feishin-icon.png" alt="Feishin" className={`h-16 w-16 ${status === "error" ? "" : "animate-pulse"}`} />
      <div className="text-center">
        <div className="text-[14px] font-bold text-[var(--fg)]">
          {status === "error" ? "Could not connect to server" : `Connecting to ${currentServer?.name ?? "server"}…`}
        </div>
        {status === "error" && connectError && (
          <div className="mt-1 max-w-md text-[12.5px] text-[var(--fg-dim)]">{connectError}</div>
        )}
      </div>
      {status === "error" && (
        <div className="flex gap-2">
          <button type="button" className="fs-pill !py-2" onClick={() => useAuthStore.getState().setStatus("idle")}>
            Retry
          </button>
          <button type="button" className="fs-pill !py-2" onClick={() => useAuthStore.getState().setCurrentServer(null)}>
            Manage servers
          </button>
        </div>
      )}
    </div>
  );
}

export default function FeishinApp() {
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // wait for client hydration to avoid SSR/localStorage mismatch (no setState-in-effect)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { currentServer, status, seedPending } = useServerConnection();

  // apply theme on change (also on first mount)
  useEffect(() => {
    applyTheme(theme, accent);
  }, [theme, accent]);

  // auto-collapse sidebar on small screens (mobile)
  useEffect(() => {
    if (window.innerWidth < 900) {
      useSettingsStore.getState().setSidebar({ collapsed: true });
    }
  }, []);

  // re-apply theme when localStorage hydration completes (theme may load after first paint)
  useEffect(() => {
    const t = setTimeout(() => {
      const s = useSettingsStore.getState();
      applyTheme(s.theme, s.accent);
    }, 50);
    return () => clearTimeout(t);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--bg)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/feishin-icon.png" alt="Feishin" className="h-16 w-16 animate-pulse" />
      </div>
    );
  }

  // probe still deciding whether an env-configured default server exists —
  // keep the connecting screen up instead of flashing the login view
  if (!currentServer && seedPending && status !== "error") {
    return (
      <>
        <ConnectingScreen status="connecting" />
        <AudioEngine />
        <AgentAutoEq />
        <Toaster position="bottom-right" theme="dark" />
      </>
    );
  }

  if (!currentServer || status === "error") {
    return (
      <>
        <LoginView />
        <AudioEngine />
        <AgentAutoEq />
        <Toaster position="bottom-right" theme="dark" />
      </>
    );
  }

  if (status !== "connected") {
    return (
      <>
        <ConnectingScreen status={status} />
        <AudioEngine />
        <AgentAutoEq />
        <Toaster position="bottom-right" theme="dark" />
      </>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--bg)]" data-testid="app-shell">
      <AudioEngine />
        <AgentAutoEq />
      <Hotkeys searchInputRef={searchInputRef} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto" data-testid="main-content">
          <MainContent />
        </main>
        <RightQueuePanel />
      </div>
      <PlayerBar />
      <HifiPanel />
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}
