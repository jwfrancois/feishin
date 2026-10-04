"use client";
// Feishin rebuild — fullscreen now playing (hero bg, tabs: UP NEXT / RELATED / LYRICS / VISUALIZER)
// Lyrics come from Jellyfin's lyrics API; related tracks from the item's Similar endpoint.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Settings2, PictureInPicture2, Pause, Play } from "lucide-react";
import { useRouterStore } from "@/store/router-store";
import { usePlayerStore } from "@/store/player-store";
import { fetchAlbum, fetchArtist, similarAlbumsSongs, fetchPlainLyricsAsSynced, type LyricLine } from "@/lib/jellyfin";
import type { Album, Artist, Song } from "@/lib/types";
import { useJfQuery } from "@/hooks/use-jf";
import { ItemImage, FavoriteHeart } from "../shared";
import { cn } from "@/lib/utils";
import { useSongActions } from "../song-actions";

type Tab = "UP NEXT" | "RELATED" | "LYRICS" | "VISUALIZER";

function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let audio = audioRef.current;
    if (!audio) {
      audio = document.querySelector("audio");
      audioRef.current = audio;
    }
    if (!audio) return;

    if (!analyserRef.current) {
      try {
        const actx = new AudioContext();
        const src = actx.createMediaElementSource(audio);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 128;
        src.connect(analyser);
        analyser.connect(actx.destination);
        analyserRef.current = analyser;
      } catch {
        return; // already connected or unsupported
      }
    }
    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const BARS = 48;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const w = (canvas.width = canvas.clientWidth * 2);
      const h = (canvas.height = canvas.clientHeight * 2);
      ctx.clearRect(0, 0, w, h);
      analyser.getByteFrequencyData(data);
      const barW = w / BARS;
      for (let i = 0; i < BARS; i++) {
        const v = data[Math.floor((i / BARS) * data.length)] / 255;
        const bh = Math.max(4, v * h * 0.8);
        const x = i * barW + barW * 0.15;
        const grad = ctx.createLinearGradient(0, h - bh, 0, h);
        grad.addColorStop(0, "rgba(255,255,255,0.95)");
        grad.addColorStop(1, "rgba(255,255,255,0.25)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, h - bh, barW * 0.7, bh, 6);
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  void isPlaying;

  return (
    <div className="flex h-full items-end justify-center pb-8">
      <canvas ref={canvasRef} className="h-[320px] w-full max-w-xl" aria-label="Audio visualizer" />
    </div>
  );
}

function LyricsPanel() {
  const song = usePlayerStore((s) => s.queue[s.currentIndex]);
  const position = usePlayerStore((s) => s.position);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { data, loading } = useJfQuery(
    song ? `lyrics:${song.id}` : null,
    async () => {
      if (!song) return null;
      // 1) Jellyfin's own lyrics
      const server = await fetchPlainLyricsAsSynced(song.id, song.duration || 0);
      if (server && server.length > 0) return { lines: server, source: "server" as const };
      // 2) Library Agent fallback — live LRCLIB lookup, cached in the agent DB
      try {
        const res = await fetch(
          `/api/agent/enrichment/${song.id}?kind=lyrics&fetch=1&name=${encodeURIComponent(song.name)}&artist=${encodeURIComponent(song.artist)}${
            song.album ? `&album=${encodeURIComponent(song.album)}` : ""
          }&duration=${Math.round(song.duration || 0)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as { lines?: { time: number; text: string }[] | null };
          if (data.lines && data.lines.length > 0) return { lines: data.lines, source: "agent" as const };
        }
      } catch {
        /* agent unavailable */
      }
      return null;
    },
    10 * 60_000,
  );

  const lyrics: LyricLine[] = data?.lines ?? [];
  const agentLyrics = data?.source === "agent";
  const activeIndex = lyrics.length > 0 ? getActiveLyricIndex(lyrics, position) : 0;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || lyrics.length === 0) return;
    const active = el.querySelector<HTMLElement>(`[data-lyric-index="${activeIndex}"]`);
    if (active) {
      const top = active.offsetTop - el.clientHeight / 2 + active.clientHeight / 2;
      el.scrollTo({ top, behavior: "smooth" });
    }
  }, [activeIndex, lyrics.length]);

  if (!song) return null;

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-6 w-2/3 animate-pulse rounded bg-white/10" />
        ))}
      </div>
    );
  }

  if (lyrics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center py-8">
        <div className="text-center text-white/50">
          <p className="text-[15px] font-bold">No lyrics available</p>
          <p className="mt-1 text-[12.5px]">
            {song.name} — {song.artist}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto py-8 text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="lyrics-panel">
      {agentLyrics && (
        <div className="mx-auto mb-2 w-fit rounded-full bg-white/10 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/60">
          Lyrics via LRCLIB · Library Agent
        </div>
      )}
      {lyrics.map((line, i) => (
        <p
          key={i}
          data-lyric-index={i}
          className={cn(
            "mx-auto max-w-md py-3 text-[22px] font-bold leading-snug transition-all duration-300",
            i === activeIndex ? "scale-105 text-[var(--fg)]" : i < activeIndex ? "text-[var(--fg-dim)] opacity-50" : "text-[var(--fg-dim)] opacity-75",
          )}
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}

function UpNextPanel() {
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const playAt = usePlayerStore((s) => s.playAt);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);

  const upcoming = queue.slice(currentIndex + 1);

  return (
    <div className="h-full overflow-y-auto py-4" data-testid="up-next-panel">
      {upcoming.length === 0 && (
        <div className="py-10 text-center text-[13.5px] text-[var(--fg-dim)]">Nothing up next</div>
      )}
      {upcoming.map((song, i) => (
        <div
          key={`${song.id}-${i}`}
          className="fs-row flex cursor-default items-center gap-3 rounded-[4px] px-4 py-2"
          onDoubleClick={() => playAt(currentIndex + 1 + i)}
        >
          <ItemImage src={song.albumCoverUrl} alt="" className="h-10 w-10" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13.5px] font-semibold text-[var(--fg)]">{song.name}</div>
            <div className="truncate text-[12.5px] text-[var(--fg-dim)]">{song.artist}</div>
          </div>
          <button
            type="button"
            aria-label="Remove"
            onClick={() => removeFromQueue(currentIndex + 1 + i)}
            className="fs-icon-btn p-1 text-[var(--fg-dim)]"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function RelatedPanel() {
  const song = usePlayerStore((s) => s.queue[s.currentIndex]);
  const navigate = useRouterStore((s) => s.navigate);
  const { data, loading } = useJfQuery(
    song ? `related:${song.id}` : null,
    async () => (song?.albumId ? similarAlbumsSongs(song.albumId, 12) : ([] as Song[])),
    10 * 60_000,
  );
  const related: Song[] = data ?? [];

  if (loading) {
    return (
      <div className="flex flex-col gap-2 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-[4px] bg-white/5" />
        ))}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-4">
      {related.length === 0 && (
        <div className="py-10 text-center text-[13.5px] text-[var(--fg-dim)]">No related tracks found</div>
      )}
      {related.map((s) => (
        <div key={s.id} className="fs-row flex cursor-default items-center gap-3 rounded-[4px] px-4 py-2">
          <ItemImage src={s.albumCoverUrl} alt="" className="h-10 w-10" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13.5px] font-semibold text-[var(--fg)]">{s.name}</div>
            <button
              type="button"
              onClick={() => s.artistId && navigate({ view: "artist", id: s.artistId })}
              className="block max-w-full truncate text-left text-[12.5px] text-[var(--fg-dim)] hover:text-[var(--fg)]"
            >
              {s.artist}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function NowPlayingView() {
  const navigate = useRouterStore((s) => s.navigate);
  const song = usePlayerStore((s) => s.queue[s.currentIndex]);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const toggle = usePlayerStore((s) => s.toggle);
  const fav = usePlayerStore((s) => (song ? !!s.favoriteTracks[song.id] : false));
  const toggleFav = usePlayerStore((s) => s.toggleTrackFavorite);
  const actions = useSongActions();
  const [tab, setTab] = useState<Tab>("LYRICS");

  const albumQ = useJfQuery(song?.albumId ? `album:${song.albumId}` : null, () => fetchAlbum(song!.albumId!), 10 * 60_000);
  const artistQ = useJfQuery(song?.artistId ? `artist:${song.artistId}` : null, () => fetchArtist(song!.artistId!), 10 * 60_000);
  const album: Album | undefined = albumQ.data ?? undefined;
  const artist: Artist | undefined = artistQ.data ?? undefined;
  const cover = song?.albumCoverUrl ?? album?.coverUrl;

  if (!song) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-[var(--bg)]" data-testid="now-playing">
        <div className="text-center text-[var(--fg-dim)]">
          <p className="mb-2 text-[15px] font-bold text-[var(--fg)]">Nothing playing</p>
          <p className="text-[13px]">Play a song to open the full screen player</p>
          <button type="button" className="fs-pill mt-6" onClick={() => navigate({ view: "home" })}>
            Back to home
          </button>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => navigate({ view: "home" })}
          className="fs-icon-btn absolute left-4 top-4 h-9 w-9 bg-[var(--elevated)]"
        >
          <ChevronDown size={18} />
        </button>
      </div>
    );
  }

  const heroColor = album?.color ?? [55, 116, 252];
  const [r, g, b] = heroColor;

  return (
    <div className="relative h-full overflow-hidden" data-testid="now-playing">
      {/* blurred background from album art */}
      <div className="fs-fs-bg" style={{ backgroundImage: `url(${cover})` }} />
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(${r},${g},${b},0.25), rgba(10,10,10,0.6) 80%)` }} />

      <div className="relative flex h-full flex-col">
        {/* top controls */}
        <div className="flex items-center gap-2 p-4">
          <button
            type="button"
            aria-label="Minimize player"
            onClick={() => navigate({ view: "home" })}
            className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-black/40 text-white backdrop-blur hover:bg-black/60"
          >
            <ChevronDown size={17} />
          </button>
          <button
            type="button"
            aria-label="Player settings"
            onClick={() => navigate({ view: "settings", section: "playback" })}
            className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-black/40 text-white backdrop-blur hover:bg-black/60"
          >
            <Settings2 size={16} />
          </button>
          <button
            type="button"
            aria-label="Exit full screen"
            onClick={() => navigate({ view: "home" })}
            className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-black/40 text-white backdrop-blur hover:bg-black/60"
          >
            <PictureInPicture2 size={15} />
          </button>
        </div>

        {/* main content */}
        <div className="flex min-h-0 flex-1 items-stretch justify-center gap-12 px-10 pb-10">
          {/* left: art + info */}
          <div className="flex w-[400px] shrink-0 flex-col items-center justify-center">
            <ItemImage
              src={cover}
              alt={`${song.album} cover`}
              className="h-[400px] w-[400px] shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
            />
            <div className="mt-6 text-center">
              <div className="flex items-center justify-center gap-2">
                <h1 className="truncate text-[28px] font-black tracking-tight text-white text-shadow-hero">{song.name}</h1>
                <FavoriteHeart isFavorite={fav} onToggle={() => toggleFav(song.id)} className="[&_svg]:text-white/70" />
              </div>
              <button
                type="button"
                onClick={() => artist && navigate({ view: "artist", id: artist.id })}
                className="mt-1 block text-[15px] text-white/80 hover:text-white hover:underline"
              >
                {song.artist}
              </button>
              <button
                type="button"
                onClick={() => album && navigate(song?.isPodcast ? { view: "podcast", id: album.id } : { view: "album", id: album.id })}
                className="mt-0.5 block text-[14px] text-white/60 hover:text-white hover:underline"
              >
                {song.album}
              </button>
              <div className="mt-3 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white/50">
                {song.container && (
                  <>
                    <span>{song.container.toUpperCase()}</span>
                    <span>·</span>
                  </>
                )}
                {song.year ? (
                  <>
                    <span>{song.year}</span>
                  </>
                ) : null}
                {song.genre && (
                  <>
                    <span>·</span>
                    <span>{song.genre}</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={toggle}
                className="mx-auto mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-transform hover:scale-105"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={18} className="fill-current" /> : <Play size={18} className="ml-0.5 fill-current" />}
              </button>
            </div>
          </div>

          {/* right: tabs panel */}
          <div className="flex min-w-0 flex-1 flex-col rounded-[4px] bg-black/25 backdrop-blur-md">
            <div className="flex shrink-0 items-center justify-around border-b border-white/10 px-4 pt-1">
              {(["UP NEXT", "RELATED", "LYRICS", "VISUALIZER"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "relative px-4 py-3.5 text-[12px] font-bold tracking-[0.1em] text-white/60 transition-colors hover:text-white",
                    tab === t && "text-white",
                  )}
                >
                  {t}
                  {tab === t && <span className="absolute inset-x-2 bottom-0 h-[2px] bg-white" />}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 px-6">
              {tab === "LYRICS" && <LyricsPanel />}
              {tab === "UP NEXT" && <UpNextPanel />}
              {tab === "RELATED" && <RelatedPanel />}
              {tab === "VISUALIZER" && <Visualizer />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getActiveLyricIndex(lines: LyricLine[], position: number): number {
  let active = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= position) active = i;
    else break;
  }
  return active;
}
