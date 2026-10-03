"use client";
// Feishin rebuild — album artist detail route (hero with blurred bg, about, discography — faithful)
import { useMemo, useState } from "react";
import { Play, FastForward, ChevronDown, Radio } from "lucide-react";
import {
  getArtist,
  getAlbumsByArtist,
  getTracksByArtist,
  trackToSong,
  rgbStr,
} from "@/lib/library";
import { useRouterStore } from "@/store/router-store";
import { usePlayerStore } from "@/store/player-store";
import { ItemImage, RatingStars, FavoriteHeart, Kebab } from "../shared";
import { AlbumCard } from "../album-card";
import { SongTable } from "../song-table";
import { useSongActions } from "../song-actions";
import { ContextMenuNS as ContextMenu } from "@/components/ui/context-menu";
import { toast } from "sonner";

export function ArtistDetailView({ artistId }: { artistId: string }) {
  const artist = getArtist(artistId);
  const navigate = useRouterStore((s) => s.navigate);
  const actions = useSongActions();
  const fav = usePlayerStore((s) => (artist ? !!s.favoriteArtists[artist.id] : false));
  const toggleArtistFav = usePlayerStore((s) => s.toggleArtistFavorite);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [tab, setTab] = useState<"discography" | "tracks">("discography");

  const albums = useMemo(() => (artist ? getAlbumsByArtist(artist.id) : []), [artist]);
  const topSongs = useMemo(() => {
    if (!artist) return [];
    return getTracksByArtist(artist.id)
      .slice(0, 12)
      .map((t) => {
        const album = albums.find((a) => a.id === t.albumId);
        return trackToSong(t, album?.coverUrl);
      });
  }, [artist, albums]);

  if (!artist) {
    return <div className="p-8 text-[var(--fg-dim)]">Artist not found</div>;
  }

  const allSongs = albums.flatMap((a) => getTracksByArtist(artist.id).map((t) => trackToSong(t, a.coverUrl)));
  const trackCount = albums.reduce((n, a) => n + a.trackIds.length, 0);
  const bio = `${artist.name} is an integral part of the ${artist.genre.toLowerCase()} scene. Since their debut, they have demonstrated the full range of their influences, crafting compositions that balance nostalgia with forward-thinking production. Both powerful and melodic, the songs are true anthems which make you wander in an atmosphere combining energy and hope.`;
  const [r, g, b] = artist.color;

  return (
    <div className="pb-24" data-testid="artist-detail">
      {/* hero with blurred background */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${artist.imageUrl})`, filter: "blur(70px) brightness(0.4) saturate(1.2)", transform: "scale(1.3)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--bg)]/40 to-[var(--bg)]" />
        <div className="relative flex items-end gap-6 px-8 pb-6 pt-10">
          <ItemImage
            src={artist.imageUrl}
            alt={`${artist.name} image`}
            className="h-[210px] w-[210px] shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
          />
          <div className="flex min-w-0 flex-1 flex-col justify-end pb-1">
            <div className="fs-title-xs mb-1">Album Artist</div>
            <h1 className="mb-1.5 truncate text-[38px] font-black leading-tight tracking-tight text-[var(--fg)] text-shadow-hero">
              {artist.name}
            </h1>
            <div className="mb-2 text-[13px] text-[var(--fg-dim)]">
              {albums.length} albums · {trackCount} tracks
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 self-end pb-1">
            <div className="flex items-center gap-3">
              <RatingStars value={4} onChange={(v) => toast(`Rated ${v || "0"} stars`, { duration: 1200 })} />
              <FavoriteHeart
                isFavorite={fav}
                onToggle={() => {
                  toggleArtistFav(artist.id);
                  toast(!fav ? "Added to favorites" : "Removed from favorites");
                }}
              />
              <button type="button" aria-label="More" className="fs-icon-btn p-1">
                <Kebab />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="fs-pill" onClick={() => actions.play(allSongs, 0)}>
                <Play size={15} className="fill-current" />
                Play
              </button>
              <button
                type="button"
                className="fs-pill"
                onClick={() => {
                  const songs = getTracksByArtist(artist.id).map((t) => trackToSong(t));
                  if (songs.length) {
                    actions.play(songs, Math.floor(Math.random() * songs.length));
                    toast("Shuffled artist radio", { duration: 1200 });
                  }
                }}
              >
                <Radio size={15} />
                Radio
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* sub-nav */}
      <div className="flex items-center gap-6 px-8 pb-4">
        <button
          type="button"
          onClick={() => setTab("discography")}
          className={`text-[12px] font-bold uppercase tracking-[0.08em] ${tab === "discography" ? "text-[var(--fg)]" : "text-[var(--fg-dim)] hover:text-[var(--fg)]"}`}
        >
          View Discography
        </button>
        <button
          type="button"
          onClick={() => setTab("tracks")}
          className={`text-[12px] font-bold uppercase tracking-[0.08em] ${tab === "tracks" ? "text-[var(--fg)]" : "text-[var(--fg-dim)] hover:text-[var(--fg)]"}`}
        >
          View All Tracks
        </button>
        <button
          type="button"
          onClick={() => toast("Artist radio started", { duration: 1200 })}
          className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--fg-dim)] hover:text-[var(--fg)]"
        >
          <Radio size={13} />
          Artist Radio
        </button>
      </div>

      {/* about */}
      <div className="px-8 pb-6">
        <h3 className="mb-2 text-xl font-extrabold text-[var(--fg)]">About {artist.name}</h3>
        <p
          className={`max-w-4xl text-[13.5px] leading-relaxed text-[var(--fg-dim)] ${aboutExpanded ? "" : "line-clamp-3"}`}
        >
          {bio}
        </p>
        <button
          type="button"
          onClick={() => setAboutExpanded((v) => !v)}
          className="mx-auto mt-2 flex items-center justify-center text-[var(--fg-dim)] hover:text-[var(--fg)]"
          aria-label={aboutExpanded ? "Collapse" : "Expand"}
        >
          <ChevronDown size={18} className={aboutExpanded ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
      </div>

      {tab === "discography" ? (
        <div className="px-8">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-xl font-extrabold text-[var(--fg)]">Album</h2>
            <span className="rounded-[4px] bg-[var(--elevated)] px-2 py-0.5 text-[11px] font-bold text-[var(--fg-dim)]">
              {albums.length}
            </span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {albums.map((album) => (
              <div key={album.id} className="relative">
                <span className="absolute -right-1.5 -top-1.5 z-10 min-w-[22px] rounded-[4px] bg-[var(--primary)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--primary-contrast)]">
                  {album.trackIds.length}
                </span>
                <AlbumCard album={album} width="w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-8">
          <SongTable
            songs={topSongs}
            columns={["tracknum", "title", "album", "plays", "duration", "fav"]}
          />
        </div>
      )}
    </div>
  );
}
