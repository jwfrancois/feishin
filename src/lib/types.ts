// Feishin rebuild — shared domain types (mirroring feishin's domain model)

export interface Artist {
  id: string;
  name: string;
  genre: string;
  imageUrl: string;
  color: [number, number, number];
}

export interface Album {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
  year: number;
  genre: string;
  coverUrl: string;
  color: [number, number, number];
  trackIds: string[];
  playCount: number;
  rating: number;
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
  trackIds: string[];
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
