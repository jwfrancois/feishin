"use client";
// Feishin rebuild — player bar (feishin's 90px playerbar: left/center/right grid)
import { useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Square,
  ListMusic,
  Volume2,
  Volume1,
  VolumeX,
  SlidersHorizontal,
  MicVocal,
  Star,
  Maximize2,
  AudioWaveform,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/store/player-store";
import { useRouterStore } from "@/store/router-store";
import { useSettingsStore } from "@/store/settings-store";
import { formatDuration } from "@/lib/format";
import { setLike } from "@/lib/jellyfin";
import { ItemImage, LikeButton, FavoriteHeart, Kebab } from "../shared";
import { FsSlider } from "./fs-slider";
import { HifiVisualizer } from "./hifi/hifi-visualizer";
import { useHifiStore, useHifiUi } from "@/store/hifi-store";
import { useSongActions } from "../song-actions";
import { SongContextMenuContent } from "../song-actions";
import { DropdownMenuNS as DropdownMenu } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

function CenterControls() {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const toggle = usePlayerStore((s) => s.toggle);
  const next = usePlayerStore((s) => s.next);
  const previous = usePlayerStore((s) => s.previous);
  const stop = usePlayerStore((s) => s.stop);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const toggleQueue = useSettingsStore((s) => s.toggleRightQueue);
  const queueLength = usePlayerStore((s) => s.queue.length);
  const hasQueue = queueLength > 0;

  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        type="button"
        title="Stop"
        aria-label="Stop"
        disabled={!hasQueue}
        onClick={stop}
        className="fs-icon-btn p-2 disabled:opacity-40"
      >
        <Square size={15} className="fill-current" />
      </button>
      <button
        type="button"
        title="Shuffle"
        aria-label="Toggle shuffle"
        onClick={() => {
          toggleShuffle();
          toast(shuffle ? "Shuffle off" : "Shuffle on", { duration: 1200 });
        }}
        className={cn("fs-icon-btn p-2", shuffle && "text-[var(--primary)]")}
      >
        <Shuffle size={17} />
      </button>
      <button type="button" title="Previous" aria-label="Previous song" disabled={!hasQueue} onClick={previous} className="fs-icon-btn p-2 disabled:opacity-40">
        <SkipBack size={18} className="fill-current" />
      </button>
      <button
        type="button"
        title={isPlaying ? "Pause" : "Play"}
        aria-label={isPlaying ? "Pause" : "Play"}
        disabled={!hasQueue}
        onClick={toggle}
        className="mx-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--fg)] text-[var(--bg)] transition-transform hover:scale-105 disabled:opacity-40"
      >
        {isPlaying ? <Pause size={19} className="fill-current" /> : <Play size={19} className="ml-0.5 fill-current" />}
      </button>
      <button type="button" title="Next" aria-label="Next song" disabled={!hasQueue} onClick={next} className="fs-icon-btn p-2 disabled:opacity-40">
        <SkipForward size={18} className="fill-current" />
      </button>
      <button
        type="button"
        title="Repeat"
        aria-label="Toggle repeat"
        onClick={() => {
          cycleRepeat();
          toast(`Repeat: ${usePlayerStore.getState().repeat}`, { duration: 1200 });
        }}
        className={cn("fs-icon-btn p-2", repeat !== "off" && "text-[var(--primary)]")}
      >
        {repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
      </button>
      <button
        type="button"
        title="Toggle queue"
        aria-label="Toggle play queue"
        onClick={toggleQueue}
        className="fs-icon-btn p-2"
      >
        <ListMusic size={17} />
      </button>
    </div>
  );
}

function LeftControls() {
  const song = usePlayerStore((s) => s.queue[s.currentIndex]);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const queue = usePlayerStore((s) => s.queue);
  const navigate = useRouterStore((s) => s.navigate);
  const sidebarCollapsed = useSettingsStore((s) => s.sidebar.collapsed);
  const actions = useSongActions();
  const fav = usePlayerStore((s) => (song ? !!s.favoriteTracks[song.id] : false));
  const cover = song?.albumCoverUrl;
  const [likeOverride, setLikeOverride] = useState<{ id: string; liked: boolean } | null>(null);
  const liked = likeOverride && song && likeOverride.id === song.id ? likeOverride.liked : !!song?.likes;

  const toggleLike = () => {
    if (!song) return;
    const next = !liked;
    setLikeOverride({ id: song.id, liked: next });
    setLike(song.id, next ? true : null).catch(() => {
      setLikeOverride(null);
      toast.error("Failed to update like");
    });
  };

  if (!song) {
    return (
      <div className="flex h-full items-center gap-3 pl-3 text-[var(--fg-dim)]">
        <ItemImage className="h-14 w-14" alt="No song playing" />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full items-center gap-3 pl-3", sidebarCollapsed && "pl-4")}>
      <ItemImage
        src={cover}
        alt={`${song.album} cover`}
        className="h-14 w-14 cursor-pointer"
      />
      <div className="min-w-0 flex-col justify-center">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate({ view: "now-playing" })}
            className="max-w-full truncate text-left text-[15px] font-bold text-[var(--fg)] hover:underline"
            title={song.name}
          >
            {song.name}
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" aria-label="More options" className="fs-icon-btn opacity-60 hover:opacity-100">
                <Kebab size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="start" sideOffset={6} className="fs-menu-content">
                <SongContextMenuContent song={song} contextQueue={queue} />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        <button
          type="button"
          onClick={() => actions.goToArtist(song.artistId)}
          className="block max-w-full truncate text-left text-[13px] text-[var(--fg-dim)] hover:text-[var(--fg)] hover:underline"
        >
          {song.artist}
        </button>
        <button
          type="button"
          onClick={() => actions.goToAlbum(song.albumId)}
          className="block max-w-full truncate text-left text-[13px] text-[var(--fg-dim)] hover:text-[var(--fg)] hover:underline"
        >
          {song.album}
        </button>
        <span className="sr-only">{isPlaying ? "Playing" : "Paused"}</span>
      </div>
      <div className="ml-1 hidden sm:flex items-center">
        <LikeButton liked={liked} onToggle={toggleLike} />
        <FavoriteHeart isFavorite={fav} onToggle={() => actions.toggleFavorite(song)} />
      </div>
    </div>
  );
}

function RightControls() {
  const song = usePlayerStore((s) => s.queue[s.currentIndex]);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const navigate = useRouterStore((s) => s.navigate);
  const volumeWheelStep = useSettingsStore((s) => s.playback.volumeWheelStep);
  const miniViz = useHifiStore((s) => s.miniViz);
  const hifiEnabled = useHifiStore((s) => s.enabled);
  const toggleHifiPanel = useHifiUi((s) => s.toggle);

  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex h-full flex-col items-end justify-center gap-2 pr-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Auto DJ"
          onClick={() => toast("Auto DJ: random strategy selected", { duration: 1500 })}
          className="ml-1 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[var(--fg-dim)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
        >
          AUTO DJ
        </button>
      </div>
      <div className="flex items-center gap-1">
        {miniViz ? (
          <div className="mr-1 h-7 w-16 overflow-hidden rounded bg-black/30" data-testid="hifi-mini-viz">
            <HifiVisualizer variant="mini" />
          </div>
        ) : null}
        <button
          type="button"
          title="Hi-Fi Studio"
          aria-label="Open Hi-Fi Studio"
          data-testid="hifi-open-btn"
          className={cn("fs-icon-btn p-1.5", hifiEnabled && "text-[var(--primary)]")}
          onClick={toggleHifiPanel}
        >
          <AudioWaveform size={15} />
        </button>
        <button
          type="button"
          title="Player settings"
          aria-label="Player settings"
          className="fs-icon-btn p-1.5"
          onClick={() => navigate({ view: "settings", section: "playback" })}
        >
          <SlidersHorizontal size={15} />
        </button>
        <button
          type="button"
          title="Lyrics"
          aria-label="Lyrics"
          className="fs-icon-btn p-1.5"
          onClick={() => navigate({ view: "now-playing" })}
        >
          <MicVocal size={15} />
        </button>
        <button
          type="button"
          title="Full screen player"
          aria-label="Full screen player"
          className="fs-icon-btn p-1.5"
          onClick={() => navigate({ view: "now-playing" })}
        >
          <Maximize2 size={15} />
        </button>
        <button
          type="button"
          title={muted ? "Unmute" : "Mute"}
          aria-label={muted ? "Unmute" : "Mute"}
          className="fs-icon-btn p-1.5"
          onClick={toggleMute}
        >
          <VolIcon size={16} />
        </button>
        <div className="w-24" onWheel={(e) => {
          const step = volumeWheelStep / 100;
          const dir = e.deltaY < 0 ? 1 : -1;
          setVolume(Math.min(1, Math.max(0, volume + dir * step)));
        }}>
          <FsSlider
            ariaLabel="Volume"
            value={muted ? 0 : volume}
            max={1}
            onChange={(v) => setVolume(v)}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}

function SeekBar() {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const song = usePlayerStore((s) => s.queue[s.currentIndex]);
  const seek = usePlayerStore((s) => s.seek);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const max = duration || song?.duration || 0;

  return (
    <div className="flex w-full items-center gap-2">
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-[var(--fg-dim)]">
        {formatDuration(dragValue ?? position)}
      </span>
      <FsSlider
        ariaLabel="Seek"
        value={dragValue ?? Math.min(position, max)}
        max={max || 1}
        onChange={(v) => setDragValue(v)}
        onCommit={(v) => {
          seek(v);
          setDragValue(null);
        }}
        className="flex-1"
      />
      <span className="w-10 shrink-0 text-[11px] tabular-nums text-[var(--fg-dim)]">
        {formatDuration(max)}
      </span>
    </div>
  );
}

export function PlayerBar() {
  return (
    <div
      className="relative z-30 grid h-[90px] shrink-0 grid-cols-[minmax(240px,1fr)_minmax(360px,2.2fr)_minmax(240px,1fr)] items-center border-t border-[var(--border)] bg-[var(--bg)]"
      data-testid="player-bar"
    >
      <div className="flex items-center overflow-hidden">
        <LeftControls />
      </div>
      <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4">
        <CenterControls />
        <SeekBar />
      </div>
      <div className="flex items-center justify-end overflow-hidden">
        <RightControls />
      </div>
    </div>
  );
}
