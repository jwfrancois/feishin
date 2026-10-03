"use client";
// Feishin rebuild — Home route (hero feature carousel, genres, album carousels — faithful to feishin)
// Data is fetched live from the connected Jellyfin server via the /api/jf proxy.
import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Album, GenreInfo, Playlist } from "@/lib/types";
import { fetchAlbumsPage, fetchGenres, fetchPlaylistsPage } from "@/lib/jellyfin";
import { formatPlayCount, formatLongDuration } from "@/lib/format";
import { useJfQuery } from "@/hooks/use-jf";
import { useRouterStore } from "@/store/router-store";
import { ItemImage } from "../shared";
import { AlbumCard } from "../album-card";
import { ScrollCarousel } from "../scroll-carousel";

const ALBUM_LIST_LIMIT = 12;

function useAlbumQuery(key: string, sortBy: string, sortOrder: "Ascending" | "Descending") {
  return useJfQuery(key, () => fetchAlbumsPage({ sortBy, sortOrder, limit: ALBUM_LIST_LIMIT }), 3 * 60_000);
}

function SkeletonCarousel({ title }: { title: string }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-extrabold tracking-tight text-[var(--fg)]">{title}</h2>
      <div className="flex gap-4 overflow-hidden pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-[164px] shrink-0">
            <div className="aspect-square w-full animate-pulse rounded-[4px] bg-[var(--elevated)]" />
            <div className="mt-2 h-3.5 w-3/4 animate-pulse rounded bg-[var(--elevated)]" />
            <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-[var(--elevated)]" />
          </div>
        ))}
      </div>
    </section>
  );
}

function AlbumCarousel({ title, albums, count }: { title: string; albums: Album[]; count?: number }) {
  return (
    <ScrollCarousel title={title} itemWidth={164}>
      {albums.map((album) => (
        <AlbumCard key={album.id} album={album} badge={count ? formatPlayCount(count) : undefined} />
      ))}
    </ScrollCarousel>
  );
}

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

  // deterministic hero gradient per album
  const heroBg = (album: Album): string => {
    let h = 0;
    for (let i = 0; i < album.id.length; i++) h = (h * 31 + album.id.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    return `linear-gradient(135deg, hsl(${hue} 45% 32%) 0%, hsl(${(hue + 40) % 360} 50% 18%) 100%)`;
  };

  if (albums.length === 0) {
    return (
      <div className="flex h-[305px] items-end gap-4 overflow-hidden rounded-[6px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-full flex-1 animate-pulse rounded-[6px] bg-[var(--elevated)]" />
        ))}
      </div>
    );
  }

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
            {albums.slice(p * perPage, (p + 1) * perPage).map((album) => (
              <button
                key={album.id}
                type="button"
                onClick={() => navigate({ view: "album", id: album.id })}
                className="fs-hero-card group flex h-[305px] flex-1 flex-col items-center justify-between p-5 text-center"
                style={{ background: heroBg(album) }}
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
            ))}
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

function GenresGrid({ genres }: { genres: GenreInfo[] }) {
  const navigate = useRouterStore((s) => s.navigate);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? genres : genres.slice(0, 21);

  if (genres.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-xl font-extrabold tracking-tight text-[var(--fg)]">Genres</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="h-[42px] animate-pulse rounded-[4px] bg-[var(--elevated)]" />
          ))}
        </div>
      </section>
    );
  }

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
  const { data } = useJfQuery("home:playlists", () => fetchPlaylistsPage({ limit: 12 }), 5 * 60_000);
  const navigate = useRouterStore((s) => s.navigate);
  const playlists: Playlist[] = data?.playlists ?? [];

  if (playlists.length === 0) return null;

  return (
    <ScrollCarousel title="Playlists" itemWidth={164}>
      {playlists.map((pl) => (
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
            {pl.trackCount} tracks · {formatLongDuration(pl.duration)}
          </div>
        </div>
      ))}
    </ScrollCarousel>
  );
}

export function HomeView() {
  const features = useAlbumQuery("home:features", "DateCreated", "Descending");
  const mostPlayed = useAlbumQuery("home:mostPlayed", "PlayCount", "Descending");
  const recentlyAdded = useAlbumQuery("home:recentlyAdded", "DateCreated", "Descending");
  const recentlyReleased = useAlbumQuery("home:recentlyReleased", "PremiereDate", "Descending");
  const explore = useJfQuery("home:explore", () => fetchAlbumsPage({ sortBy: "Random", limit: ALBUM_LIST_LIMIT }), 15 * 60_000);
  const recentlyPlayed = useAlbumQuery("home:recentlyPlayed", "DatePlayed", "Descending");
  const genres = useJfQuery("home:genres", () => fetchGenres(200), 30 * 60_000);

  return (
    <div className="flex flex-col gap-10 px-8 pb-24 pt-8" data-testid="home-view">
      <HeroFeatureCarousel albums={features.data?.albums.slice(0, 10) ?? []} />
      <GenresGrid genres={genres.data ?? []} />

      {mostPlayed.loading ? <SkeletonCarousel title="Most played" /> : <AlbumCarousel title="Most played" albums={mostPlayed.data?.albums ?? []} />}
      {recentlyAdded.loading ? <SkeletonCarousel title="Recently added" /> : <AlbumCarousel title="Recently added" albums={recentlyAdded.data?.albums ?? []} />}
      {recentlyReleased.loading ? (
        <SkeletonCarousel title="Recently released" />
      ) : (
        <AlbumCarousel title="Recently released" albums={recentlyReleased.data?.albums ?? []} />
      )}
      {explore.loading ? <SkeletonCarousel title="Explore" /> : <AlbumCarousel title="Explore" albums={explore.data?.albums ?? []} />}
      {recentlyPlayed.loading || recentlyPlayed.data?.albums.length === 0 ? null : (
        <AlbumCarousel title="Recently played" albums={recentlyPlayed.data?.albums ?? []} />
      )}
      <PlaylistCards />
    </div>
  );
}
