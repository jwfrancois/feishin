"use client";
// Feishin rebuild — hotkeys (feishin's keyboard shortcuts)
import { useEffect } from "react";
import { usePlayerStore } from "@/store/player-store";
import { useSettingsStore } from "@/store/settings-store";
import { useRouterStore } from "@/store/router-store";
import { toast } from "sonner";

export function Hotkeys({ searchInputRef }: { searchInputRef?: React.RefObject<HTMLInputElement | null> }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // ignore when typing in inputs
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.tagName === "SELECT")
      ) {
        if (e.key === "Escape") (target as HTMLInputElement).blur();
        return;
      }

      const player = usePlayerStore.getState();
      const settings = useSettingsStore.getState();
      const router = useRouterStore.getState();
      const view = router.history[router.historyIndex].view;

      switch (e.key) {
        case " ":
          e.preventDefault();
          player.toggle();
          break;
        case "ArrowRight":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            player.next();
          } else if (player.queue.length) {
            e.preventDefault();
            player.seek(Math.min(player.duration || player.queue[player.currentIndex].duration, player.position + 5));
          }
          break;
        case "ArrowLeft":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            player.previous();
          } else if (player.queue.length) {
            e.preventDefault();
            player.seek(Math.max(0, player.position - 5));
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          player.setVolume(Math.min(1, player.volume + settings.playback.volumeWheelStep / 100));
          break;
        case "ArrowDown":
          e.preventDefault();
          player.setVolume(Math.max(0, player.volume - settings.playback.volumeWheelStep / 100));
          break;
        case "m":
        case "M":
          player.toggleMute();
          toast(player.muted ? "Muted" : "Unmuted", { duration: 1000 });
          break;
        case "s":
        case "S":
          player.toggleShuffle();
          toast(player.shuffle ? "Shuffle on" : "Shuffle off", { duration: 1000 });
          break;
        case "r":
        case "R":
          player.cycleRepeat();
          toast(`Repeat: ${player.repeat}`, { duration: 1000 });
          break;
        case "q":
        case "Q":
          settings.toggleRightQueue();
          break;
        case "f":
        case "F":
          if (view === "now-playing") router.navigate({ view: "home" });
          else router.navigate({ view: "now-playing" });
          break;
        case "/":
          e.preventDefault();
          if (view !== "search") router.navigate({ view: "search" });
          break;
        case "Escape":
          if (view === "now-playing") router.navigate({ view: "home" });
          settings.setRightQueue(false);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchInputRef]);

  return null;
}
