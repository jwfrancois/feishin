"use client";
// Feishin rebuild — Agent Auto-EQ controller (no UI).
// Mounted once next to <AudioEngine />. Whenever the current track changes
// (and Auto-EQ is enabled) it asks the Library Agent for the item's sound
// profile — computed from the library genres plus Deezer album genres and
// MusicBrainz artist tags — and feeds the resulting DSP curve into the Hi-Fi
// store, where the Web Audio engine applies it with smooth ramps.
//
// Scope: "album" analyzes the album once and reuses it for every track on it
// (stable listening per album, fewer lookups); "track" analyzes each song.
// Any manual touch in the Hi-Fi panel marks the session "overridden" but the
// agent re-applies on the next track change.
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePlayerStore } from "@/store/player-store";
import { useHifiStore } from "@/store/hifi-store";
import { getAgentSoundProfile } from "@/lib/agent-client";
import type { AgentSoundProfile } from "@/lib/types";

/** Resolve the analysis target for a song under the current scope setting. */
function profileTarget(song: { id: string; name: string; artist: string; album: string; albumId?: string; genre?: string; year?: number; duration: number }, scope: "track" | "album") {
  if (scope === "album" && song.albumId) {
    return {
      itemId: song.albumId,
      itemType: "album" as const,
      name: song.album || song.name,
      artist: song.artist,
      album: song.album,
      genres: song.genre,
      year: song.year,
      duration: song.duration,
    };
  }
  return {
    itemId: song.id,
    itemType: "track" as const,
    name: song.name,
    artist: song.artist,
    album: song.album,
    genres: song.genre,
    year: song.year,
    duration: song.duration,
  };
}

/** Apply (or re-apply) the profile for the currently playing track. */
async function applyForCurrentSong(opts: { refresh?: boolean } = {}): Promise<AgentSoundProfile | null> {
  const player = usePlayerStore.getState();
  const hifi = useHifiStore.getState();
  const song = player.queue[player.currentIndex];
  if (!song || !hifi.autoEq) return null;
  hifi.setAgentStatus("analyzing");
  try {
    const target = profileTarget(song, hifi.autoEqScope);
    const profile = await getAgentSoundProfile(target, { refresh: opts.refresh });
    const live = useHifiStore.getState();
    if (!profile) {
      live.setAgentStatus("error");
      return null;
    }
    // re-check the track didn't change while we were analyzing
    const now = usePlayerStore.getState();
    const currentSong = now.queue[now.currentIndex];
    if (!currentSong || (currentSong.id !== song.id && !(target.itemType === "album" && currentSong.albumId === target.itemId))) {
      return null;
    }
    if (!live.autoEq) return null; // user switched Auto-EQ off meanwhile
    live.applyAgentProfile(profile);
    return profile;
  } catch {
    useHifiStore.getState().setAgentStatus("error");
    return null;
  }
}

/** Panel button: force the agent to re-analyze what's playing right now. */
export async function reanalyzeCurrentProfile(): Promise<void> {
  const hifi = useHifiStore.getState();
  if (!hifi.autoEq) {
    toast.error("Agent Auto-EQ is off", { description: "Turn it on in the Hi-Fi Studio panel first." });
    return;
  }
  const profile = await applyForCurrentSong({ refresh: true });
  if (profile) {
    toast.success(`${profile.name} applied`, {
      description: `Re-analyzed at ${Math.round(profile.confidence * 100)}% confidence — ${profile.rationale}`,
      duration: 6000,
    });
  } else {
    toast.error("The agent couldn't analyze this track", { description: "Check that the Library Agent is enabled and online." });
  }
}

export function AgentAutoEq() {
  const song = usePlayerStore((s) => s.queue[s.currentIndex]);
  const autoEq = useHifiStore((s) => s.autoEq);
  const scope = useHifiStore((s) => s.autoEqScope);
  const appliedRef = useRef<string | null>(null); // last profile key applied

  useEffect(() => {
    if (!autoEq || !song) {
      if (!autoEq) appliedRef.current = null;
      return;
    }
    const key = `${scope}:${scope === "album" ? song.albumId ?? song.id : song.id}`;
    if (appliedRef.current === key) return; // already tuned this scope target
    const timer = setTimeout(() => {
      void (async () => {
        const profile = await applyForCurrentSong();
        if (profile) appliedRef.current = key;
      })();
    }, 1200); // let fast skips settle before asking the agent
    return () => clearTimeout(timer);
  }, [song, autoEq, scope]);

  return null;
}
