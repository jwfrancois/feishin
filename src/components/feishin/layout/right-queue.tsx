"use client";
// Feishin rebuild — right sidebar play queue (feishin's side-drawer-queue)
import { X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePlayerStore } from "@/store/player-store";
import { useSettingsStore } from "@/store/settings-store";
import { ItemImage } from "../shared";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ContextMenuNS as ContextMenu } from "@/components/ui/context-menu";
import { SongContextMenuContent } from "../song-actions";
import { useSongActions } from "../song-actions";

export function RightQueuePanel() {
  const expanded = useSettingsStore((s) => s.rightQueueExpanded);
  const setRightQueue = useSettingsStore((s) => s.setRightQueue);
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playAt = usePlayerStore((s) => s.playAt);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const clearQueue = usePlayerStore((s) => s.clearQueue);
  const actions = useSongActions();

  if (!expanded) return null;

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-alt)]" data-testid="right-queue">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
        <span className="text-[13px] font-bold text-[var(--fg)]">Play Queue</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Clear queue"
            onClick={() => {
              clearQueue();
              toast("Queue cleared");
            }}
            className="fs-icon-btn p-1.5"
          >
            <Trash2 size={14} />
          </button>
          <button type="button" title="Close queue" onClick={() => setRightQueue(false)} className="fs-icon-btn p-1.5">
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {queue.map((song, i) => {
          const isCurrent = i === currentIndex;
          return (
            <ContextMenu.Root key={`${song.id}-${i}`}>
              <ContextMenu.Trigger asChild>
                <div
                  className={cn(
                    "group flex cursor-default items-center gap-2.5 rounded-[4px] p-1.5 transition-colors hover:bg-[var(--hover)]",
                    isCurrent && "bg-[var(--elevated)]",
                  )}
                  onDoubleClick={() => playAt(i)}
                  data-testid="queue-row"
                >
                  <button type="button" onClick={() => playAt(i)} className="relative shrink-0" aria-label={`Play ${song.name}`}>
                    <ItemImage src={song.albumCoverUrl} alt="" className="h-10 w-10" />
                    <span className="absolute inset-0 hidden items-center justify-center rounded-[3px] bg-black/50 text-[10px] font-bold text-white group-hover:flex">
                      {isCurrent && isPlaying ? "❚❚" : "▶"}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className={cn("truncate text-[13px] font-semibold", isCurrent ? "text-[var(--primary)]" : "text-[var(--fg)]")}>
                      {song.name}
                    </div>
                    <div className="truncate text-[12px] text-[var(--fg-dim)]">{song.artist}</div>
                  </div>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--fg-dim)]">{formatDuration(song.duration)}</span>
                  {!isCurrent && (
                    <button
                      type="button"
                      aria-label="Remove from queue"
                      onClick={() => removeFromQueue(i)}
                      className="fs-icon-btn p-1 opacity-0 group-hover:opacity-100"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className="fs-menu-content">
                  <SongContextMenuContent
                    song={song}
                    contextQueue={queue}
                    queueIndex={i}
                    onRemoveFromQueue={() => removeFromQueue(i)}
                    onGoToLyrics={() => setRightQueue(false)}
                  />
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          );
        })}
        {queue.length === 0 && (
          <div className="py-10 text-center text-[13px] text-[var(--fg-dim)]">
            Queue is empty.
            <br />
            Play something to see it here.
          </div>
        )}
      </div>
    </div>
  );
}
