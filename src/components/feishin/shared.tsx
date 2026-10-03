"use client";
// Feishin rebuild — shared small components (rating, favorite, images, headers)
import { useState } from "react";
import { Heart, Star, MoreHorizontal, ListMusic, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextMenuNS as ContextMenu } from "@/components/ui/context-menu";
import { usePlayerStore } from "@/store/player-store";
import { useSettingsStore } from "@/store/settings-store";
import type { Song } from "@/lib/types";

export function RatingStars({
  value,
  onChange,
  size = 14,
  className,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  className?: string;
}) {
  const showRatings = useSettingsStore((s) => s.general.showRatings);
  if (!showRatings) return null;
  return (
    <div className={cn("flex items-center gap-[1px]", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`Rate ${i} stars`}
          onClick={(e) => {
            e.stopPropagation();
            onChange?.(value === i ? 0 : i);
          }}
          className="p-0 bg-transparent border-0 cursor-pointer"
        >
          <Star
            size={size}
            className={cn(
              "transition-colors",
              i <= Math.round(value) ? "fill-[var(--star)] text-[var(--star)]" : "text-[var(--fg-dim)] fill-transparent",
              onChange && "hover:fill-[var(--star)] hover:text-[var(--star)]",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function FavoriteHeart({
  isFavorite,
  onToggle,
  size = 16,
  className,
}: {
  isFavorite: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn("fs-icon-btn p-1", className)}
    >
      <Heart
        size={size}
        className={cn("transition-colors", isFavorite ? "fill-[var(--primary)] text-[var(--primary)]" : "text-[var(--fg-dim)] hover:text-[var(--fg)]")}
      />
    </button>
  );
}

export function LikeButton({
  liked,
  onToggle,
  size = 15,
  className,
}: {
  liked: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={liked ? "Remove like" : "Like"}
      title={liked ? "Remove like" : "Like"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn("fs-icon-btn p-1", className)}
    >
      <ThumbsUp
        size={size}
        className={cn(
          "transition-colors",
          liked ? "fill-[var(--primary)] text-[var(--primary)]" : "text-[var(--fg-dim)] hover:text-[var(--fg)]",
        )}
      />
    </button>
  );
}

export function ItemImage({
  src,
  alt,
  className,
  rounded,
}: {
  src?: string;
  alt: string;
  className?: string;
  rounded?: boolean;
}) {
  // reset failure/load state when the source changes (adjust-during-render pattern)
  const [state, setState] = useState({ src, failed: false, loaded: false });
  if (state.src !== src) {
    setState({ src, failed: false, loaded: false });
  }
  const failed = state.failed;
  const loaded = state.loaded;

  return (
    <div
      className={cn("relative overflow-hidden bg-[var(--elevated)] shrink-0", rounded && "rounded-full", className)}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={cn("h-full w-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
          draggable={false}
          loading="lazy"
          onLoad={() => setState((s) => (s.loaded ? s : { ...s, loaded: true }))}
          onError={() => setState((s) => (s.failed ? s : { ...s, failed: true }))}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[var(--fg-dim)]">
          <ListMusic size={16} />
        </div>
      )}
    </div>
  );
}

export function Kebab({ size = 18 }: { size?: number }) {
  return <MoreHorizontal size={size} className="text-[var(--fg-dim)]" />;
}

export function SectionHeader({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xl font-extrabold tracking-tight text-[var(--fg)]">{title}</h2>
      <div className="flex items-center gap-2">
        {action}
        {children}
      </div>
    </div>
  );
}

export function useIsFavorite() {
  const favTracks = usePlayerStore((s) => s.favoriteTracks);
  const favAlbums = usePlayerStore((s) => s.favoriteAlbums);
  const favArtists = usePlayerStore((s) => s.favoriteArtists);
  return {
    track: (id: string) => !!favTracks[id],
    album: (id: string) => !!favAlbums[id],
    artist: (id: string) => !!favArtists[id],
  };
}

export function songContextMenuLabel(song: Song) {
  return song.name;
}

export function CtxItem({
  children,
  onSelect,
  icon,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <ContextMenu.Item
      className="flex cursor-pointer select-none items-center gap-2 rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
      onSelect={onSelect}
    >
      {icon}
      {children}
    </ContextMenu.Item>
  );
}

export function CtxSeparator() {
  return <ContextMenu.Separator className="mx-1 my-1 h-px bg-[var(--border)]" />;
}

export function CtxLabel({ children }: { children: React.ReactNode }) {
  return (
    <ContextMenu.Label className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-dim)]">
      {children}
    </ContextMenu.Label>
  );
}
