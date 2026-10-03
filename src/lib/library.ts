// Feishin rebuild — library data access layer (mock Navidrome server library)
import manifest from "./library-manifest.json";
import type { Album, Artist, Playlist, Track, LibraryData } from "./types";
import { trackToSong } from "./types";

export { trackToSong };

export const library = manifest as unknown as LibraryData;

const albumMap = new Map(library.albums.map((a) => [a.id, a]));
const artistMap = new Map(library.artists.map((a) => [a.id, a]));
const trackMap = new Map(library.tracks.map((t) => [t.id, t]));
const playlistMap = new Map(library.playlists.map((p) => [p.id, p]));

export const allAlbums = library.albums;
export const allArtists = library.artists;
export const allTracks = library.tracks;
export const allPlaylists = library.playlists;

export function getAlbum(id: string): Album | undefined {
  return albumMap.get(id);
}
export function getArtist(id: string): Artist | undefined {
  return artistMap.get(id);
}
export function getTrack(id: string): Track | undefined {
  return trackMap.get(id);
}
export function getPlaylist(id: string): Playlist | undefined {
  return playlistMap.get(id);
}
export function getAlbumCover(albumId?: string): string | undefined {
  if (!albumId) return undefined;
  return albumMap.get(albumId)?.coverUrl;
}
export function getTracksByAlbum(albumId: string): Track[] {
  const album = albumMap.get(albumId);
  if (!album) return [];
  return album.trackIds
    .map((id) => trackMap.get(id)!)
    .filter(Boolean)
    .sort((a, b) => a.trackNum - b.trackNum);
}
export function getAlbumsByArtist(artistId: string): Album[] {
  return library.albums
    .filter((a) => a.artistId === artistId)
    .sort((a, b) => a.year - b.year);
}
export function getTracksByArtist(artistId: string): Track[] {
  return library.tracks
    .filter((t) => t.artistId === artistId)
    .sort((a, b) => b.playCount - a.playCount);
}
export function getTracksByPlaylist(playlistId: string): Track[] {
  const pl = playlistMap.get(playlistId);
  if (!pl) return [];
  return pl.trackIds.map((id) => trackMap.get(id)!).filter(Boolean);
}

export interface GenreInfo {
  name: string;
  albumCount: number;
  trackCount: number;
  color: string;
}

const GENRE_COLORS: Record<string, string> = {
  "Trip-Hop": "#5d3a9b",
  "Pop Punk": "#c25b1e",
  "Indie Rock": "#b0402c",
  Electronic: "#8a6a1f",
  Poprock: "#2675b8",
  Industrial: "#b12b2b",
  Neoclassical: "#2c8a6e",
  Synthwave: "#9333ea",
  "Dream Pop": "#1f9e8e",
  Chiptune: "#a3a31c",
  Americana: "#a54a2a",
  Techno: "#0e7f96",
  Folk: "#4d8a2f",
  Psychedelic: "#7d3ac1",
  "Hip Hop": "#7e3fa8",
};

export const genreColors = GENRE_COLORS;

export function getGenres(): GenreInfo[] {
  const map = new Map<string, { albums: Set<string>; tracks: number }>();
  for (const t of library.tracks) {
    const g = map.get(t.genre) ?? { albums: new Set<string>(), tracks: 0 };
    g.albums.add(t.albumId);
    g.tracks += 1;
    map.set(t.genre, g);
  }
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      albumCount: v.albums.size,
      trackCount: v.tracks,
      color: GENRE_COLORS[name] ?? "#666666",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getRandomTracks(count: number): Track[] {
  const arr = [...library.tracks];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

// deterministic per-track home feature selection (stable across renders)
export function selectBy(seed: string, sort: string, count: number): Album[] {
  const arr = [...library.albums];
  switch (sort) {
    case "playCount":
      return arr.sort((a, b) => b.playCount - a.playCount).slice(0, count);
    case "recentlyAdded":
      return arr
        .sort((a, b) => (b.year * 1000 + b.trackIds.length) - (a.year * 1000 + a.trackIds.length))
        .slice(0, count);
    case "recentlyReleased":
      return arr.sort((a, b) => b.year - a.year).slice(0, count);
    case "recentlyPlayed":
      return arr.sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, count);
    case "random": {
      const rnd = mulberry32(hashStr(seed));
      return arr
        .map((a) => ({ a, k: rnd() }))
        .sort((x, y) => x.k - y.k)
        .map((x) => x.a)
        .slice(0, count);
    }
    default:
      return arr.slice(0, count);
  }
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rgbStr(c: [number, number, number]): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function searchLibrary(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return { tracks: [], albums: [], artists: [] };
  const tracks = library.tracks.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.artistName.toLowerCase().includes(q) ||
      t.albumName.toLowerCase().includes(q),
  );
  const albums = library.albums.filter(
    (a) =>
      a.name.toLowerCase().includes(q) || a.artistName.toLowerCase().includes(q) || a.genre.toLowerCase().includes(q),
  );
  const artists = library.artists.filter((a) => a.name.toLowerCase().includes(q) || a.genre.toLowerCase().includes(q));
  return { tracks, albums, artists };
}

// Format helpers (feishin-style)
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatLongDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatPlayCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
