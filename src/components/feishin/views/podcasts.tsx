"use client";
// Feishin rebuild — podcasts routes (show grid + continue-listening / new-episode
// carousels, and a show detail with an episode list supporting resume + played state)
import { useEffect, useMemo, useState } from "react";
import { Play, Pause, Check, ArrowDownUp } from "lucide-react";
import {
  fetchPodcastsPage,
  fetchPodcast,
  fetchPodcastEpisodes,
  fetchResumableEpisodes,
  fetchRecentEpisodes,
  markPlayed,
} from "@/lib/jellyfin";
import type { Podcast, Song } from "@/lib/types";
import { formatDuration, formatLongDuration, extractDominantColor } from "@/lib/format";
import { useJfQuery, invalidateJf } from "@/hooks/use-jf";
import { useRouterStore } from "@/store/router-store";
import { usePlayerStore } from "@/store/player-store";
import { useSongActions } from "../song-actions";
import { ItemImage, FavoriteHeart, Kebab } from "../shared";
import { ScrollCarousel } from "../scroll-carousel";
import { DropdownMenuNS as DropdownMenu } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ---------------------------------------------------------------- helpers

function timeAgo(ms: number): string {
  if (!ms) return "";
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  if (d < 31) return `${d} day${d === 1 ? "" : "s"} ago`;
  const m = Math.round(d / 30);
  if (m < 12) return `${m} month${m === 1 ? "" : "s"} ago`;
  const y = Math.round(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

function fmtDate(ms?: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Best resume position for an episode: local persisted first, then server UserData. */
function resumeOf(ep: Song, resumeMap: Record<string, number>): number {
  return resumeMap[ep.id] ?? ep.resumeAt ?? 0;
}

/** Queue + play; jumps to the persisted position for partially-heard episodes. */
function playEpisodes(songs: Song[], index: number) {
  const ep = songs[index];
  if (ep) {
    const at = resumeOf(ep, usePlayerStore.getState().resumePositions);
    if (at > 15 && !ep.played) usePlayerStore.getState().armResume(ep.id, at);
  }
  usePlayerStore.getState().setQueue(songs, index, true);
}

function progressOf(ep: Song, resumeMap: Record<string, number>): number {
  const at = resumeOf(ep, resumeMap);
  if (!at || ep.duration <= 0) return 0;
  return Math.min(1, at / ep.duration);
}

// ---------------------------------------------------------------- cards

export function PodcastCard({ podcast, width }: { podcast: Podcast; width?: string }) {
  const navigate = useRouterStore((s) => s.navigate);
  const [busy, setBusy] = useState(false);

  const playLatest = async () => {
    setBusy(true);
    try {
      const { episodes } = await fetchPodcastEpisodes(podcast.id, { limit: 20 });
      if (episodes.length > 0) {
        playEpisodes(episodes, 0);
      } else {
        toast("No episodes found");
      }
    } catch {
      toast.error("Could not load episodes");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("group shrink-0", width ?? "w-[164px]")}>
      <div
        className="relative cursor-pointer overflow-hidden rounded-[4px]"
        onClick={() => navigate({ view: "podcast", id: podcast.id })}
        role="link"
        aria-label={`Open podcast ${podcast.name}`}
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && navigate({ view: "podcast", id: podcast.id })}
      >
        <ItemImage src={podcast.coverUrl} alt={`${podcast.name} cover`} className="aspect-square w-full" />
        <button
          type="button"
          aria-label={`Play latest from ${podcast.name}`}
          aria-busy={busy}
          onClick={(e) => {
            e.stopPropagation();
            void playLatest();
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] shadow-lg">
            <Play size={22} className="ml-0.5 fill-[var(--primary-contrast)] text-[var(--primary-contrast)]" />
          </span>
        </button>
      </div>
      <button
        type="button"
        onClick={() => navigate({ view: "podcast", id: podcast.id })}
        className="mt-2 block w-full truncate text-left text-[13.5px] font-bold text-[var(--fg)] hover:underline"
      >
        {podcast.name}
      </button>
      <div className="block w-full truncate text-left text-[12.5px] text-[var(--fg-dim)]">
        {podcast.episodeCount.toLocaleString()} episodes
        {podcast.latestAt > 0 ? ` · ${timeAgo(podcast.latestAt)}` : ""}
      </div>
    </div>
  );
}

function EpisodeCard({ episode, queue = [episode], index = 0 }: { episode: Song; queue?: Song[]; index?: number }) {
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const resumeMap = usePlayerStore((s) => s.resumePositions);
  const isCurrent = currentId === episode.id;
  const progress = progressOf(episode, resumeMap);

  return (
    <div className="group w-[164px] shrink-0">
      <button
        type="button"
        aria-label={`Play ${episode.name}`}
        onClick={() => playEpisodes(queue, index)}
        className="relative block w-full cursor-pointer overflow-hidden rounded-[4px]"
      >
        <ItemImage src={episode.albumCoverUrl} alt={episode.album || episode.name} className="aspect-square w-full" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] shadow-lg">
            {isCurrent && isPlaying ? (
              <Pause size={22} className="fill-[var(--primary-contrast)] text-[var(--primary-contrast)]" />
            ) : (
              <Play size={22} className="ml-0.5 fill-[var(--primary-contrast)] text-[var(--primary-contrast)]" />
            )}
          </span>
        </span>
        {progress > 0 && !episode.played && (
          <span className="absolute inset-x-0 bottom-0 block h-[3px] bg-black/60">
            <span className="block h-full bg-[var(--primary)]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </button>
      <div className="mt-2 truncate text-[13px] font-semibold text-[var(--fg)]">{episode.name}</div>
      {(episode.album || (episode.artist && episode.artist !== "Unknown artist")) && (
        <div className="truncate text-[12px] text-[var(--fg-dim)]">{episode.album || episode.artist}</div>
      )}
      <div className="truncate text-[11.5px] text-[var(--fg-dim)]">
        {episode.played ? "Played" : timeAgo(episode.publishedAt ?? 0) || formatDuration(episode.duration)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- list view

type ShowSort = "name" | "recentlyUpdated" | "recentlyAdded" | "episodes" | "random";

const SORT_LABELS: Record<ShowSort, string> = {
  name: "Name",
  recentlyUpdated: "Recently updated",
  recentlyAdded: "Recently added",
  episodes: "Episode count",
  random: "Random",
};

export function PodcastsView() {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<ShowSort>("name");
  const showsQ = useJfQuery("podcasts:shows", () => fetchPodcastsPage({ limit: 300 }), 3 * 60_000);
  const resumeQ = useJfQuery("podcasts:resume", () => fetchResumableEpisodes(14), 60_000);
  const recentQ = useJfQuery("podcasts:recent", () => fetchRecentEpisodes(40), 2 * 60_000);
  const resumeMap = usePlayerStore((s) => s.resumePositions);

  const all = useMemo(() => showsQ.data?.podcasts ?? [], [showsQ.data]);
  const shows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
    const sorted = [...list];
    switch (sort) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "recentlyUpdated":
        sorted.sort((a, b) => b.latestAt - a.latestAt);
        break;
      case "recentlyAdded":
        sorted.sort((a, b) => b.addedAt - a.addedAt);
        break;
      case "episodes":
        sorted.sort((a, b) => b.episodeCount - a.episodeCount);
        break;
      case "random":
        sorted.sort(() => Math.random() - 0.5);
        break;
    }
    return sorted;
  }, [all, filter, sort]);

  // continue listening = server-resumable + locally-resumable recent episodes,
  // deduped (the server's IsResumable flag can lag behind local playback state)
  const resumable = useMemo(() => {
    const seen = new Set<string>();
    const out: Song[] = [];
    for (const ep of [...(resumeQ.data ?? []), ...(recentQ.data ?? [])]) {
      if (seen.has(ep.id)) continue;
      seen.add(ep.id);
      if (resumeOf(ep, resumeMap) > 15 && !ep.played) out.push(ep);
    }
    return out.slice(0, 14);
  }, [resumeQ.data, recentQ.data, resumeMap]);
  const recent = recentQ.data ?? [];

  return (
    <div className="px-8 pb-24 pt-8" data-testid="podcasts-view">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="text-2xl font-black tracking-tight text-[var(--fg)]">Podcasts</h1>
        {!showsQ.loading && (showsQ.data?.total ?? 0) > 0 && (
          <span className="text-[13px] text-[var(--fg-dim)]">{(showsQ.data?.total ?? 0).toLocaleString()}</span>
        )}
      </div>

      {/* continue listening */}
      {resumable.length > 0 && !filter && (
        <div className="mb-8">
          <ScrollCarousel title="Continue listening" itemWidth={164}>
            {resumable.map((ep, i) => (
              <EpisodeCard key={`res-${ep.id}`} episode={ep} queue={resumable} index={i} />
            ))}
          </ScrollCarousel>
        </div>
      )}

      {/* new episodes */}
      {recent.length > 0 && !filter && (
        <div className="mb-8">
          <ScrollCarousel title="New episodes" itemWidth={164}>
            {recent.map((ep, i) => (
              <EpisodeCard key={`new-${ep.id}`} episode={ep} queue={recent} index={i} />
            ))}
          </ScrollCarousel>
        </div>
      )}

      {/* toolbar */}
      <div className="mb-6 flex items-center gap-2">
        <div className="relative w-[280px]">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search podcasts"
            aria-label="Search podcasts"
            className="fs-input h-9 w-full px-3 text-[13px]"
          />
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="fs-icon-btn flex h-9 items-center gap-2 rounded-[4px] bg-[var(--elevated)] px-3 text-[13px]"
            >
              <ArrowDownUp size={14} />
              <span className="hidden md:inline">{SORT_LABELS[sort]}</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" className="fs-menu-content">
              {(Object.keys(SORT_LABELS) as ShowSort[]).map((key) => (
                <DropdownMenu.Item
                  key={key}
                  className="flex cursor-pointer select-none rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
                  onSelect={() => setSort(key)}
                >
                  {SORT_LABELS[key]}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {showsQ.loading && all.length === 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-square w-full animate-pulse rounded-[4px] bg-[var(--elevated)]" />
              <div className="mt-2 h-3.5 w-3/4 animate-pulse rounded bg-[var(--elevated)]" />
              <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-[var(--elevated)]" />
            </div>
          ))}
        </div>
      ) : showsQ.error && all.length === 0 ? (
        // upstream failure (e.g. Jellyfin busy/slow -> 502): show a recoverable
        // error instead of the empty state or a crashed page
        <div className="mb-6 max-w-xl rounded-[4px] border border-[var(--border)] bg-[var(--elevated)] px-5 py-4">
          <p className="text-sm font-bold text-[var(--fg)]">Couldn&apos;t load your podcasts</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--fg-dim)]">
            The Jellyfin server didn&apos;t respond in time and may be busy. Stale results are shown when available —
            otherwise try again in a moment.
          </p>
          <button
            type="button"
            onClick={showsQ.refetch}
            className="mt-3 rounded-[4px] border border-[var(--border)] px-3 py-1.5 text-[13px] font-semibold text-[var(--fg)] hover:bg-[var(--hover)]"
          >
            Retry
          </button>
        </div>
      ) : shows.length === 0 ? (
        <div className="py-16 text-center text-[13.5px] text-[var(--fg-dim)]">
          {filter ? `No podcasts matching "${filter}"` : "No podcasts found"}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {shows.map((p) => (
            <PodcastCard key={p.id} podcast={p} width="w-full" />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- detail view

const FALLBACK_COLOR: [number, number, number] = [70, 78, 96];

function EpisodeRow({
  episode,
  index,
  episodes,
  onChanged,
}: {
  episode: Song;
  index: number;
  episodes: Song[];
  onChanged: () => void;
}) {
  const actions = useSongActions();
  const currentId = usePlayerStore((s) => s.queue[s.currentIndex]?.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const resumeMap = usePlayerStore((s) => s.resumePositions);
  const isCurrent = currentId === episode.id;
  const progress = progressOf(episode, resumeMap);
  const at = resumeOf(episode, resumeMap);
  const minutesLeft = at > 15 && episode.duration ? Math.max(1, Math.round((episode.duration - at) / 60)) : 0;

  const togglePlayed = async () => {
    try {
      await markPlayed(episode.id, !episode.played);
      toast(episode.played ? "Marked as unplayed" : "Marked as played");
      if (!episode.played) usePlayerStore.getState().setResume(episode.id, 0); // drop local resume
      invalidateJf("podcast");
      onChanged();
    } catch {
      toast.error("Could not update played state");
    }
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-3 border-b border-[var(--border)]/40 px-3 py-2 transition-colors hover:bg-[var(--hover)]/40",
        isCurrent && "bg-[var(--hover)]/60",
      )}
    >
      <button
        type="button"
        aria-label={isCurrent && isPlaying ? "Pause" : `Play ${episode.name}`}
        onClick={() => (isCurrent ? usePlayerStore.getState().toggle() : playEpisodes(episodes, index))}
        className="fs-icon-btn h-8 w-8 shrink-0"
      >
        {isCurrent && isPlaying ? (
          <Pause size={15} />
        ) : (
          <Play size={15} className={cn("fill-current", isCurrent ? "text-[var(--primary)]" : "")} />
        )}
      </button>
      <ItemImage
        src={episode.albumCoverUrl}
        alt={episode.album || episode.name}
        className="h-10 w-10 shrink-0 rounded-[3px]"
      />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[13.5px] font-semibold", episode.played ? "text-[var(--fg-dim)]" : "text-[var(--fg)]")}>
          {episode.name}
        </div>
        {progress > 0 && !episode.played && (
          <div className="mt-1 h-[3px] w-full max-w-[420px] overflow-hidden rounded bg-[var(--elevated)]">
            <div className="h-full bg-[var(--primary)]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        <div className="truncate text-[12px] text-[var(--fg-dim)]">
          {fmtDate(episode.publishedAt)} · {formatDuration(episode.duration)}
          {episode.playCount ? ` · ${episode.playCount} play${episode.playCount === 1 ? "" : "s"}` : ""}
        </div>
      </div>
      <div className="w-[110px] shrink-0 text-right text-[12px] text-[var(--fg-dim)]">
        {episode.played ? (
          <span className="inline-flex items-center gap-1">
            <Check size={13} className="text-[var(--primary)]" /> Played
          </span>
        ) : minutesLeft > 0 ? (
          `${minutesLeft} min left`
        ) : (
          ""
        )}
      </div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" aria-label="Episode options" className="fs-icon-btn h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100">
            <Kebab size={15} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" className="fs-menu-content">
            <DropdownMenu.Item
              className="flex cursor-pointer rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
              onSelect={() => playEpisodes(episodes, index)}
            >
              Play
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="flex cursor-pointer rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
              onSelect={() => actions.playNext([episode])}
            >
              Play next
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="flex cursor-pointer rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
              onSelect={() => actions.addLater([episode])}
            >
              Add to queue
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="flex cursor-pointer rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
              onSelect={() => void togglePlayed()}
            >
              {episode.played ? "Mark as unplayed" : "Mark as played"}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

export function PodcastDetailView({ podcastId }: { podcastId: string }) {
  const currentSong = usePlayerStore((s) => s.queue[s.currentIndex]);
  const favAlbums = usePlayerStore((s) => s.favoriteAlbums);
  const resumeMap = usePlayerStore((s) => s.resumePositions);
  const actions = useSongActions();
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [accumulated, setAccumulated] = useState<Song[]>([]);
  const [color, setColor] = useState<[number, number, number]>(FALLBACK_COLOR);
  const PAGE_SIZE = 100;

  const podcastQ = useJfQuery(`podcast:${podcastId}`, () => fetchPodcast(podcastId), 10 * 60_000);
  const episodesQ = useJfQuery(
    `podcast:${podcastId}:eps:${order}:p${pagesLoaded}`,
    () =>
      fetchPodcastEpisodes(podcastId, {
        sortOrder: order === "newest" ? "Descending" : "Ascending",
        startIndex: (pagesLoaded - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
    3 * 60_000,
  );
  const podcast = podcastQ.data ?? undefined;
  const totalEpisodes = episodesQ.data?.total ?? 0;

  // merge fetched pages (dedupe) — reset when the order flips
  useEffect(() => {
    if (!episodesQ.data) return;
    setAccumulated((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      const merged = [...prev];
      for (const ep of episodesQ.data!.episodes) {
        if (!seen.has(ep.id)) {
          seen.add(ep.id);
          merged.push(ep);
        }
      }
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodesQ.data]);

  useEffect(() => {
    setAccumulated([]);
    setPagesLoaded(1);
  }, [order]);

  const episodes = accumulated;

  const firstUnfinished = useMemo(() => {
    // "newest" order → the newest in-progress episode (most recent listening activity)
    return episodes.findIndex((e) => resumeOf(e, resumeMap) > 15 && !e.played);
  }, [episodes, resumeMap]);

  useEffect(() => {
    if (!podcast) return;
    let cancelled = false;
    extractDominantColor(podcast.coverUrl).then((c) => {
      if (!cancelled && c) setColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [podcast]);

  if (podcastQ.loading && !podcast) {
    return (
      <div className="px-8 pb-24 pt-8" data-testid="podcast-detail-loading">
        <div className="flex items-end gap-6">
          <div className="h-[210px] w-[210px] shrink-0 animate-pulse rounded-[4px] bg-[var(--elevated)]" />
          <div className="flex-1 space-y-3 pb-2">
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--elevated)]" />
            <div className="h-10 w-2/3 animate-pulse rounded bg-[var(--elevated)]" />
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-[var(--elevated)]" />
          </div>
        </div>
      </div>
    );
  }

  if (!podcast) {
    return <div className="p-8 text-[var(--fg-dim)]">Podcast not found</div>;
  }

  const isPlayingHere = currentSong && episodes.some((e) => e.id === currentSong.id);
  const [r, g, b] = color;

  return (
    <div className="pb-24" data-testid="podcast-detail">
      {/* hero */}
      <div className="relative overflow-hidden px-8 pb-6 pt-8">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background: `radial-gradient(120% 140% at 20% 0%, rgba(${r},${g},${b},0.5) 0%, rgba(${Math.round(r * 0.4)},${Math.round(g * 0.4)},${Math.round(b * 0.4)},0.35) 45%, transparent 75%)`,
          }}
        />
        <div className="relative flex items-end gap-6">
          <ItemImage
            src={podcast.coverUrl}
            alt={`${podcast.name} cover`}
            className="h-[210px] w-[210px] shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
          />
          <div className="flex min-w-0 flex-1 flex-col justify-end pb-1">
            <div className="fs-title-xs mb-1">Podcast</div>
            <h1 className="mb-1.5 truncate text-[38px] font-black leading-tight tracking-tight text-[var(--fg)]">
              {podcast.name}
            </h1>
            <div className="mb-2 text-[13px] text-[var(--fg-dim)]">
              {podcast.episodeCount.toLocaleString()} episodes
              {podcast.duration > 0 ? ` · ${formatLongDuration(podcast.duration)} total` : ""}
              {podcast.genre ? ` · ${podcast.genre}` : ""}
              {podcast.year ? ` · ${podcast.year}` : ""}
            </div>
            {podcast.latestEpisode && podcast.latestAt > 0 && (
              <div className="mb-2 truncate text-[12.5px] text-[var(--fg-dim)]">
                Latest: “{podcast.latestEpisode}” · {timeAgo(podcast.latestAt)}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-3 self-end pb-1">
            <div className="flex items-center gap-3">
              <FavoriteHeart
                isFavorite={!!favAlbums[podcast.id]}
                onToggle={() => {
                  usePlayerStore.getState().toggleAlbumFavorite(podcast.id);
                  toast("Favorites updated");
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              {firstUnfinished >= 0 && (
                <button type="button" className="fs-pill" onClick={() => playEpisodes(episodes, firstUnfinished)}>
                  <Play size={15} className="fill-current" />
                  Resume
                </button>
              )}
              <button type="button" className="fs-pill" onClick={() => playEpisodes(episodes, 0)}>
                <Play size={15} className="fill-current" />
                {isPlayingHere ? "Restart" : "Play"}
              </button>
              <button
                type="button"
                className="fs-pill"
                onClick={() => {
                  if (isPlayingHere) {
                    actions.play(episodes, Math.min(episodes.length - 1, episodes.findIndex((e) => e.id === currentSong!.id) + 1));
                  } else {
                    playEpisodes(episodes, 0);
                  }
                }}
              >
                Latest
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* episode list */}
      <div className="px-8">
        <div className="mb-2 flex items-center gap-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="fs-icon-btn flex h-8 items-center gap-2 rounded-[4px] bg-[var(--elevated)] px-3 text-[12.5px]"
              >
                {order === "newest" ? "Newest first" : "Oldest first"}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="start" className="fs-menu-content">
                {(["newest", "oldest"] as const).map((o) => (
                  <DropdownMenu.Item
                    key={o}
                    className="flex cursor-pointer select-none rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--fg)] outline-none data-[highlighted]:bg-[var(--hover)]"
                    onSelect={() => setOrder(o)}
                  >
                    {o === "newest" ? "Newest first" : "Oldest first"}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          {!episodesQ.loading && episodes.length > 0 && (
            <span className="text-[12.5px] text-[var(--fg-dim)]">
              showing {episodes.length.toLocaleString()} of {totalEpisodes.toLocaleString()}
            </span>
          )}
        </div>

        {episodesQ.loading && episodes.length === 0 ? (
          <div className="flex flex-col gap-2 pt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[56px] animate-pulse rounded-[4px] bg-[var(--elevated)]" />
            ))}
          </div>
        ) : episodes.length === 0 ? (
          <div className="py-16 text-center text-[13.5px] text-[var(--fg-dim)]">No episodes found</div>
        ) : (
          <>
            <div className="flex flex-col">
              {episodes.map((ep, i) => (
                <EpisodeRow
                  key={ep.id}
                  episode={ep}
                  index={i}
                  episodes={episodes}
                  onChanged={episodesQ.refetch}
                />
              ))}
            </div>
            {episodes.length < totalEpisodes && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  className="fs-pill"
                  disabled={episodesQ.loading}
                  onClick={() => setPagesLoaded((p) => p + 1)}
                >
                  {episodesQ.loading
                    ? "Loading…"
                    : `Load ${Math.min(PAGE_SIZE, totalEpisodes - episodes.length)} more episodes`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
