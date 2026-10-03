"use client";
// Feishin rebuild — genres routes (list + detail)
import { useMemo } from "react";
import { getGenres, allAlbums, allTracks, getAlbumCover } from "@/lib/library";
import { trackToSong } from "@/lib/library";
import { useRouterStore } from "@/store/router-store";
import { ItemImage } from "../shared";
import { AlbumCard } from "../album-card";
import { SongTable } from "../song-table";
import { useSongActions } from "../song-actions";

export function GenresView() {
  const genres = useMemo(() => getGenres(), []);
  const navigate = useRouterStore((s) => s.navigate);

  return (
    <div className="px-8 pb-24 pt-8" data-testid="genres-view">
      <h1 className="mb-6 text-2xl font-black tracking-tight text-[var(--fg)]">Genres</h1>
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
              <div className="text-[12px] text-[var(--fg-dim)]">
                {g.albumCount} albums · {g.trackCount} tracks
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function GenreDetailView({ name }: { name: string }) {
  const navigate = useRouterStore((s) => s.navigate);
  const actions = useSongActions();
  const albums = useMemo(() => allAlbums.filter((a) => a.genre === name), [name]);
  const songs = useMemo(
    () =>
      allTracks
        .filter((t) => t.genre === name)
        .map((t) => trackToSong(t, getAlbumCover(t.albumId))),
    [name],
  );
  const color = getGenres().find((g) => g.name === name)?.color ?? "#555";
  const [r, g, b] = color
    .match(/^#(..)(..)(..)$/)!
    .slice(1)
    .map((h) => parseInt(h, 16));

  return (
    <div className="pb-24" data-testid="genre-detail">
      <div className="relative overflow-hidden px-8 pb-6 pt-10">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background: `radial-gradient(120% 140% at 20% 0%, rgba(${r},${g},${b},0.55) 0%, transparent 70%)`,
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
            {albums.length} albums · {songs.length} tracks
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="fs-pill" onClick={() => actions.play(songs, 0)}>
              ▶ Play all
            </button>
            <button
              type="button"
              className="fs-pill"
              onClick={() => {
                const shuffled = [...songs].sort(() => Math.random() - 0.5);
                actions.play(shuffled, 0);
              }}
            >
              ⤨ Shuffle
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-8 px-8">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} width="w-full" />
          ))}
        </div>
        <div>
          <h2 className="mb-3 text-xl font-extrabold text-[var(--fg)]">Tracks</h2>
          <SongTable songs={songs} columns={["tracknum", "title", "artist", "album", "plays", "duration", "fav"]} />
        </div>
      </div>
    </div>
  );
}
