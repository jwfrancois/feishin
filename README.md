# Feishin (Web Rebuild)

A faithful web rebuild of [Feishin](https://github.com/jeffvli/feishin) — the open-source music player client for self-hosted media servers — running entirely on **Next.js 16 (App Router) + TypeScript + Tailwind CSS + shadcn/ui**, and wired to a live **Jellyfin** server for all library data.

## Features

- **Live Jellyfin integration** — home, albums, artists, tracks, genres, playlists, search and favorites all render real data from your server. No mock layer anywhere in the app.
- **Full-featured player** — play/pause/stop, seek, shuffle, repeat (off/all/one), volume + mute, queue management ("play next" / "add later"), keyboard hotkeys (space, arrows, Ctrl+arrows for track skip).
- **Playback reporting** — play starts/progress/stops are reported back to Jellyfin so your play counts and "recently played" stay in sync.
- **Favorites & likes** — favorite hearts and the thumbs-up like button write straight back to Jellyfin (`UserData.IsFavorite` / `UserData.Likes`).
- **Server-backed playlists** — create, rename, delete, add/remove tracks; all mutations hit the Jellyfin API.
- **Synced lyrics** — the now-playing view fetches Jellyfin's lyrics API (10.9+) and highlights lines in time with playback.
- **Detail pages** — album pages with dominant-color hero, artist pages with blurred photo hero, bio, discography and top songs, genre stripes and genre drill-downs.
- **Server-side caching** — a same-origin JSON proxy with per-route TTL caching and stale-while-revalidate keeps a 100k+-track library feeling snappy.
- **Feishin UI, faithfully** — 90px player bar, sidebar with playlists, right-side queue panel, song context menus, dark theme, skeleton loaders, toasts.

## Getting started

```bash
bun install        # or npm install / pnpm install
bun run dev        # development server on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000). The app auto-connects to the configured Jellyfin server on startup; the login screen ("Add server") can add or switch servers at runtime.

### Configuration

The Jellyfin connection lives **server-side only** (the browser talks exclusively to same-origin `/api/*` routes and never sees your credentials). Defaults can be overridden with environment variables:

| Variable             | Description                              |
| -------------------- | ---------------------------------------- |
| `JELLYFIN_URL`       | Base URL of the Jellyfin server          |
| `JELLYFIN_USERNAME`  | Jellyfin account username                |
| `JELLYFIN_PASSWORD`  | Jellyfin account password                |
| `JELLYFIN_API_KEY`   | Optional admin API key (auth fallback)   |

Authentication tries `POST /Users/AuthenticateByName` first and falls back to the API key if that fails.

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # single-route app (zustand view routing, like Feishin)
│   └── api/
│       ├── jf/[...path]/route.ts # JSON proxy: cached GET (SWR), POST/DELETE passthrough,
│       │                         #   __ready / __configure control endpoints
│       ├── jf-audio/[id]/route.ts# audio stream proxy (HTTP Range passthrough,
│       │                         #   universal-transcode fallback)
│       └── jf-img/[id]/route.ts  # image proxy with on-disk cache (.cache/jf-img)
│                                 #   and upstream concurrency limiting
├── lib/
│   ├── jf-server.ts              # server-side connection manager: auth, music-library
│   │                             #   discovery, TTL cache (globalThis singletons)
│   ├── jellyfin.ts               # client API layer: paged queries, mappers, mutations
│   ├── types.ts                  # domain model (Artist / Album / Song / Playlist)
│   └── format.ts                 # duration helpers, dominant-color extraction
├── hooks/use-jf.ts               # useJfQuery: module-level cache + dedupe + invalidation
├── store/                        # zustand stores (auth, player, router, settings)
└── components/feishin/           # views, player bar, song table, shared widgets
```

**Why a proxy?** Jellyfin credentials never reach the browser; the Next.js server holds the token, injects `userId`/`parentId` into queries, and serves images/audio through cached same-origin routes. This also enables aggressive caching (per-endpoint TTLs, stale-while-revalidate, in-flight dedupe) that a thin client can't do alone.

## Known limitations

- **Audio playback depends on the server's media share.** If the Jellyfin server's music folder is unmounted, audio files 404 and playback falls back to a transcode request before surfacing an error toast. The audio pipeline itself (Range passthrough + transcode fallback) is proven; it will work the moment the share is available.
- **Star ratings are hidden on Jellyfin.** Jellyfin 10.11 removed the numeric 0–10 rating API (only like/dislike remains), and upstream Feishin shows star ratings for Navidrome/Subsonic only. This rebuild follows suit and uses Jellyfin's native like (`UserData.Likes`) instead.
- **Genre counts** — Jellyfin 10.11's `/Genres` endpoint no longer exposes `ItemCount` and facets are ignored, so genre stripes show names only.
- **Lyrics** are shown only for tracks that have lyrics files on the server.
- Desktop-only Feishin features (MPV audio backend, DLNA) are represented in the UI but not functional in this web build.

## Credits

- [Feishin](https://github.com/jeffvli/feishin) by Jeff Vli — the original desktop/web client this project faithfully rebuilds.
- [Jellyfin](https://jellyfin.org/) — the free software media system.
- Built with [Next.js](https://nextjs.org/), [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), [zustand](https://github.com/pmndrs/zustand) and [Radix UI](https://www.radix-ui.com/).
