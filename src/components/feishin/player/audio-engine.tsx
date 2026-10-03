"use client";
// Feishin rebuild — audio engine (single <audio> element wired to the player store)
// Streams from the Jellyfin proxy (direct play, Range-seekable) with a transcode fallback,
// and reports playback (start/progress/stop) to the server like feishin does.
import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/store/player-store";
import { useSettingsStore } from "@/store/settings-store";
import { reportPlayback } from "@/lib/jellyfin";
import { toast } from "sonner";

export function AudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrobbledRef = useRef<Set<string>>(new Set());
  const reportedRef = useRef<string | null>(null);
  const lastProgressRef = useRef(0);
  const retriedRef = useRef<Set<string>>(new Set());
  const stateRef = useRef({ queue: [] as typeof queue, currentIndex: 0, repeat: "off" as ReturnType<typeof usePlayerStore.getState>["repeat"], isPlaying: false });

  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const seekTarget = usePlayerStore((s) => s.seekTarget);
  const repeat = usePlayerStore((s) => s.repeat);

  // keep a ref snapshot for event handlers (updated in an effect, not during render)
  useEffect(() => {
    stateRef.current = { queue, currentIndex, repeat, isPlaying };
  }, [queue, currentIndex, repeat, isPlaying]);

  const currentSong = queue[currentIndex];

  // load + play/pause on song change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    if (audio.dataset.songId !== currentSong.id) {
      audio.dataset.songId = currentSong.id;
      audio.dataset.fallbackTried = "";
      audio.src = currentSong.audioUrl ?? "";
      audio.currentTime = 0;
      scrobbledRef.current.delete(currentSong.id);
      reportedRef.current = null;
      usePlayerStore.getState().setPosition(0);
    }
    if (isPlaying) {
      audio.play().catch(() => {
        // autoplay/decoding issue — ignore
      });
    } else {
      audio.pause();
    }
  }, [currentSong, isPlaying]);

  // volume
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  // seek
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || seekTarget === null) return;
    if (Number.isFinite(seekTarget)) {
      audio.currentTime = seekTarget;
    }
    usePlayerStore.getState().clearSeek();
  }, [seekTarget]);

  // document title (feishin-style): "(Paused) (1 / 9) Song — Artist — Feishin"
  useEffect(() => {
    if (!currentSong) {
      document.title = "Feishin";
      return;
    }
    const state = isPlaying ? "" : "(Paused) ";
    const idx = `(${currentIndex + 1} / ${queue.length}) `;
    document.title = `${state}${idx}${currentSong.name} — ${currentSong.artist} — Feishin`;
  }, [currentSong, isPlaying, currentIndex, queue.length]);

  if (!currentSong) {
    return <audio ref={audioRef} hidden />;
  }

  return (
    <audio
      ref={audioRef}
      hidden
      crossOrigin="anonymous"
      onPlay={() => {
        const audio = audioRef.current;
        const song = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex];
        if (audio && song && reportedRef.current !== song.id) {
          reportedRef.current = song.id;
          lastProgressRef.current = 0;
          reportPlayback("start", song.id, audio.currentTime || 0, false);
        }
      }}
      onPause={() => {
        const audio = audioRef.current;
        const song = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex];
        if (audio && song) reportPlayback("progress", song.id, audio.currentTime, true);
      }}
      onTimeUpdate={(e) => {
        const audio = e.currentTarget;
        usePlayerStore.getState().setPosition(audio.currentTime);
        // scrobble when >75% played
        const scrobble = useSettingsStore.getState().playback.scrobble;
        if (scrobble && audio.duration && audio.currentTime > audio.duration * 0.75 && !scrobbledRef.current.has(audio.dataset.songId ?? "")) {
          scrobbledRef.current.add(audio.dataset.songId ?? "");
          usePlayerStore.getState().scrobble(audio.dataset.songId ?? "");
        }
        // progress report every ~10s
        if (audio.currentTime - lastProgressRef.current > 10) {
          lastProgressRef.current = audio.currentTime;
          const song = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex];
          if (song) reportPlayback("progress", song.id, audio.currentTime, audio.paused);
        }
      }}
      onLoadedMetadata={(e) => {
        usePlayerStore.getState().setDuration(e.currentTarget.duration || currentSong.duration);
      }}
      onEnded={() => {
        const s = usePlayerStore.getState();
        const song = s.queue[s.currentIndex];
        if (song) {
          s.scrobble(song.id);
          reportPlayback("stop", song.id, s.duration || 0, false);
        }
        if (stateRef.current.repeat === "one") {
          const audio = audioRef.current;
          if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
          }
          s.setPosition(0);
        } else {
          s.next();
        }
      }}
      onError={() => {
        const audio = audioRef.current;
        const songId = audio?.dataset.songId;
        // direct play failed (unsupported codec?) — retry once via server transcode
        if (audio && songId && !audio.dataset.fallbackTried && currentSong) {
          audio.dataset.fallbackTried = "1";
          audio.src = `/api/jf-audio/${songId}?mode=universal`;
          audio.currentTime = 0;
          audio.play().catch(() => {});
          return;
        }
        if (currentSong) {
          toast.error(`Failed to load "${currentSong.name}"`, {
            description: "The server may be unable to read this audio file right now (media share offline or unsupported codec).",
          });
        }
      }}
    />
  );
}
