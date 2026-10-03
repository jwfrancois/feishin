"use client";
// Feishin rebuild — artists list route (grid of artist cards)
import { useMemo, useState } from "react";
import { allArtists, getAlbumsByArtist } from "@/lib/library";
import { useRouterStore } from "@/store/router-store";
import { ItemImage } from "../shared";
import { usePlayerStore } from "@/store/player-store";
import { getTracksByArtist, trackToSong } from "@/lib/library";
import { useSongActions } from "../song-actions";
import { ContextMenuNS as ContextMenu } from "@/components/ui/context-menu";
import { CtxItem, CtxSeparator } from "../shared";

function ArtistContextMenu({ artistId, name, children }: { artistId: string; name: string; children: React.ReactNode }) {
  const actions = useSongActions();
  const fav = usePlayerStore((s) => !!s.favoriteArtists[artistId]);
  const toggleArtistFav = usePlayerStore((s) => s.toggleArtistFavorite);
  const playArtistRadio = () => {
    const songs = getTracksByArtist(artistId).map((t) => trackToSong(t));
    if (songs.length > 0) actions.play(songs, 0);
  };
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="fs-menu-content">
          <CtxItem onSelect={playArtistRadio}>Play artist radio</CtxItem>
          <CtxSeparator />
          <CtxItem
            onSelect={() => {
              toggleArtistFav(artistId);
            }}
          >
            {fav ? "Remove from favorites" : "Add to favorites"}
          </CtxItem>
          <CtxItem onSelect={() => actions.goToArtist(artistId)}>Go to {name}</CtxItem>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function ArtistsView() {
  const navigate = useRouterStore((s) => s.navigate);
  const [filter, setFilter] = useState("");

  const artists = useMemo(() => {
    const arr = filter
      ? allArtists.filter((a) => a.name.toLowerCase().includes(filter.toLowerCase()))
      : allArtists;
    return [...arr].sort((a, b) => a.name.localeCompare(b.name));
  }, [filter]);

  return (
    <div className="px-8 pb-24 pt-8" data-testid="artists-view">
      <h1 className="mb-6 text-2xl font-black tracking-tight text-[var(--fg)]">Artists</h1>
      <div className="mb-6">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search artists"
          aria-label="Search artists"
          className="fs-input h-9 w-[280px] px-3 text-[13px]"
        />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {artists.map((artist) => (
          <ArtistContextMenu key={artist.id} artistId={artist.id} name={artist.name}>
            <div
              className="group cursor-pointer"
              onClick={() => navigate({ view: "artist", id: artist.id })}
              role="link"
              aria-label={`Open artist ${artist.name}`}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && navigate({ view: "artist", id: artist.id })}
            >
              <div className="relative overflow-hidden rounded-[4px]">
                <ItemImage src={artist.imageUrl} alt={`${artist.name} image`} className="aspect-square w-full" />
                <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="mt-2 truncate text-[13.5px] font-bold text-[var(--fg)]">{artist.name}</div>
              <div className="truncate text-[12.5px] text-[var(--fg-dim)]">
                {getAlbumsByArtist(artist.id).length} albums
              </div>
            </div>
          </ArtistContextMenu>
        ))}
      </div>
    </div>
  );
}
