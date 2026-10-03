// Feishin rebuild — client-side Jellyfin API layer
// All requests go through the same-origin /api/jf* proxy (token stays server-side).
import type { Album, Artist, Playlist, Song, GenreInfo } from "./types";
import { genreColor } from "./types";

// ---------------------------------------------------------------- raw fetch

export async function jf<T = unknown>(path: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
  }
  const url = `/api/jf/${path}${[...qs.keys()].length ? `?${qs.toString()}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      msg = data.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(`Jellyfin: ${msg}`);
  }
  return res.json() as Promise<T>;
}

export const jfImageUrl = (itemId: string, tag?: string, maxWidth = 300, name?: string, artist?: string): string =>
  `/api/jf-img/${itemId}?maxWidth=${maxWidth}${tag ? `&tag=${tag}` : ""}${
    name ? `&name=${encodeURIComponent(name.slice(0, 80))}` : ""
  }${artist ? `&artist=${encodeURIComponent(artist.slice(0, 80))}` : ""}`;

export const jfAudioUrl = (itemId: string): string => `/api/jf-audio/${itemId}`;

// ---------------------------------------------------------------- item shapes

export interface JfItem {
  Id: string;
  Name?: string;
  Type?: string;
  Album?: string;
  AlbumId?: string;
  AlbumArtist?: string;
  AlbumArtists?: { Name: string; Id: string }[];
  Artists?: string[];
  ArtistItems?: { Name: string; Id: string }[];
  Genres?: string[];
  ProductionYear?: number;
  PremiereDate?: string;
  DateCreated?: string;
  IndexNumber?: number;
  RunTimeTicks?: number;
  Container?: string;
  ChildCount?: number;
  Overview?: string;
  ImageTags?: { Primary?: string };
  PlaylistItemIds?: string[];
  UserData?: { PlayCount?: number; IsFavorite?: boolean; Likes?: boolean | null; LastPlayedDate?: string };
}

interface Paged<T> {
  Items: T[];
  TotalRecordCount: number;
}

function yearOf(item: JfItem): number {
  if (item.ProductionYear) return item.ProductionYear;
  if (item.PremiereDate) return new Date(item.PremiereDate).getFullYear() || 0;
  return 0;
}

export function mapAlbum(item: JfItem): Album {
  return {
    id: item.Id,
    name: item.Name ?? "Unknown album",
    artistId: item.AlbumArtists?.[0]?.Id ?? "",
    artistName: item.AlbumArtists?.[0]?.Name ?? item.AlbumArtist ?? item.Artists?.[0] ?? "Unknown artist",
    year: yearOf(item),
    genre: item.Genres?.[0] ?? "",
    coverUrl: jfImageUrl(item.Id, item.ImageTags?.Primary, 300, item.Name, item.AlbumArtists?.[0]?.Name ?? item.AlbumArtist ?? item.Artists?.[0]),
    coverTag: item.ImageTags?.Primary,
    color: [70, 78, 96],
    trackIds: [],
    trackCount: item.ChildCount ?? 0,
    playCount: item.UserData?.PlayCount ?? 0,
    rating: 0, // Jellyfin 10.11 exposes no numeric-rating API; likes/dislikes are used instead
    likes: item.UserData?.Likes ?? null,
    duration: (item.RunTimeTicks ?? 0) / 1e7,
  };
}

export function mapSong(item: JfItem): Song {
  const artistName =
    item.Artists?.[0] ?? item.AlbumArtists?.[0]?.Name ?? item.AlbumArtist ?? item.ArtistItems?.[0]?.Name ?? "Unknown artist";
  return {
    id: item.Id,
    name: item.Name ?? "Unknown track",
    artist: artistName,
    artistId: item.AlbumArtists?.[0]?.Id ?? item.ArtistItems?.find((a) => a.Name === artistName)?.Id,
    album: item.Album ?? "",
    albumId: item.AlbumId,
    albumCoverUrl: item.AlbumId ? jfImageUrl(item.AlbumId, undefined, 300, item.Album, artistName) : undefined,
    duration: (item.RunTimeTicks ?? 0) / 1e7,
    trackNumber: item.IndexNumber,
    year: yearOf(item),
    genre: item.Genres?.[0],
    playCount: item.UserData?.PlayCount ?? 0,
    audioUrl: jfAudioUrl(item.Id),
    container: item.Container,
    playlistEntryId: item.PlaylistItemIds?.[0],
    likes: item.UserData?.Likes ?? null,
  };
}

export function mapArtist(item: JfItem): Artist {
  return {
    id: item.Id,
    name: item.Name ?? "Unknown artist",
    genre: item.Genres?.[0] ?? "",
    // always request — the proxy renders an initials placeholder when the item has no image
    imageUrl: jfImageUrl(item.Id, item.ImageTags?.Primary, 400, item.Name),
    color: [60, 64, 80],
    overview: item.Overview,
    likes: item.UserData?.Likes ?? null,
  };
}

export function mapPlaylist(item: JfItem): Playlist {
  return {
    id: item.Id,
    name: item.Name ?? "Untitled playlist",
    trackCount: item.ChildCount ?? 0,
    coverUrl: jfImageUrl(item.Id, item.ImageTags?.Primary, 300, item.Name),
    color: [70, 78, 96],
    duration: (item.RunTimeTicks ?? 0) / 1e7,
  };
}

// ---------------------------------------------------------------- queries

const ALBUM_FIELDS = "ChildCount,Genres,AlbumArtists,ProductionYear";
const SONG_FIELDS = "Container,Genres,Artists,AlbumArtists";
const IMG = { imageTypeLimit: 1, enableImageTypes: "Primary" };

export interface AlbumPageOpts {
  sortBy?: string;
  sortOrder?: "Ascending" | "Descending";
  startIndex?: number;
  limit?: number;
  searchTerm?: string;
  genre?: string;
}

export async function fetchAlbumsPage(opts: AlbumPageOpts = {}): Promise<{ albums: Album[]; total: number }> {
  const data = await jf<Paged<JfItem>>("Items", {
    includeItemTypes: "MusicAlbum",
    recursive: "true",
    sortBy: opts.sortBy ?? "SortName",
    sortOrder: opts.sortOrder ?? "Ascending",
    startIndex: opts.startIndex,
    limit: opts.limit ?? 60,
    fields: ALBUM_FIELDS,
    ...IMG,
    ...(opts.searchTerm ? { searchTerm: opts.searchTerm } : {}),
    ...(opts.genre ? { genres: opts.genre } : {}),
  });
  return { albums: (data.Items ?? []).map(mapAlbum), total: data.TotalRecordCount ?? 0 };
}

export async function fetchAlbum(id: string): Promise<Album | null> {
  try {
    const item = await jf<JfItem>(`item/${id}`);
    return mapAlbum(item);
  } catch {
    return null;
  }
}

export async function fetchAlbumTracks(albumId: string): Promise<Song[]> {
  const data = await jf<Paged<JfItem>>("Items", {
    includeItemTypes: "Audio",
    recursive: "true",
    parentId: albumId,
    sortBy: "ParentIndexNumber,IndexNumber,SortName",
    sortOrder: "Ascending",
    limit: 500,
    fields: SONG_FIELDS,
  });
  return (data.Items ?? []).map(mapSong);
}

export async function fetchArtistsPage(opts: { startIndex?: number; limit?: number; searchTerm?: string } = {}): Promise<{
  artists: Artist[];
  total: number;
}> {
  const data = await jf<Paged<JfItem>>("Artists/AlbumArtists", {
    sortBy: "SortName",
    sortOrder: "Ascending",
    startIndex: opts.startIndex,
    limit: opts.limit ?? 60,
    fields: "Genres",
    ...IMG,
    ...(opts.searchTerm ? { searchTerm: opts.searchTerm } : {}),
  });
  return { artists: (data.Items ?? []).map(mapArtist), total: data.TotalRecordCount ?? 0 };
}

export async function fetchArtist(id: string): Promise<Artist | null> {
  try {
    const item = await jf<JfItem>(`item/${id}`);
    return mapArtist(item);
  } catch {
    return null;
  }
}

export async function fetchArtistAlbums(artistId: string): Promise<Album[]> {
  const data = await jf<Paged<JfItem>>("Items", {
    includeItemTypes: "MusicAlbum",
    recursive: "true",
    albumArtistIds: artistId,
    sortBy: "ProductionYear,SortName",
    sortOrder: "Ascending",
    limit: 200,
    fields: ALBUM_FIELDS,
    ...IMG,
  });
  return (data.Items ?? []).map(mapAlbum);
}

export async function fetchArtistTopSongs(artistId: string, limit = 12): Promise<Song[]> {
  const data = await jf<Paged<JfItem>>("Items", {
    includeItemTypes: "Audio",
    recursive: "true",
    albumArtistIds: artistId,
    sortBy: "PlayCount",
    sortOrder: "Descending",
    limit,
    fields: SONG_FIELDS,
  });
  return (data.Items ?? []).map(mapSong);
}

export async function fetchTracksPage(opts: { sortBy?: string; sortOrder?: "Ascending" | "Descending"; startIndex?: number; limit?: number } = {}): Promise<{
  songs: Song[];
  total: number;
}> {
  const data = await jf<Paged<JfItem>>("Items", {
    includeItemTypes: "Audio",
    recursive: "true",
    sortBy: opts.sortBy ?? "SortName",
    sortOrder: opts.sortOrder ?? "Ascending",
    startIndex: opts.startIndex,
    limit: opts.limit ?? 100,
    fields: SONG_FIELDS,
  });
  return { songs: (data.Items ?? []).map(mapSong), total: data.TotalRecordCount ?? 0 };
}

export async function fetchRandomSongs(limit = 30): Promise<Song[]> {
  const data = await jf<Paged<JfItem>>("Items", {
    includeItemTypes: "Audio",
    recursive: "true",
    sortBy: "Random",
    limit,
    fields: SONG_FIELDS,
  });
  return (data.Items ?? []).map(mapSong);
}

export async function fetchGenres(limit = 300): Promise<GenreInfo[]> {
  const data = await jf<Paged<JfItem>>("Genres", {
    sortBy: "SortName",
    sortOrder: "Ascending",
    limit,
  });
  return (data.Items ?? []).map((g) => ({
    name: g.Name ?? "",
    trackCount: 0, // ItemCount is not exposed by /Genres on all Jellyfin versions
    color: genreColor(g.Name ?? ""),
  }));
}

export async function fetchGenreAlbums(genre: string, startIndex = 0, limit = 60): Promise<{ albums: Album[]; total: number }> {
  return fetchAlbumsPage({ genre, startIndex, limit, sortBy: "SortName" });
}

export async function fetchGenreTracks(genre: string, limit = 100): Promise<Song[]> {
  const data = await jf<Paged<JfItem>>("Items", {
    includeItemTypes: "Audio",
    recursive: "true",
    genres: genre,
    sortBy: "SortName",
    limit,
    fields: SONG_FIELDS,
  });
  return (data.Items ?? []).map(mapSong);
}

export interface SearchResults {
  artists: Artist[];
  albums: Album[];
  songs: Song[];
}

export async function searchAll(term: string): Promise<SearchResults> {
  const q = { searchTerm: term, recursive: "true", ...IMG };
  const [artists, albums, songs] = await Promise.all([
    jf<Paged<JfItem>>("Artists/AlbumArtists", { ...q, limit: 8, fields: "Genres" }),
    jf<Paged<JfItem>>("Items", { ...q, includeItemTypes: "MusicAlbum", limit: 12, fields: ALBUM_FIELDS }),
    jf<Paged<JfItem>>("Items", { ...q, includeItemTypes: "Audio", limit: 50, fields: SONG_FIELDS }),
  ]);
  return {
    artists: (artists.Items ?? []).map(mapArtist),
    albums: (albums.Items ?? []).map(mapAlbum),
    songs: (songs.Items ?? []).map(mapSong),
  };
}

export async function fetchFavorites(type: "Audio" | "MusicAlbum" | "MusicArtist", limit = 300): Promise<{ items: JfItem[]; total: number }> {
  const path = type === "MusicArtist" ? "Artists/AlbumArtists" : "Items";
  const data = await jf<Paged<JfItem>>(path, {
    ...(type === "MusicArtist" ? {} : { includeItemTypes: type }),
    recursive: "true",
    filters: "IsFavorite",
    sortBy: "SortName",
    limit,
    fields: type === "MusicAlbum" ? ALBUM_FIELDS : type === "Audio" ? SONG_FIELDS : "Genres",
    ...IMG,
  });
  return { items: data.Items ?? [], total: data.TotalRecordCount ?? 0 };
}

// ---------------------------------------------------------------- playlists

export async function fetchPlaylistsPage(opts: { startIndex?: number; limit?: number } = {}): Promise<{ playlists: Playlist[]; total: number }> {
  const data = await jf<Paged<JfItem>>("Items", {
    includeItemTypes: "Playlist",
    recursive: "true",
    sortBy: "SortName",
    sortOrder: "Ascending",
    startIndex: opts.startIndex,
    limit: opts.limit ?? 40,
    ...IMG,
  });
  return { playlists: (data.Items ?? []).map(mapPlaylist), total: data.TotalRecordCount ?? 0 };
}

export async function fetchPlaylistItems(playlistId: string): Promise<Song[]> {
  const data = await jf<Paged<JfItem>>(`Playlists/${playlistId}/Items`, {
    limit: 1000,
    fields: SONG_FIELDS,
  });
  return (data.Items ?? []).map(mapSong);
}
/** Create a playlist (optionally seeded with song ids). Returns the new playlist id. */
export async function createPlaylist(name: string, songIds: string[] = []): Promise<string> {
  const data = (await jfPost("Playlists", {}, { Name: name, Ids: songIds })) as { Id?: string };
  return data?.Id ?? "";
}

export async function addToPlaylist(playlistId: string, songIds: string[]): Promise<void> {
  await jfPost(`Playlists/${playlistId}/Items`, { Ids: songIds.join(",") }, {});
}

export async function removeFromPlaylist(playlistId: string, entryIds: string[]): Promise<void> {
  await jfDelete(`Playlists/${playlistId}/Items`, { EntryIds: entryIds.join(",") });
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await jfDelete(`Items/${playlistId}`);
}

export async function renamePlaylist(playlistId: string, name: string): Promise<void> {
  await jfPost(`Items/${playlistId}`, {}, { Name: name });
}

export async function fetchPlaylistDetail(playlistId: string): Promise<Playlist | null> {
  try {
    const item = await jf<JfItem>(`item/${playlistId}`);
    return mapPlaylist(item);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- favorites / lyrics / misc

export async function setFavorite(itemId: string, favorite: boolean): Promise<void> {
  if (favorite) await jfPost(`favorite/${itemId}`, {}, {});
  else await jfDelete(`favorite/${itemId}`);
}

/**
 * Set the Jellyfin like/dislike for an item (UserData.Likes).
 * Jellyfin 10.11 removed the numeric 0-10 rating; `likes` is the remaining primitive.
 * Pass null to clear.
 */
export async function setLike(itemId: string, like: boolean | null): Promise<void> {
  if (like === null) {
    await jfDelete(`UserItems/${itemId}/Rating`);
  } else {
    await jfPost(`UserItems/${itemId}/Rating`, { likes: like ? "true" : "false" }, {});
  }
}

export interface LyricLine {
  time: number;
  text: string;
}

/** Synced lyrics from Jellyfin (10.9+). Returns null when unavailable. */
export async function fetchLyrics(itemId: string): Promise<LyricLine[] | null> {
  try {
    const data = await jf<{ Lyrics?: { Start?: number; Text?: string }[] }>(`Audio/${itemId}/Lyrics`);
    const lines = data.Lyrics ?? [];
    if (lines.length === 0) return null;
    return lines.map((l) => ({ time: (l.Start ?? 0) / 1e7, text: l.Text ?? "" }));
  } catch {
    return null;
  }
}

/** Plain (unsynced) lyrics — distributed evenly across the track duration. */
export async function fetchPlainLyricsAsSynced(itemId: string, duration: number): Promise<LyricLine[] | null> {
  try {
    const data = await jf<{ Lyrics?: { Start?: number; Text?: string }[] }>(`Audio/${itemId}/Lyrics`);
    const lines = data.Lyrics ?? [];
    if (lines.length === 0) return null;
    if (lines.some((l) => (l.Start ?? 0) > 0)) {
      return lines.map((l) => ({ time: (l.Start ?? 0) / 1e7, text: l.Text ?? "" }));
    }
    const step = duration > 0 ? duration / lines.length : 3;
    return lines.map((l, i) => ({ time: i * step, text: l.Text ?? "" }));
  } catch {
    return null;
  }
}

export async function similarAlbums(albumId: string, limit = 8): Promise<Album[]> {
  const data = await jf<Paged<JfItem>>(`Items/${albumId}/Similar`, { limit });
  return (data.Items ?? []).map(mapAlbum);
}

export async function similarAlbumsSongs(albumId: string, limit = 12): Promise<Song[]> {
  const albums = await similarAlbums(albumId, 3);
  if (albums.length === 0) return [];
  const songs = await fetchAlbumTracks(albums[0].id);
  return songs.slice(0, limit);
}

export async function getSystemInfo(): Promise<{ ServerName?: string; Version?: string }> {
  return jf<{ ServerName?: string; Version?: string }>("System/Info");
}

// ---------------------------------------------------------------- playback reporting

export type PlaybackAction = "start" | "progress" | "stop";

export async function reportPlayback(action: PlaybackAction, itemId: string, positionSec: number, isPaused: boolean): Promise<void> {
  // Jellyfin routes: start -> POST /Sessions/Playing, progress -> /Sessions/Playing/Progress,
  // stop -> /Sessions/Playing/Stopped. ("/Sessions/Playing/Started" is an Emby-legacy path
  // that does not exist in Jellyfin — it 404s and our proxy surfaced it as a 502.)
  const path = action === "start" ? "Sessions/Playing" : action === "progress" ? "Sessions/Playing/Progress" : "Sessions/Playing/Stopped";
  try {
    await jfPost(path, {}, {
      ItemId: itemId,
      PositionTicks: Math.round(positionSec * 1e7),
      IsPaused: isPaused,
      EventName: action === "start" ? "playbackstart" : action === "progress" ? "timeupdate" : "playbackstop",
    });
  } catch {
    // reporting is best-effort
  }
}

// ---------------------------------------------------------------- verbs (avoid tree of helpers)

export async function jfPost(path: string, params: Record<string, string | number | undefined>, body: unknown): Promise<unknown> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const res = await fetch(`/api/jf/${path}${[...qs.keys()].length ? `?${qs.toString()}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`Jellyfin POST ${path}: ${res.status}`);
  return res.json().catch(() => ({}));
}

export async function jfDelete(path: string, params: Record<string, string | number | undefined> = {}): Promise<unknown> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const res = await fetch(`/api/jf/${path}${[...qs.keys()].length ? `?${qs.toString()}` : ""}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Jellyfin DELETE ${path}: ${res.status}`);
  return res.json().catch(() => ({}));
}
