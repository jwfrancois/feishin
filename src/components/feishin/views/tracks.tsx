"use client";
// Feishin rebuild — tracks route (all songs, sortable/filterable)
import { useMemo } from "react";
import { allTracks, getAlbumCover } from "@/lib/library";
import { trackToSong, allAlbums } from "@/lib/library";
import { SongTable } from "../song-table";

export function TracksView() {
  const songs = useMemo(
    () =>
      [...allTracks]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => trackToSong(t, getAlbumCover(t.albumId))),
    [],
  );

  const albumSongs = useMemo(() => {
    const albumMap = new Map(allAlbums.map((a) => [a.id, a]));
    return songs.map((s) => ({ ...s, albumCoverUrl: albumMap.get(s.albumId ?? "")?.coverUrl }));
  }, [songs]);

  return (
    <div className="px-8 pb-24 pt-8" data-testid="tracks-view">
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-2xl font-black tracking-tight text-[var(--fg)]">Tracks</h1>
        <span className="text-[13px] text-[var(--fg-dim)]">{songs.length} tracks</span>
      </div>
      <SongTable songs={albumSongs} />
    </div>
  );
}
