"use client";
// Feishin rebuild — genres routes (list + detail), backed by the server's genre index
import { useEffect, useState } from "react";
import { fetchGenres, fetchGenreAlbums, fetchGenreTracks } from "@/lib/jellyfin";
import type { Album, Song } from "@/lib/types";
import { useJfQuery } from "@/hooks/use-jf";
import { useRouterStore } from "@/store/router-store";
import { AlbumCard } from "../album-card";
import { SongTable } from "../song-table";
import { useSongActions } from "../song-actions";

export function GenresView() {
  const { data, loading } = useJfQuery("genres:all", () => fetchGenres(300), 30 * 60_000);
  const navigate = useRouterStore((s) => s.navigate);
  const genres = data ?? [];

  return (
    <div className="px-8 pb-24 pt-8" data-testid="genres-view">
      <h1 className="mb-6 text-2xl font-black tracking-tight text-[var(--fg)]">Genres</h1>
      {loading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="h-[70px] animate-pulse rounded-[4px] bg-[var(--elevated)]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {genres.map((g) => (
            <button
              key={g.name}
              type="button"
              onClick={() => navigate({ view: "genre", name: g.name })}
              className="fs-genre flex items-center justify-between px-3 py-4"
              style={{ ["--stripe" as string]: g.color }}
            >
              <div className="min-w-0 text-left">
                <div className="truncate text-[14px] font-bold text-[var(--fg)]">{g.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GenreDetailView({ name }: { name: string }) {
  const navigate = useRouterStore((s) => s.navigate);
  const actions = useSongActions();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumsPages, setAlbumsPages] = useState(1);

  const albumsQ = useJfQuery(
    `genre:${name}:albums:${albumsPages}`,
    () => fetchGenreAlbums(name, (albumsPages - 1) * 60, 60),
    5 * 60_000,
  );
  const tracksQ = useJfQuery(`genre:${name}:tracks`, () => fetchGenreTracks(name, 100), 5 * 60_000);

  useEffect(() => {
    const pageData = albumsQ.data;
    if (!pageData) return;
    setAlbums((prev) => {
      const seen = new Set(prev.map((a) => a.id));
      const merged = [...prev];
      for (const a of pageData.albums) {
        if (!seen.has(a.id)) {
          seen.add(a.id);
          merged.push(a);
        }
      }
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumsQ.data]);

  useEffect(() => {
    setAlbums([]);
    setAlbumsPages(1);
  }, [name]);

  const songs: Song[] = tracksQ.data ?? [];
  const totalAlbums = albumsQ.data?.total ?? albums.length;
  // derive a stable stripe color from the genre name via the shared palette
  const genreStripe = getGenreStripe(name);

  return (
    <div className="pb-24" data-testid="genre-detail">
      <div className="relative overflow-hidden px-8 pb-6 pt-10">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background: `radial-gradient(120% 140% at 20% 0%, ${hexToRgba(genreStripe, 0.55)} 0%, transparent 70%)`,
          }}
        />
        <div className="relative">
          <button
            type="button"
            onClick={() => navigate({ view: "genres" })}
            className="mb-1 text-[12px] font-semibold text-[var(--fg-dim)] hover:text-[var(--fg)]"
          >
            ← Genres
          </button>
          <div className="fs-title-xs mb-1">Genre</div>
          <h1 className="text-[38px] font-black leading-tight tracking-tight text-[var(--fg)]">{name}</h1>
          <div className="mt-1 text-[13px] text-[var(--fg-dim)]">
            {totalAlbums} albums · {songs.length >= 100 ? "100+" : songs.length} tracks
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="fs-pill" onClick={() => actions.play(songs, 0)} disabled={songs.length === 0}>
              ▶ Play all
            </button>
            <button
              type="button"
              className="fs-pill"
              onClick={() => {
                const shuffled = [...songs].sort(() => Math.random() - 0.5);
                actions.play(shuffled, 0);
              }}
              disabled={songs.length === 0}
            >
              ⤨ Shuffle
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-8 px-8">
        {albumsQ.loading && albums.length === 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-square w-full animate-pulse rounded-[4px] bg-[var(--elevated)]" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} width="w-full" />
            ))}
          </div>
        )}

        {albumsPages * 60 < totalAlbums && (
          <div className="flex justify-center">
            <button type="button" className="fs-pill !py-2 text-[13px]" disabled={albumsQ.loading} onClick={() => setAlbumsPages((p) => p + 1)}>
              {albumsQ.loading ? "Loading…" : "Load more albums"}
            </button>
          </div>
        )}

        <div>
          <h2 className="mb-3 text-xl font-extrabold text-[var(--fg)]">Tracks</h2>
          {tracksQ.loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[52px] animate-pulse rounded-[4px] bg-[var(--elevated)]" />
              ))}
            </div>
          ) : (
            <SongTable songs={songs} columns={["tracknum", "title", "artist", "album", "plays", "duration", "fav"]} />
          )}
        </div>
      </div>
    </div>
  );
}

function getGenreStripe(name: string): string {
  const PALETTE = ["#5d3a9b", "#c25b1e", "#b0402c", "#8a6a1f", "#2675b8", "#b12b2b", "#2c8a6e", "#9333ea", "#1f9e8e", "#a3a31c", "#a54a2a", "#0e7f96", "#4d8a2f", "#7d3ac1", "#7e3fa8"];
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return PALETTE[(h >>> 0) % PALETTE.length];
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
