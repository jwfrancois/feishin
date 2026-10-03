"use client";
// Feishin rebuild — Home route (hero feature carousel, genres, album carousels — faithful to feishin)
import { useMemo, useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, rgbToHex } from "@/lib/utils";
import type { Album, Playlist } from "@/lib/types";
import {
  allPlaylists,
  getGenres,
  selectBy,
  formatPlayCount,
  formatLongDuration,
} from "@/lib/library";
import { useRouterStore } from "@/store/router-store";
import { ItemImage } from "../shared";
import { AlbumCard } from "../album-card";
import { ScrollCarousel } from "../scroll-carousel";

function HeroFeatureCarousel({ albums }: { albums: Album[] }) {
  const navigate = useRouterStore((s) => s.navigate);
  const ref = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const perPage = 5;
  const pages = Math.max(1, Math.ceil(albums.length / perPage));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: page * el.clientWidth, behavior: "smooth" });
  }, [page]);

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPage(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-hidden"
      >
        {Array.from({ length: pages }).map((_, p) => (
          <div key={p} className="grid w-full shrink-0 snap-start grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5" style={{ width: "100%" }}>
            {albums.slice(p * perPage, (p + 1) * perPage).map((album) => {
              const [r, g, b] = album.color;
              const bg = `linear-gradient(135deg, rgb(${Math.round(r * 0.85)},${Math.round(g * 0.85)},${Math.round(b * 0.85)}) 0%, rgb(${Math.round(r * 0.55)},${Math.round(g * 0.55)},${Math.round(b * 0.55)}) 100%)`;
              return (
                <button
                  key={album.id}
                  type="button"
                  onClick={() => navigate({ view: "album", id: album.id })}
                  className="fs-hero-card group flex h-[305px] flex-1 flex-col items-center justify-between p-5 text-center"
                  style={{ background: bg }}
                >
                  <span className="line-clamp-2 text-[15px] font-bold text-white text-shadow-hero">{album.name}</span>
                  <ItemImage
                    src={album.coverUrl}
                    alt={`${album.name} cover`}
                    className="h-[160px] w-[160px] shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
                  />
                  <div className="w-full">
                    <div className="truncate text-[13.5px] font-semibold text-white">{album.artistName}</div>
                    <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/85">
                      <span className="max-w-[90px] truncate">{album.genre}</span>
                      <span>·</span>
                      <span>{album.year}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {page > 0 && (
        <button
          type="button"
          aria-label="Previous features"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {page < pages - 1 && (
        <button
          type="button"
          aria-label="Next features"
          onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

function GenresGrid({ genres }: { genres: ReturnType<typeof getGenres> }) {
  const navigate = useRouterStore((s) => s.navigate);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? genres : genres.slice(0, 21);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-extrabold tracking-tight text-[var(--fg)]">Genres</h2>
        <button
          type="button"
          className="text-[13px] font-semibold text-[var(--fg-dim)] hover:text-[var(--fg)]"
          onClick={() => (expanded ? navigate({ view: "genres" }) : setExpanded(true))}
        >
          View more
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
        {shown.map((g) => (
          <button
            key={g.name}
            type="button"
            onClick={() => navigate({ view: "genre", name: g.name })}
            className="fs-genre flex h-[42px] items-center px-2.5 text-left"
            style={{ ["--stripe" as string]: g.color }}
          >
            <span className="truncate text-[13px] font-medium text-[var(--fg)]">{g.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PlaylistCards() {
  const navigate = useRouterStore((s) => s.navigate);
  const userPlaylists = allPlaylists;
  return (
    <ScrollCarousel title="Playlists" itemWidth={164}>
      {userPlaylists.map((pl: Playlist) => (
        <div key={pl.id} className="w-[164px] shrink-0">
          <button
            type="button"
            onClick={() => navigate({ view: "playlist", id: pl.id })}
            className="block w-full cursor-pointer overflow-hidden rounded-[4px]"
          >
            <ItemImage src={pl.coverUrl} alt={`${pl.name} cover`} className="aspect-square w-full" />
          </button>
          <button
            type="button"
            onClick={() => navigate({ view: "playlist", id: pl.id })}
            className="mt-2 block w-full truncate text-left text-[13.5px] font-bold text-[var(--fg)] hover:underline"
          >
            {pl.name}
          </button>
          <div className="truncate text-[12.5px] text-[var(--fg-dim)]">
            {pl.trackIds.length} tracks · {formatLongDuration(pl.duration)}
          </div>
        </div>
      ))}
    </ScrollCarousel>
  );
}

export function HomeView() {
  const genres = useMemo(() => getGenres(), []);
  const navigate = useRouterStore((s) => s.navigate);

  const mostPlayed = useMemo(() => selectBy("mostPlayed", "playCount", 12), []);
  const recentlyAdded = useMemo(() => selectBy("recentlyAdded", "recentlyAdded", 12), []);
  const recentlyReleased = useMemo(() => selectBy("recentlyReleased", "recentlyReleased", 12), []);
  const explore = useMemo(() => selectBy("explore", "random", 12), []);
  const recentlyPlayed = useMemo(() => selectBy("recentlyPlayed", "recentlyPlayed", 12), []);
  const features = useMemo(() => selectBy("features", "random", 10), []);

  return (
    <div className="flex flex-col gap-10 px-8 pb-24 pt-8" data-testid="home-view">
      <HeroFeatureCarousel albums={features} />
      <GenresGrid genres={genres} />
      <ScrollCarousel title="Most played">
        {mostPlayed.map((album) => (
          <AlbumCard key={album.id} album={album} badge={formatPlayCount(album.playCount)} />
        ))}
      </ScrollCarousel>
      <ScrollCarousel title="Recently added">
        {recentlyAdded.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </ScrollCarousel>
      <ScrollCarousel title="Recently released">
        {recentlyReleased.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </ScrollCarousel>
      <ScrollCarousel title="Explore">
        {explore.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </ScrollCarousel>
      <ScrollCarousel title="Recently played">
        {recentlyPlayed.map((album) => (
          <AlbumCard key={album.id} album={album} />
        ))}
      </ScrollCarousel>
      <PlaylistCards />
    </div>
  );
}
