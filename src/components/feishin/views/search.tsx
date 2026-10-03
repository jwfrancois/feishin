"use client";
// Feishin rebuild — search route (feishin's global search with type filter tabs)
import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { searchLibrary, getAlbumCover } from "@/lib/library";
import { trackToSong } from "@/lib/library";
import { useRouterStore } from "@/store/router-store";
import { cn } from "@/lib/utils";
import { AlbumCard } from "../album-card";
import { SongTable } from "../song-table";
import { ItemImage } from "../shared";

const TABS = ["All", "Songs", "Albums", "Artists"] as const;

export function SearchView({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const navigate = useRouterStore((s) => s.navigate);

  const results = useMemo(() => searchLibrary(query), [query]);
  const songs = useMemo(
    () => results.tracks.slice(0, 50).map((t) => trackToSong(t, getAlbumCover(t.albumId))),
    [results],
  );

  return (
    <div className="px-8 pb-24 pt-8" data-testid="search-view">
      <h1 className="mb-6 text-2xl font-black tracking-tight text-[var(--fg)]">Search</h1>
      <div className="relative mb-4 max-w-xl">
        <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your library — songs, albums, artists"
          aria-label="Search"
          className="fs-input h-11 w-full pl-9 pr-3 text-[14px]"
        />
      </div>
      <div className="mb-6 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-[4px] px-3 py-1.5 text-[12.5px] font-bold uppercase tracking-wide transition-colors",
              tab === t ? "bg-[var(--elevated)] text-[var(--primary)]" : "text-[var(--fg-dim)] hover:bg-[var(--hover)] hover:text-[var(--fg)]",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {!query ? (
        <div className="py-16 text-center text-[13.5px] text-[var(--fg-dim)]">
          Start typing to search your library
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {(tab === "All" || tab === "Artists") && results.artists.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-extrabold text-[var(--fg)]">Artists</h2>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {results.artists.slice(0, 8).map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => navigate({ view: "artist", id: artist.id })}
                    className="w-[140px] shrink-0 text-left"
                  >
                    <ItemImage src={artist.imageUrl} alt={artist.name} className="aspect-square w-full rounded-[4px]" />
                    <div className="mt-2 truncate text-[13px] font-bold text-[var(--fg)]">{artist.name}</div>
                    <div className="truncate text-[12px] text-[var(--fg-dim)]">{artist.genre}</div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {(tab === "All" || tab === "Albums") && results.albums.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-extrabold text-[var(--fg)]">Albums</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {results.albums.slice(0, 12).map((album) => (
                  <AlbumCard key={album.id} album={album} width="w-full" />
                ))}
              </div>
            </section>
          )}
          {(tab === "All" || tab === "Songs") && songs.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-extrabold text-[var(--fg)]">Songs</h2>
              <SongTable songs={songs} columns={["tracknum", "title", "artist", "album", "duration", "fav"]} />
            </section>
          )}
          {songs.length === 0 && results.albums.length === 0 && results.artists.length === 0 && (
            <div className="py-16 text-center text-[13.5px] text-[var(--fg-dim)]">No results for "{query}"</div>
          )}
        </div>
      )}
    </div>
  );
}
