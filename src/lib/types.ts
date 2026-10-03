// Feishin rebuild — shared domain types (mirroring feishin's domain model)

export interface Artist {
  id: string;
  name: string;
  genre: string;
  imageUrl: string;
  color: [number, number, number];
  overview?: string;
  albumCount?: number;
  /** Jellyfin like/dislike (UserData.Likes) — null means neither */
  likes?: boolean | null;
}

export interface Album {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
  year: number;
  genre: string;
  coverUrl: string;
  coverTag?: string;
  color: [number, number, number];
  /** legacy field — may be empty in server mode; prefer trackCount */
  trackIds: string[];
  trackCount: number;
  playCount: number;
  /** legacy 5-star field — Jellyfin 10.11 has no numeric rating API; kept for Navidrome compatibility */
  rating: number;
  /** Jellyfin like/dislike (UserData.Likes) — null means neither */
  likes?: boolean | null;
  duration: number;
}

export interface Track {
  id: string;
  name: string;
  albumId: string;
  artistId: string;
  artistName: string;
  albumName: string;
  trackNum: number;
  duration: number;
  playCount: number;
  genre: string;
  year: number;
  audioUrl: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackCount: number;
  coverUrl: string;
  color: [number, number, number];
  duration: number;
}

export interface LibraryData {
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
  playlists: Playlist[];
}

export type RepeatMode = "off" | "all" | "one";

export interface Song {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  albumCoverUrl?: string;
  duration: number;
  trackNumber?: number;
  year?: number;
  genre?: string;
  playCount?: number;
  audioUrl?: string;
  /** audio codec/container reported by the server (flac, mp3, aac…) */
  container?: string;
  /** Jellyfin playlist entry id (for removing from a playlist) */
  playlistEntryId?: string;
  /** Jellyfin like/dislike (UserData.Likes) — null means neither */
  likes?: boolean | null;
}

export function trackToSong(t: Track, albumCover?: string): Song {
  return {
    id: t.id,
    name: t.name,
    artist: t.artistName,
    artistId: t.artistId,
    album: t.albumName,
    albumId: t.albumId,
    albumCoverUrl: albumCover,
    duration: t.duration,
    trackNumber: t.trackNum,
    year: t.year,
    genre: t.genre,
    playCount: t.playCount,
    audioUrl: t.audioUrl,
  };
}

export interface GenreInfo {
  name: string;
  trackCount: number;
  color: string;
}

export function genreColor(name: string): string {
  const PALETTE = [
    "#5d3a9b", "#c25b1e", "#b0402c", "#8a6a1f", "#2675b8",
    "#b12b2b", "#2c8a6e", "#9333ea", "#1f9e8e", "#a3a31c",
    "#a54a2a", "#0e7f96", "#4d8a2f", "#7d3ac1", "#7e3fa8",
  ];
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = h >>> 0;
  return PALETTE[h % PALETTE.length];
}

export type SortOrder = "asc" | "desc";

export type AlbumSort =
  | "alphabeticalByName"
  | "alphabeticalByArtist"
  | "random"
  | "recentlyAdded"
  | "recentlyPlayed"
  | "recentlyReleased"
  | "playCount"
  | "year"
  | "rating";

export type SongSort =
  | "alphabeticalByName"
  | "artist"
  | "album"
  | "random"
  | "playCount"
  | "duration"
  | "year"
  | "recentlyPlayed";
