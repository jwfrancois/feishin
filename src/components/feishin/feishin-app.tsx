"use client";
// Feishin rebuild — app root: layout grid (sidebar / main / right queue / player bar), view routing
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { useRouterStore } from "@/store/router-store";
import { useSettingsStore } from "@/store/settings-store";
import { applyTheme } from "@/lib/themes";
import { Toaster } from "sonner";
import { AudioEngine } from "./player/audio-engine";
import { PlayerBar } from "./player/player-bar";
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
import { SearchView } from "./views/search";
import { FavoritesView } from "./views/favorites";
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
    case "playlists":
      return <PlaylistsView />;
    case "playlist":
      return <PlaylistDetailView playlistId={route.id} />;
    case "search":
      return <SearchView initialQuery={"query" in route ? route.query : ""} />;
    case "favorites":
      return <FavoritesView initialTab={"tab" in route && route.tab === "albums" ? "Albums" : route.tab === "artists" ? "Artists" : "Songs"} />;
    case "settings":
      return <SettingsView section={"section" in route ? route.section : "general"} />;
    case "now-playing":
      return <NowPlayingView />;
    default:
      return <HomeView />;
  }
}

export default function FeishinApp() {
  const currentServer = useAuthStore((s) => s.servers.find((x) => x.id === s.currentServerId));
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const rightQueueExpanded = useSettingsStore((s) => s.rightQueueExpanded);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // wait for client mount to avoid SSR/localStorage hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

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

  // fake hydration guard: zustand persist hydrates synchronously on same-origin storage

  if (!mounted) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--bg)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/feishin-icon.png" alt="Feishin" className="h-16 w-16 animate-pulse" />
      </div>
    );
  }

  if (!currentServer) {
    return (
      <>
        <LoginView />
        <AudioEngine />
        <Toaster position="bottom-right" theme="dark" />
      </>
    );
  }

  const isNowPlaying = useRouterStore.getState().history[useRouterStore.getState().historyIndex].view === "now-playing";

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--bg)]" data-testid="app-shell">
      <AudioEngine />
      <Hotkeys searchInputRef={searchInputRef} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto" data-testid="main-content">
          <MainContent />
        </main>
        <RightQueuePanel />
      </div>
      <PlayerBar />
      {!isNowPlaying && rightQueueExpanded === false && null}
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}
