"use client";
// Feishin rebuild — album artist detail route (hero with blurred bg, about, discography — faithful)
import { useMemo, useState } from "react";
import { Play, ChevronDown, Radio, ExternalLink, Globe } from "lucide-react";
import { setLike, fetchArtist, fetchArtistAlbums, fetchArtistTopSongs } from "@/lib/jellyfin";
import type { Artist, Album, Song } from "@/lib/types";
import { useJfQuery } from "@/hooks/use-jf";
import { getAgentFinding, getAgentDiscography, type DiscogRelease } from "@/lib/agent-client";
import { useRouterStore } from "@/store/router-store";
import { usePlayerStore } from "@/store/player-store";
import { ItemImage, LikeButton, FavoriteHeart, Kebab } from "../shared";
import { AlbumCard } from "../album-card";
import { SongTable } from "../song-table";
import { useSongActions } from "../song-actions";
import { toast } from "sonner";

const DEFAULT_BIO_TEMPLATE = (name: string) =>
  `${name} is an album artist in your library. Browse the discography below to explore their releases, or start artist radio to hear a rotating mix of their most-played tracks.`;

export function ArtistDetailView({ artistId }: { artistId: string }) {
  const navigate = useRouterStore((s) => s.navigate);
  const actions = useSongActions();
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [tab, setTab] = useState<"discography" | "tracks">("discography");

  const artistQ = useJfQuery(`artist:${artistId}`, () => fetchArtist(artistId), 10 * 60_000);
  const albumsQ = useJfQuery(`artist:${artistId}:albums`, () => fetchArtistAlbums(artistId), 5 * 60_000);
  const topQ = useJfQuery(`artist:${artistId}:top`, () => fetchArtistTopSongs(artistId, 12), 5 * 60_000);

  const artist: Artist | undefined = artistQ.data ?? undefined;
  const albums: Album[] = useMemo(() => albumsQ.data ?? [], [albumsQ.data]);
  const topSongs: Song[] = useMemo(() => topQ.data ?? [], [topQ.data]);
  const fav = usePlayerStore((s) => (artist ? !!s.favoriteArtists[artist.id] : false));

  const [likeOverride, setLikeOverride] = useState<boolean | null>(null);
  const liked = likeOverride ?? !!artist?.likes;

  // Library Agent: the internet info is shown ALONGSIDE the library data, not
  // only as a fallback — the Wikipedia biography (first visit triggers the live
  // lookup; afterwards it is served from the agent DB) and the MusicBrainz
  // discography for releases that are not in the Jellyfin library.
  // NOTE: hooks must run unconditionally — null key when not ready.
  const agentBioQ = useJfQuery(
    artist ? `agent:bio:${artist.id}` : null,
    async () => {
      const a = artist!;
      const { finding } = await getAgentFinding(a.id, "bio", { name: a.name, fetch: true });
      return finding && finding.status === "found" && typeof finding.payload.text === "string" ? finding : null;
    },
    30 * 60_000,
  );

  const discogQ = useJfQuery(
    artist ? `agent:discog:${artist.id}` : null,
    async () => {
      const a = artist!;
      return getAgentDiscography(a.id, a.name, true);
    },
    30 * 60_000,
  );

  // hooks above the early returns — internet releases filtered once per data change
  const internetReleases: DiscogRelease[] = useMemo(
    () => (discogQ.data?.releases ?? []).filter((r) => !r.inLibrary),
    [discogQ.data],
  );

  const toggleArtistLike = () => {
    if (!artist) return;
    const next = !liked;
    setLikeOverride(next);
    setLike(artist.id, next ? true : null).catch(() => {
      setLikeOverride(null);
      toast.error("Failed to update like");
    });
  };

  if (artistQ.loading) {
    return (
      <div className="px-8 pb-24 pt-10" data-testid="artist-detail-loading">
        <div className="flex items-end gap-6">
          <div className="h-[210px] w-[210px] shrink-0 animate-pulse rounded-[4px] bg-[var(--elevated)]" />
          <div className="flex-1 space-y-3 pb-2">
            <div className="h-3 w-24 animate-pulse rounded bg-[var(--elevated)]" />
            <div className="h-10 w-1/2 animate-pulse rounded bg-[var(--elevated)]" />
          </div>
        </div>
      </div>
    );
  }

  if (!artist) {
    return <div className="p-8 text-[var(--fg-dim)]">Artist not found</div>;
  }

  const trackCount = albums.reduce((n, a) => n + (a.trackCount || 0), 0);
  const agentBio = agentBioQ.data ?? null;
  const agentBioText = typeof agentBio?.payload.text === "string" ? agentBio.payload.text : "";
  const libOverview = artist.overview?.trim() ?? "";
  const matchedInLibrary = (discogQ.data?.releases.length ?? 0) - internetReleases.length;

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
              {albums.length} albums{trackCount > 0 ? ` · ${trackCount} tracks` : ""}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 self-end pb-1">
            <div className="flex items-center gap-3">
              <LikeButton liked={liked} onToggle={toggleArtistLike} size={16} />
              <FavoriteHeart
                isFavorite={fav}
                onToggle={() => {
                  usePlayerStore.getState().toggleArtistFavorite(artist.id);
                  toast(!fav ? "Added to favorites" : "Removed from favorites");
                }}
              />
              <button type="button" aria-label="More" className="fs-icon-btn p-1">
                <Kebab />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="fs-pill"
                onClick={async () => {
                  // play all tracks from the discography (first album, then next pages)
                  if (topSongs.length > 0) {
                    actions.play(topSongs, 0);
                  } else if (albums.length > 0) {
                    actions.playAlbum(albums[0]);
                  }
                }}
              >
                <Play size={15} className="fill-current" />
                Play
              </button>
              <button
                type="button"
                className="fs-pill"
                onClick={async () => {
                  const { fetchRandomSongs } = await import("@/lib/jellyfin");
                  const songs = await fetchRandomSongs(30);
                  if (songs.length) {
                    actions.play(songs, Math.floor(Math.random() * songs.length));
                    toast("Artist radio started", { duration: 1200 });
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
          onClick={async () => {
            const { fetchRandomSongs } = await import("@/lib/jellyfin");
            const songs = await fetchRandomSongs(30);
            if (songs.length) {
              actions.play(songs, 0);
              toast("Artist radio started", { duration: 1200 });
            }
          }}
          className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--fg-dim)] hover:text-[var(--fg)]"
        >
          <Radio size={13} />
          Artist Radio
        </button>
      </div>

      {/* about — library overview AND the agent's internet biography, each attributed */}
      <div className="px-8 pb-6">
        <h3 className="mb-2 text-xl font-extrabold text-[var(--fg)]">About {artist.name}</h3>
        <div className={aboutExpanded ? "" : "line-clamp-3"}>
          {libOverview && (
            <>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-dim)]">From your Jellyfin library</div>
              <p className="mb-4 max-w-4xl whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--fg-dim)]">{libOverview}</p>
            </>
          )}
          {agentBioText && (
            <>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-dim)]">
                Biography via {agentBio?.source === "wikipedia" ? "Wikipedia" : agentBio?.source} · Library Agent
              </div>
              <p className="max-w-4xl whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--fg-dim)]">{agentBioText}</p>
            </>
          )}
          {!libOverview && !agentBioText && (
            <p className="max-w-4xl whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--fg-dim)]">{DEFAULT_BIO_TEMPLATE(artist.name)}</p>
          )}
        </div>
        {(libOverview || agentBioText) && (
          <button
            type="button"
            onClick={() => setAboutExpanded((v) => !v)}
            className="mx-auto mt-2 flex items-center justify-center text-[var(--fg-dim)] hover:text-[var(--fg)]"
            aria-label={aboutExpanded ? "Collapse" : "Expand"}
          >
            <ChevronDown size={18} className={aboutExpanded ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
        )}
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
          {albumsQ.loading ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-square w-full animate-pulse rounded-[4px] bg-[var(--elevated)]" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {albums.map((album) => (
                <div key={album.id} className="relative">
                  {!!album.trackCount && (
                    <span className="absolute -right-1.5 -top-1.5 z-10 min-w-[22px] rounded-[4px] bg-[var(--primary)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--primary-contrast)]">
                      {album.trackCount}
                    </span>
                  )}
                  <AlbumCard album={album} width="w-full" />
                </div>
              ))}
            </div>
          )}

          {/* internet discography — releases NOT in the library, scraped by the agent from MusicBrainz */}
          <div className="mt-10" data-testid="internet-discography">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="flex items-center gap-2 text-xl font-extrabold text-[var(--fg)]">
                <Globe size={17} className="text-[var(--primary)]" />
                From the internet
              </h2>
              <span className="rounded-[4px] bg-[var(--elevated)] px-2 py-0.5 text-[11px] font-bold text-[var(--fg-dim)]">{internetReleases.length}</span>
              {discogQ.data && (
                <span className="text-[11px] text-[var(--fg-dim)]">
                  MusicBrainz{matchedInLibrary > 0 ? ` · ${matchedInLibrary} release${matchedInLibrary === 1 ? "" : "s"} matched your library` : ""}
                </span>
              )}
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>
            {discogQ.loading ? (
              <div className="max-w-3xl flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-[4px] bg-[var(--elevated)]" />
                ))}
              </div>
            ) : internetReleases.length === 0 ? (
              <p className="text-[13px] text-[var(--fg-dim)]">
                {discogQ.data ? "Every MusicBrainz release for this artist is already in your library." : "No internet discography found for this artist."}
              </p>
            ) : (
              <div className="max-w-3xl flex flex-col">
                {internetReleases.map((r) => (
                  <a
                    key={r.mbid}
                    href={`https://musicbrainz.org/release-group/${r.mbid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 border-b border-[var(--border)] px-2 py-2.5 transition-colors hover:bg-[var(--hover)]"
                  >
                    <span className="w-11 shrink-0 text-[12px] tabular-nums text-[var(--fg-dim)]">{r.year ?? "—"}</span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--fg)]">{r.title}</span>
                    <span className="shrink-0 rounded-[4px] bg-[var(--elevated)] px-2 py-0.5 text-[11px] font-bold text-[var(--fg-dim)]">
                      {r.primaryType ?? "Release"}
                      {r.secondaryTypes && r.secondaryTypes.length > 0 ? ` · ${r.secondaryTypes.join(" / ")}` : ""}
                    </span>
                    <span className="hidden shrink-0 rounded-[4px] bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-400 sm:inline">not in library</span>
                    <ExternalLink size={12} className="shrink-0 text-[var(--fg-dim)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                ))}
              </div>
            )}
            {discogQ.data && (
              <p className="mt-2 text-[11px] text-[var(--fg-dim)]">
                Internet releases scraped by the Library Agent from MusicBrainz — they are not part of your Jellyfin library. {matchedInLibrary > 0 ? "Releases that matched your library are not listed." : ""}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="px-8">
          {topQ.loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[52px] animate-pulse rounded-[4px] bg-[var(--elevated)]" />
              ))}
            </div>
          ) : (
            <SongTable
              songs={topSongs}
              columns={["tracknum", "title", "album", "plays", "duration", "fav"]}
            />
          )}
        </div>
      )}
    </div>
  );
}
