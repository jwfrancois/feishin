"use client";
// Feishin rebuild — sidebar (search, nav, library items, playlists, server box, now-playing image)
import { useRef, useState } from "react";
import {
  Home,
  Disc3,
  User,
  Heart,
  Settings as SettingsIcon,
  Music2,
  Podcast,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  ArrowUpNarrowWide,
  MoreVertical,
  ListMusic,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouterStore, type Route } from "@/store/router-store";
import { useSettingsStore } from "@/store/settings-store";
import { useAuthStore } from "@/store/auth-store";
import { usePlayerStore } from "@/store/player-store";
import { formatLongDuration } from "@/lib/format";
import { fetchPlaylistsPage } from "@/lib/jellyfin";
import { useJfQuery } from "@/hooks/use-jf";
import { ItemImage } from "./shared";
import { DropdownMenuNS as DropdownMenu } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { CreatePlaylistDialog } from "./dialogs";

const LIBRARY_ITEMS: { label: string; icon: React.ReactNode; route: Route }[] = [
  { label: "Home", icon: <Home size={17} />, route: { view: "home" } },
  { label: "Tracks", icon: <Music2 size={17} />, route: { view: "tracks" } },
  { label: "Albums", icon: <Disc3 size={17} />, route: { view: "albums" } },
  { label: "Artists", icon: <User size={17} />, route: { view: "artists" } },
  { label: "Podcasts", icon: <Podcast size={17} />, route: { view: "podcasts" } },
  { label: "Favorites", icon: <Heart size={17} />, route: { view: "favorites" } },
  { label: "Agent", icon: <Bot size={17} />, route: { view: "agent" } },
  { label: "Settings", icon: <SettingsIcon size={17} />, route: { view: "settings" } },
];

function isActiveRoute(current: Route, target: Route): boolean {
  if (current.view === "album" && target.view === "albums") return true;
  if (current.view === "artist" && target.view === "artists") return true;
  if (current.view === "podcast" && target.view === "podcasts") return true;
  if ((current.view === "genre" || current.view === "genres") && target.view === "tracks") return false;
  return current.view === target.view;
}

function ServerBox() {
  const currentServer = useAuthStore((s) => s.servers.find((x) => x.id === s.currentServerId));
  const servers = useAuthStore((s) => s.servers);
  const serverInfo = useAuthStore((s) => s.serverInfo);
  const setCurrent = useAuthStore((s) => s.setCurrentServer);
  const navigate = useRouterStore((s) => s.navigate);

  const typeLabel =
    currentServer?.type === "jellyfin" ? "Jellyfin" : currentServer?.type === "subsonic" ? "OpenSubsonic" : "Navidrome";

  return (
    <div className="mx-2 mb-2 flex items-center gap-2.5 rounded-[4px] bg-[var(--elevated)] p-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]">
        <Disc3 size={18} className="text-[var(--primary-contrast)]" />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13px] font-bold text-[var(--fg)]">
          {serverInfo?.name || (currentServer ? currentServer.name : "No server")}
        </div>
        <div className="truncate text-[12px] text-[var(--fg-dim)]">
          {currentServer ? `${typeLabel} · ${currentServer.username}` : "Connect a server"}
        </div>
      </div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" aria-label="Server options" className="fs-icon-btn p-1">
            <MoreVertical size={15} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" side="top" sideOffset={6} className="fs-menu-content">
            {servers.map((s) => (
              <DropdownMenu.Item
                key={s.id}
                className="flex cursor-pointer select-none items-center gap-2 rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
                onSelect={() => {
                  if (s.id !== currentServer?.id) {
                    setCurrent(s.id);
                    setTimeout(() => window.location.reload(), 150);
                  }
                }}
              >
                <Disc3 size={14} />
                {s.name}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="mx-1 my-1 h-px bg-[var(--border)]" />
            <DropdownMenu.Item
              className="flex cursor-pointer select-none items-center gap-2 rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
              onSelect={() => navigate({ view: "settings", section: "servers" })}
            >
              Manage servers
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

export function Sidebar({ onCreatePlaylist }: { onCreatePlaylist?: () => void }) {
  const current = useRouterStore((s) => s.history[s.historyIndex]);
  const navigate = useRouterStore((s) => s.navigate);
  const back = useRouterStore((s) => s.back);
  const forward = useRouterStore((s) => s.forward);
  const canBack = useRouterStore((s) => s.historyIndex > 0);
  const canForward = useRouterStore((s) => s.historyIndex < s.history.length - 1);
  const collapsed = useSettingsStore((s) => s.sidebar.collapsed);
  const showImage = useSettingsStore((s) => s.sidebar.image);
  const showPlaylistList = useSettingsStore((s) => s.general.sidebarPlaylistList);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [playlistsOpen, setPlaylistsOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const song = usePlayerStore((s) => s.queue[s.currentIndex]);
  const { data: playlistsData } = useJfQuery("sidebar:playlists", () => fetchPlaylistsPage({ limit: 15 }), 120_000);
  const playlists = (playlistsData?.playlists ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    count: p.trackCount,
    duration: p.duration,
    coverUrl: p.coverUrl,
  }));
  const sidebarListRef = useRef<HTMLDivElement | null>(null);
  const cover = song?.albumCoverUrl;

  if (collapsed) {
    return (
      <div className="flex h-full w-14 flex-col items-center gap-1 border-r border-[var(--border)] bg-[var(--bg-alt)] py-3">
        <button
          type="button"
          title="Expand sidebar"
          onClick={() => useSettingsStore.getState().setSidebar({ collapsed: false })}
          className="fs-icon-btn mb-2 p-2"
        >
          <ChevronRight size={18} />
        </button>
        {LIBRARY_ITEMS.map((item) => (
          <button
            key={item.label}
            type="button"
            title={item.label}
            onClick={() => navigate(item.route)}
            className={cn(
              "fs-icon-btn p-2.5",
              isActiveRoute(current, item.route) && "bg-[var(--hover)] text-[var(--primary)]",
            )}
          >
            {item.icon}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full w-[250px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-alt)]" data-testid="sidebar">
      {/* search row */}
      <div className="flex items-center gap-1.5 p-2">
        <button
          type="button"
          onClick={() => navigate({ view: "search" })}
          className="flex h-9 flex-1 items-center gap-2 rounded-[4px] bg-[var(--elevated)] px-3 text-[13px] text-[var(--fg-dim)] transition-colors hover:text-[var(--fg)]"
        >
          <Search size={14} />
          <span>Search</span>
        </button>
        <button type="button" title="Queue" onClick={() => useSettingsStore.getState().toggleRightQueue()} className="fs-icon-btn h-9 w-9 bg-[var(--elevated)]">
          <ListMusic size={16} />
        </button>
        <button type="button" title="Back" disabled={!canBack} onClick={back} className="fs-icon-btn h-9 w-9 bg-[var(--elevated)] disabled:opacity-40">
          <ChevronLeft size={16} />
        </button>
        <button type="button" title="Forward" disabled={!canForward} onClick={forward} className="fs-icon-btn h-9 w-9 bg-[var(--elevated)] disabled:opacity-40">
          <ChevronRight size={16} />
        </button>
      </div>

      <div ref={sidebarListRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {/* My Library */}
        <button
          type="button"
          onClick={() => setLibraryOpen((v) => !v)}
          className="flex w-full items-center justify-between px-1.5 py-2 text-[13px] font-bold text-[var(--fg)]"
        >
          My Library
          {libraryOpen ? <ChevronDown size={14} className="text-[var(--fg-dim)]" /> : <ChevronRight size={14} className="text-[var(--fg-dim)]" />}
        </button>
        {libraryOpen && (
          <div className="flex flex-col">
            {LIBRARY_ITEMS.map((item) => {
              const active = isActiveRoute(current, item.route);
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item.route)}
                  className={cn(
                    "flex items-center gap-3 rounded-[4px] px-2 py-[7px] text-[13.5px] font-medium transition-colors",
                    active ? "text-[var(--primary)]" : "text-[var(--fg)] hover:bg-[var(--hover)]",
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Playlists */}
        {showPlaylistList && (
          <>
            <div className="mt-3 flex items-center justify-between px-1.5 py-2">
              <span className="text-[13px] font-bold text-[var(--fg)]">Playlists</span>
              <div className="flex items-center gap-0.5">
                <button type="button" title="Create playlist" onClick={() => setCreateOpen(true)} className="fs-icon-btn p-1">
                  <Plus size={15} />
                </button>
                <button type="button" title="Sort playlists" onClick={() => toast("Playlists sorted by name", { duration: 1200 })} className="fs-icon-btn p-1">
                  <ArrowUpNarrowWide size={15} />
                </button>
                <button type="button" title="Collapse" onClick={() => setPlaylistsOpen((v) => !v)} className="fs-icon-btn p-1">
                  {playlistsOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </button>
              </div>
            </div>
            {playlistsOpen && (
              <div className="flex flex-col">
                {playlists.map((pl) => {
                  const active = current.view === "playlist" && current.id === pl.id;
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => navigate({ view: "playlist", id: pl.id })}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-[4px] p-1.5 text-left transition-colors hover:bg-[var(--hover)]",
                        active && "bg-[var(--hover)]",
                      )}
                    >
                      <ItemImage className="h-10 w-10" alt={`${pl.name} cover`} src={pl.coverUrl} />
                      <div className="min-w-0 leading-tight">
                        <div className="truncate text-[13px] font-semibold text-[var(--fg)]">{pl.name}</div>
                        <div className="truncate text-[11.5px] text-[var(--fg-dim)]">
                          {pl.count} · {pl.count > 0 ? formatLongDuration(pl.duration) : "empty"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* now playing sidebar image */}
      {showImage && song && (
        <button
          type="button"
          onClick={() => navigate({ view: "now-playing" })}
          className="relative mx-2 mb-2 block overflow-hidden rounded-[4px]"
          title="Open full screen player"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt={`${song.album} cover`} className="aspect-square w-full object-cover" draggable={false} />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left">
            <div className="truncate text-[13px] font-bold text-white">{song.name}</div>
            <div className="truncate text-[12px] text-white/70">{song.artist}</div>
          </div>
        </button>
      )}

      <ServerBox />
      <CreatePlaylistDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
