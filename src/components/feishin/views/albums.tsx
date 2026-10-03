"use client";
// Feishin rebuild — albums list route (grid/table toggle, sort/filter toolbar)
import { useMemo, useState } from "react";
import { LayoutGrid, List, ArrowDownUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { allAlbums } from "@/lib/library";
import type { Album } from "@/lib/types";
import { AlbumCard } from "../album-card";
import { ScrollCarousel } from "../scroll-carousel";
import { ItemImage, RatingStars } from "../shared";
import { useRouterStore } from "@/store/router-store";
import { formatDuration } from "@/lib/library";
import { DropdownMenuNS as DropdownMenu } from "@/components/ui/dropdown-menu";
import { ContextMenuNS as ContextMenu } from "@/components/ui/context-menu";
import { usePlayerStore } from "@/store/player-store";
import { getTracksByAlbum, trackToSong } from "@/lib/library";
import { useSongActions } from "../song-actions";
import { toast } from "sonner";
import { CtxItem, CtxSeparator } from "../shared";

type SortKey = "name" | "artist" | "year" | "recentlyAdded" | "playCount" | "rating" | "random" | "duration";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  artist: "Artist",
  year: "Year",
  recentlyAdded: "Recently added",
  playCount: "Play count",
  rating: "Rating",
  random: "Random",
  duration: "Duration",
};

function AlbumContextMenu({ album, children }: { album: Album; children: React.ReactNode }) {
  const actions = useSongActions();
  const fav = usePlayerStore((s) => !!s.favoriteAlbums[album.id]);
  const toggleAlbumFav = usePlayerStore((s) => s.toggleAlbumFavorite);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="fs-menu-content">
          <CtxItem
            icon={<span className="text-[13px] font-bold">▶</span>}
            onSelect={() => {
              const songs = getTracksByAlbum(album.id).map((t) => trackToSong(t, album.coverUrl));
              actions.play(songs, 0);
            }}
          >
            Play
          </CtxItem>
          <CtxItem onSelect={() => actions.playNext(getTracksByAlbum(album.id).map((t) => trackToSong(t, album.coverUrl)))}>
            Play next
          </CtxItem>
          <CtxItem onSelect={() => actions.addLater(getTracksByAlbum(album.id).map((t) => trackToSong(t, album.coverUrl)))}>
            Add to queue
          </CtxItem>
          <CtxSeparator />
          <CtxItem
            onSelect={() => {
              toggleAlbumFav(album.id);
              toast(!fav ? "Added to favorites" : "Removed from favorites");
            }}
            icon={<span className={fav ? "text-[var(--primary)]" : ""}>♥</span>}
          >
            {fav ? "Remove from favorites" : "Add to favorites"}
          </CtxItem>
          <CtxItem onSelect={() => actions.goToArtist(album.artistId)}>Go to artist</CtxItem>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function AlbumsTable({ albums }: { albums: Album[] }) {
  const navigate = useRouterStore((s) => s.navigate);
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--fg-dim)]">
        <div className="w-10 shrink-0 text-center">#</div>
        <div className="min-w-0 flex-1">Name</div>
        <div className="w-[200px] shrink-0">Artist</div>
        <div className="w-[70px] shrink-0">Year</div>
        <div className="w-[120px] shrink-0">Genre</div>
        <div className="w-[70px] shrink-0 text-right">Duration</div>
      </div>
      {albums.map((album, i) => (
        <AlbumContextMenu key={album.id} album={album}>
          <div
            className="fs-row flex cursor-default items-center gap-3 border-b border-[var(--border)]/40 px-3 py-2"
            onClick={() => navigate({ view: "album", id: album.id })}
          >
            <div className="w-10 shrink-0 text-center text-[12.5px] tabular-nums text-[var(--fg-dim)]">{i + 1}</div>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <ItemImage src={album.coverUrl} alt={`${album.name} cover`} className="h-9 w-9" />
              <span className="truncate text-[13.5px] font-semibold text-[var(--fg)]">{album.name}</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate({ view: "artist", id: album.artistId });
              }}
              className="w-[200px] shrink-0 truncate text-left text-[13px] text-[var(--fg-dim)] hover:text-[var(--fg)] hover:underline"
            >
              {album.artistName}
            </button>
            <div className="w-[70px] shrink-0 text-[13px] tabular-nums text-[var(--fg-dim)]">{album.year}</div>
            <div className="w-[120px] shrink-0 truncate text-[13px] text-[var(--fg-dim)]">{album.genre}</div>
            <div className="w-[70px] shrink-0 text-right text-[12.5px] tabular-nums text-[var(--fg-dim)]">
              {formatDuration(album.duration)}
            </div>
          </div>
        </AlbumContextMenu>
      ))}
    </div>
  );
}

export function AlbumsView() {
  const [layout, setLayout] = useState<"grid" | "table">("grid");
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState("");

  const albums = useMemo(() => {
    let arr = filter
      ? allAlbums.filter(
          (a) => a.name.toLowerCase().includes(filter.toLowerCase()) || a.artistName.toLowerCase().includes(filter.toLowerCase()),
        )
      : [...allAlbums];
    const dir = sortDirection === "asc" ? 1 : -1;
    switch (sort) {
      case "name":
        arr.sort((a, b) => a.name.localeCompare(b.name) * dir);
        break;
      case "artist":
        arr.sort((a, b) => a.artistName.localeCompare(b.artistName) * dir);
        break;
      case "year":
        arr.sort((a, b) => (a.year - b.year) * dir);
        break;
      case "recentlyAdded":
        arr.sort((a, b) => (b.id > a.id ? 1 : -1));
        break;
      case "playCount":
        arr.sort((a, b) => (b.playCount - a.playCount) * dir);
        break;
      case "rating":
        arr.sort((a, b) => (b.rating - a.rating) * dir);
        break;
      case "duration":
        arr.sort((a, b) => (a.duration - b.duration) * dir);
        break;
      case "random":
        arr.sort(() => Math.random() - 0.5);
        break;
    }
    return arr;
  }, [sort, sortDirection, filter]);

  return (
    <div className="px-8 pb-24 pt-8" data-testid="albums-view">
      <h1 className="mb-6 text-2xl font-black tracking-tight text-[var(--fg)]">Albums</h1>

      {/* toolbar */}
      <div className="mb-6 flex items-center gap-2">
        <div className="relative w-[280px]">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search albums"
            aria-label="Search albums"
            className="fs-input h-9 w-full px-3 text-[13px]"
          />
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="fs-icon-btn flex h-9 items-center gap-2 rounded-[4px] bg-[var(--elevated)] px-3 text-[13px]">
              <ArrowDownUp size={14} />
              <span className="hidden md:inline">{SORT_LABELS[sort]}</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" className="fs-menu-content">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <DropdownMenu.Item
                  key={key}
                  className="flex cursor-pointer select-none rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
                  onSelect={() => {
                    if (sort === key) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
                    else {
                      setSort(key);
                      setSortDirection("asc");
                    }
                  }}
                >
                  {SORT_LABELS[key]}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            title="Grid view"
            aria-label="Grid view"
            onClick={() => setLayout("grid")}
            className={cn("fs-icon-btn p-2", layout === "grid" && "bg-[var(--elevated)] text-[var(--primary)]")}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            title="Table view"
            aria-label="Table view"
            onClick={() => setLayout("table")}
            className={cn("fs-icon-btn p-2", layout === "table" && "bg-[var(--elevated)] text-[var(--primary)]")}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {layout === "grid" ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {albums.map((album) => (
            <AlbumContextMenu key={album.id} album={album}>
              <div>
                <AlbumCard album={album} width="w-full" />
              </div>
            </AlbumContextMenu>
          ))}
        </div>
      ) : (
        <AlbumsTable albums={albums} />
      )}
    </div>
  );
}
