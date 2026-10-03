# Feishin (Web Rebuild)

A faithful web rebuild of [Feishin](https://github.com/jeffvli/feishin) — the open-source music player client for self-hosted media servers — running entirely on **Next.js 16 (App Router) + TypeScript + Tailwind CSS + shadcn/ui**, and wired to a live **Jellyfin** server for all library data.

## Features

- **Live Jellyfin integration** — home, albums, artists, tracks, genres, playlists, search and favorites all render real data from your server. No mock layer anywhere in the app.
- **Full-featured player** — play/pause/stop, seek, shuffle, repeat (off/all/one), volume + mute, queue management ("play next" / "add later"), keyboard hotkeys (space, arrows, Ctrl+arrows for track skip).
- **Hi-Fi Studio sound system** — a real Web Audio DSP chain: preamp, 10-band parametric EQ with 13 studio presets, headphone crossfeed, mid/side stereo width, balance, 4-mode dynamics compressor and loudness normalization — plus a canvas spectrum analyzer with L/R peak meters (see below).
- **Agent Auto-EQ** — the Library Agent analyzes the playing track or album (library genres + Deezer + MusicBrainz) and adapts the sound output automatically, with a confidence score and rationale; manual control always wins (see below).
- **Playback reporting** — play starts/progress/stops are reported back to Jellyfin so your play counts and "recently played" stay in sync.
- **Favorites & likes** — favorite hearts and the thumbs-up like button write straight back to Jellyfin (`UserData.IsFavorite` / `UserData.Likes`).
- **Server-backed playlists** — create, rename, delete, add/remove tracks; all mutations hit the Jellyfin API.
- **Synced lyrics** — the now-playing view fetches Jellyfin's lyrics API (10.9+) and highlights lines in time with playback.
- **Library Agent (autonomous manager)** — a background agent that scrapes the internet to fill your library's gaps and continuously monitors system health (see below).
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
│   ├── instrumentation.ts        # boots the Library Agent scheduler with the server
│   └── api/
│       ├── jf/[...path]/route.ts # JSON proxy: cached GET (SWR), POST/DELETE passthrough,
│       │                         #   __ready / __configure control endpoints
│       ├── jf-audio/[id]/route.ts# audio stream proxy (HTTP Range passthrough,
│       │                         #   universal-transcode fallback)
│       ├── jf-img/[id]/route.ts  # image proxy with on-disk cache (.cache/jf-img),
│       │                         #   upstream concurrency limiting + agent artwork fallback
│       └── agent/…               # Library Agent: status / run / findings / health /
│                                 #   config / enrichment endpoints
├── lib/
│   ├── jf-server.ts              # server-side connection manager: auth, music-library
│   │                             #   discovery, TTL cache (globalThis singletons)
│   ├── jellyfin.ts               # client API layer: paged queries, mappers, mutations
│   ├── audio/                    # Hi-Fi DSP: hifi-engine.ts (Web Audio chain) +
│   │                             #   eq-presets.ts (13 studio EQ presets)
│   ├── agent/                    # agent core: scheduler, config, jobs (health / scan),
│   │                             #   writeback (Jellyfin write-back), sound-profile.ts
│   │                             #   (Auto-EQ analyzer), internet sources (musicbrainz,
│   │                             #   deezer, itunes, wikipedia, lrclib, fanart) —
│   │                             #   all rate-limited server-side
│   ├── types.ts                  # domain model (Artist / Album / Song / Playlist)
│   └── format.ts                 # duration helpers, dominant-color extraction
├── hooks/use-jf.ts               # useJfQuery: module-level cache + dedupe + invalidation
├── store/                        # zustand stores (auth, player, router, settings, hifi)
└── components/feishin/           # views (incl. agent dashboard), player bar, song table,
                                  #   hifi studio panel + spectrum visualizer
```

**Why a proxy?** Jellyfin credentials never reach the browser; the Next.js server holds the token, injects `userId`/`parentId` into queries, and serves images/audio through cached same-origin routes. This also enables aggressive caching (per-endpoint TTLs, stale-while-revalidate, in-flight dedupe) that a thin client can't do alone.

## Hi-Fi Studio sound system

The player bar's waveform button (or **Settings → Playback → "Open studio"**) opens the studio panel — a genuine Web Audio signal chain between the stream and your speakers:

```
<audio> → preamp → 10-band EQ → crossfeed → stereo width → balance
        → dynamics compressor → loudness normalization → master → destination
```

| Stage | What it does |
| --- | --- |
| Preamp | −24…+12 dB input trim |
| 10-band EQ | ISO-octave peaking bands (31 Hz … 16 kHz, ±12 dB) with 13 studio presets (Flat, Studio Reference, Acoustic, Bass Boost/Reduce, Classical, Dance, Electronic, Hip-Hop, Jazz, Pop, Rock, Vocal Boost) + custom curves |
| Crossfeed | bs2b-style headphone correction — a delayed, low-passed cross-bleed of the opposite channel |
| Stereo width | mid/side matrix from mono (0 %) to extra-wide (150 %) |
| Balance | StereoPanner left/right trim |
| Dynamics | Off / Reference / Night (gentle 6:1 levelling) / Club (punchy 4:1) / Custom |
| Loudness normalization | RMS-targeted gain loop (~−19 dBFS) for quiet masters |

A canvas **spectrum analyzer** (log-frequency, dBFS grid, peak-hold) and **L/R 28-segment peak meters** visualize the chain; an optional mini spectrum lives in the player bar. Everything persists, and every parameter change is applied with click-free smoothing ramps — switching presets or tracks never interrupts playback. A **bit-perfect bypass** path (15 ms crossfades) lets you A/B the whole chain against raw output.

### Agent Auto-EQ — the agent tunes the sound for you

With **Agent Auto-EQ** enabled (on by default, toggle in the studio panel), the Library Agent analyzes the playing track or album and adapts the sound output for a better listening experience:

- **Tag layers** are blended: Jellyfin library genres (weight 1.0) → Deezer album genres (0.8) → MusicBrainz artist tags (0.6), each honoring the per-source toggles in the agent settings.
- Blended tags match against **13 studio genre-class signatures** (electronic, hip-hop, rock, metal, pop, soul, jazz, classical, acoustic, ambient, blues, world, vocal), then tag **accents** refine the curve (sub lift for bass/808, tamed highs for lo-fi/vinyl, air for bright, presence for vocal, width for live) and a **pre-1995 "old master" heuristic** engages loudness normalization.
- The resulting profile (full 10-band curve, preamp, crossfeed, width, dynamics mode, normalization) is applied live with a **confidence %**, the matched tags and their sources, and a **plain-English rationale** in the studio panel.
- **Scope** is per **album** by default (one profile for all its tracks — switchable to per-track). Manual control always wins: touching any DSP control shows "Manual override active", and the agent re-engages on the next item. A **Re-analyze** button forces a fresh lookup.
- Endpoint: `GET /api/agent/sound-profile/[itemId]?itemType=track|album&name=…&artist=…&album=…&genres=…&year=…[&refresh=1]`. Profiles are cached in the agent DB; an inconclusive analysis (e.g. a rate-limited source) retries after a 90 s cooldown instead of poisoning the cache.

## Library Agent

A **cloud agent** runs inside the Next.js server process (started via `src/instrumentation.ts` on boot, tick loop every 30 s) and services the media library like a manager. Its two recurring jobs:

### 1. Enrichment — scrape the internet for what the library is missing

Every 45 min (configurable) the agent scans a small, polite batch of items (16 by default, alternating albums/artists) and fills gaps using free, key-less public APIs:

| Gap | Sources (in order) | Result |
| --- | --- | --- |
| Missing album art | Deezer → iTunes → MusicBrainz + Cover Art Archive | Cover served automatically through the image proxy |
| Missing artist photo | **Fanart.tv** (needs free API key) → Deezer → Wikipedia thumbnail | Photo served through the image proxy |
| Missing artist bio | Wikipedia | Rendered on the artist page with attribution |
| Missing year / genre / track-count | Deezer → iTunes → MusicBrainz | Used for album metadata |
| Missing lyrics | LRCLIB | Synced (LRC) or plain lyrics in the now-playing view, on demand when a track plays |
| Discography gaps | MusicBrainz release-groups | "From the internet" section on artist pages (see below) |

**Fanart.tv API key** (recommended for artist photos — Deezer's CDN blocks some networks): get a free personal key at [fanart.tv/get-an-api-key](https://fanart.tv/get-an-api-key/) and either paste it into **Agent → Settings → Fanart.tv API key** (persisted in the agent DB) or set the `FANARTTV_API_KEY` environment variable. The health check reports whether the key works ("API key working" / "API key rejected" / "no API key").

The agent also **notices gaps as you browse**: whenever the image proxy serves a placeholder for an item it has no art for, that item is queued as "pending" and prioritised by the next scan. All scraped data is persisted in SQLite (Prisma) and attributed on-screen ("via Wikipedia · Library Agent", "Lyrics via LRCLIB").

### Artist pages show the internet, not just the library

Artist detail pages combine library data with the agent's internet knowledge:

- **Bio** — the Jellyfin overview (if any) and the Wikipedia biography are shown together, each attributed ("From your Jellyfin library" / "Biography via Wikipedia · Library Agent").
- **Discography** — below the library albums, a **"From the internet"** section lists the artist's MusicBrainz releases that are **not in your library** (albums first, then EPs/singles, newest first, with year, type and a "not in library" badge; each row links to MusicBrainz). The in-library diff is recomputed live, so newly-added albums drop out automatically.

Rate-limiting: MusicBrainz is capped at 1 request/second with a descriptive User-Agent; other sources are gently throttled.

### 2. Write-back — push the scraped knowledge into Jellyfin itself

Findings are not limited to this app: the agent can **write metadata back into your Jellyfin server** so every Jellyfin client (mobile apps, smart TVs, other players) benefits too. Fill-if-missing policy — existing server values are **never overwritten**:

| Kind | Written to | Guard |
| --- | --- | --- |
| Artist bio | `POST /Items/{id}` → `Overview` (+ "Source: Wikipedia" attribution) | only when the server has no overview |
| Album / artist artwork | `POST /Items/{id}/Images/Primary` (binary upload) | only when the item has no primary image |
| Album year & genres | `POST /Items/{id}` → `ProductionYear` / `Genres` | only when missing |
| Lyrics | `POST /Audio/{id}/Lyrics?fileName=lyrics.lrc` (synced LRC parsed server-side) | only when no lyrics exist |

Three modes (Agent → Settings → *Jellyfin write-back*):

- **Off** — everything stays in-app.
- **Manual** — per-finding "write" buttons plus a **"Write all to Jellyfin"** batch in the Enrichments tab; every attempt is tracked per finding (`in-app / on server / failed` with the server's error message).
- **Automatic** — findings are written to the server right after each scan.

Note: image uploads are stored by Jellyfin **next to the media** — while a media share is unmounted the server rejects them (HTTP 500) and the finding is marked `failed` with the reason; after remounting, "Write all to Jellyfin" retries them successfully. Bio/metadata/lyrics writes live in Jellyfin's database and are unaffected.

### 3. Health monitoring

Every 5 min (configurable) the agent records a health snapshot covering:

- **Jellyfin server** — reachability, version, response latency
- **Authentication** — user session / API-key validity
- **Library index** — album/song totals
- **Media files** — Range-probes random tracks **grouped per share** (e.g. `/mnt/nas_share: 8/8 readable`, `/mnt1/unraid_share: 0/8 readable`) to pinpoint unmounted NAS shares; after a remount the score recovers automatically on the next check (recovery is called out explicitly, and a "Re-probe after remount" button forces an immediate re-check)
- **Image pipeline** — samples upstream album art
- **Internet sources** — reachability of MusicBrainz / Deezer / iTunes / CAA / Wikipedia / LRCLIB / Fanart.tv (incl. API-key state)
- **Agent database, artwork disk cache (300 MB cap), process memory & event-loop lag**

Each check reports `ok / warn / fail`, aggregated into an overall score (0–100) and an overall status (healthy / degraded / critical).

### Agent dashboard

The **Agent** item in the sidebar opens the cockpit: live status, stat cards, the full check list with latencies, a score-history sparkline, the scraped-knowledge table (filterable, with per-finding server write-back), recent-run logs, and settings. Settings include scan frequency & batch size (numeric fields **plus quick preset chips** — 10/15/30/45/60/120 min, 8/16/32/64 items; changes apply within ~30 s), the write-back mode, per-source toggles, and pause/resume. Manual "Health check" / "Scan library" triggers are available from the header.

REST endpoints: `GET /api/agent/status`, `POST /api/agent/run`, `GET /api/agent/findings`, `POST /api/agent/findings/[id]/apply`, `GET|POST /api/agent/writeback` (batch body: `{"limit": 100}`), `GET /api/agent/health?history=N`, `GET|PATCH /api/agent/config`, `GET /api/agent/enrichment/[itemId]?kind=bio|artwork|metadata|lyrics&fetch=1`, `GET /api/agent/discography/[artistId]?name=…&fetch=1`, `GET /api/agent/sound-profile/[itemId]?itemType=track|album&…`.

## Known limitations

- **Audio playback depends on the server's media share.** If a track's file can't be read by the Jellyfin server (unmounted music folder), the app detects the missing file, shows a "Skipped — unavailable on server" toast and auto-advances; after three consecutive failures it pauses to avoid churning through the queue. Fully readable shares stream and seek normally.
- **Metadata/image write-back needs a writable server.** Artwork uploads fail (HTTP 500) while the destination share is unmounted — findings are marked `failed` with the server's message and can be retried after remounting. Artist bios, album years/genres and lyrics are stored in Jellyfin's database and work regardless. Deezer availability depends on the server's network (its CDN blocks some datacenter IPs).
- **Agent Auto-EQ is a stylistic starting point, not room correction.** Profiles are derived from genre/mood tags (library, Deezer, MusicBrainz), so items with thin tagging get a low-confidence or neutral profile — the studio panel always shows what was matched and why, and manual EQ overrides the agent until the next track.
- **Image-less items get generated placeholders — until the agent finds real art.** Items without embedded/folder art (and items whose art lives on an offline share) are rendered as deterministic gradient initials tiles; the Library Agent queues them and replaces the tiles with internet-sourced covers once found.
- **Star ratings are hidden on Jellyfin.** Jellyfin 10.11 removed the numeric 0–10 rating API (only like/dislike remains), and upstream Feishin shows star ratings for Navidrome/Subsonic only. This rebuild follows suit and uses Jellyfin's native like (`UserData.Likes`) instead.
- **Genre counts** — Jellyfin 10.11's `/Genres` endpoint no longer exposes `ItemCount` and facets are ignored, so genre stripes show names only.
- **Lyrics** are shown for tracks that have lyrics files on the server; anything else is looked up on LRCLIB by the Library Agent when played (tracks absent from LRCLIB still show "No lyrics available").
- Desktop-only Feishin features (MPV audio backend, DLNA) are represented in the UI but not functional in this web build.

## Credits

- [Feishin](https://github.com/jeffvli/feishin) by Jeff Vli — the original desktop/web client this project faithfully rebuilds.
- [Jellyfin](https://jellyfin.org/) — the free software media system.
- Agent data sources: [MusicBrainz](https://musicbrainz.org/), [Cover Art Archive](https://coverartarchive.org/), [Deezer public API](https://developers.deezer.com/api), [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/), [Wikipedia REST API](https://www.mediawiki.org/wiki/API:REST_API), [LRCLIB](https://lrclib.net/), [Fanart.tv](https://fanart.tv/) (optional API key).
- Built with [Next.js](https://nextjs.org/), [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), [zustand](https://github.com/pmndrs/zustand), [Prisma](https://www.prisma.io/) and [Radix UI](https://www.radix-ui.com/).
