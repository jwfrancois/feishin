# Worklog

---
Task ID: 1
Agent: main (Super Z)
Task: Rebuild Feishin (github.com/jeffvli/feishin) faithfully as a Next.js web app

Work Log:
- Researched the original repo: sparse-cloned jeffvli/feishin, extracted theme system (defaultDark palette #141414/#1f1f21/#3774fc, mantine dark colors), layout grid (90px player bar, sidebar, main content, right queue), routes (home/albums/artists/tracks/genres/playlists/search/favorites/settings/now-playing), sidebar structure, player bar 3-section layout, home page sections (hero feature carousel, genres stripes grid, album carousels with play-count badges), album/artist detail heroes, fullscreen player (UP NEXT/RELATED/LYRICS/VISUALIZER tabs), window title format "(Paused) (1 / 9) Song — Artist — Feishin".
- Ran fullstack init script; Next.js 16 + Tailwind 4 + shadcn/ui scaffold on port 3000.
- Generated demo library via Python (scripts/generate_assets.py): 15 album artists, 27 albums, 123 synthesized MP3 tracks (numpy composition: genre-specific BPM/scales/drums/bass/pads/leads + ffmpeg 80k), 27 unique PIL-generated covers (blob/bauhaus/synthwave/glitch/watercolor/waves/chip/mountain styles), 15 artist images, manifest JSON at src/lib/library-manifest.json. Fixed Pillow rectangle bug; used retry loop for sandbox process reaping.
- Built stores: player-store (queue/shuffle/repeat/favorites/scrobble, persisted), router-store (history stack), auth-store (servers), settings-store (theme/accent/sidebar/playback), playlists-store (user playlists CRUD, seeded).
- Built theme engine (10 built-in themes: Default Dark/Light, Nord, Dracula, One Dark, Catppuccin Mocha, Gruvbox, Tokyo Night, Monokai, Glassy) applied via CSS variables.
- Built components: AudioEngine (single <audio> + scrobble + document.title), FsSlider, PlayerBar (left song info / center transport+seek / right rating+AUTO DJ+volume), Sidebar (search, back/fwd, My Library, playlists, now-playing image, server box), RightQueuePanel, SongTable (sortable columns, context menus, hearts), AlbumCard, ScrollCarousel, SongActions (context menu content), dialogs, hotkeys (space/arrows/M/S/R/Q/F//).
- Built views: Login (server type Jellyfin/Navidrome/OpenSubsonic + form + saved list), Home, Albums (grid/table+sort), AlbumDetail (hero + Play/Next/Last pills + rating), Artists, ArtistDetail (blurred hero + About + discography), Tracks, Genres, GenreDetail, Playlists, PlaylistDetail (rename/delete/add tracks), Search (tabs), Favorites (3 tabs), Settings (theme/accent/playback/servers/hotkeys, live-applied), NowPlaying (blurred bg, synced lyrics, related, up next, WebAudio visualizer).
- Fixed compound namespace exports for shadcn dropdown/context/dialog components (DropdownMenuNS/ContextMenuNS/DialogNS).
- Fixed TDZ error, relative import paths, hydration guard (mounted state), SSR export mismatches, table horizontal squeeze, mobile auto-collapse + hero wrapping, sidebar playlist merging (user + server playlists), ItemImage fallback icon.
- Browser-verified end-to-end with agent-browser: login → connect → home render → play album (audio advances, pause/seek work, title format exact) → queue panel (hotkey q) → album/artist/genre/playlist/search/settings navigation → fullscreen lyrics + visualizer → live theme switching → context menu actions → favorites → mobile viewport 390px. Zero console/page errors on final pass; lint 0 errors.

Stage Summary:
- Deliverable: faithful Feishin web-client rebuild, single route src/app/page.tsx rendering FeishinApp (zustand view routing), all assets local under public/media.
- Key decisions: mock Navidrome demo server (no live server dependency); client-side library manifest (no DB needed); HTML5 audio backend (web player, like feishin web build); synthesized audio gives real playback/seek/visualizer/lyrics sync.
- Known limitations: MPV backend / DLNA / smart playlist editor are desktop-only features represented in UI but not functional; lyrics are deterministic mock content.

---
Task ID: 1-fix (post-delivery bugfix)
Agent: main (Super Z)
Task: Fix React hydration mismatch error reported on <body> (data-new-gr-c-s-check-loaded / data-gr-ext-installed attributes)

Work Log:
- Diagnosed: attributes `data-new-gr-c-s-check-loaded="14.1334.0"` and `data-gr-ext-installed=""` are injected into <body> by the user's Grammarly browser extension before React hydration; <html> already had suppressHydrationWarning but <body> did not.
- Fix: added `suppressHydrationWarning` prop to the <body> element in src/app/layout.tsx (React suppresses attribute-level mismatches one level deep on that element — the documented remedy for extension-induced hydration errors).
- Verified: dev server returns 200; type-check of src clean (remaining tsc noise is from feishin-ref/ reference repo and examples/, pre-existing); agent-browser loaded http://localhost:3000 with zero page errors and zero hydration console warnings; screenshot confirms login/Add-server screen renders correctly.

Stage Summary:
- src/app/layout.tsx body now has suppressHydrationWarning; hydration error caused by Grammarly extension resolved without affecting app behavior.

---
Task ID: 2
Agent: main (Super Z)
Task: Replace mock library with real data from the user's Jellyfin server (https://manitou.dyabavadra.com, user dyabavadra)

Work Log:
- Probed server: Jellyfin 10.11.11 "desalyn", admin user id 19b7e945...; Music library id 7e64e319...; library scale 7,031 albums / 119,430 songs / 771 playlists; full-recursive scans take 30-60s+ so everything is paginated (parentId-scoped queries ~1-9s/page).
- Benchmarked endpoints: recently-added (DateCreated) 6-9s, artist albums 1.7s, search searchTerm 1.5s, similar 2.1s, images 0.8s TTFB, audio static stream 206 Range OK; universal transcode returns video/mp4; /Genres has no ItemCount on 10.11; lyrics endpoint 404 when absent.
- Built server-side integration: src/lib/jf-server.ts (AuthenticateByName with API-key fallback, auto music-library discovery, TTL cache + stale-while-revalidate, globalThis singletons because Next bundles per-route module instances — this bug caused stale cross-route connection state); routes: /api/jf/[...path] (cached GET, POST/DELETE passthrough, __configure/__ready control endpoints), /api/jf-audio/[id] (stream proxy with Range passthrough + universal-transcode fallback via ?mode=universal), /api/jf-img/[id] (disk cache .cache/jf-img + 6-slot upstream concurrency limiter + long browser cache).
- Built client layer: src/lib/jellyfin.ts (jf() fetch, mappers mapAlbum/mapSong/mapArtist/mapPlaylist, paged queries for albums/artists/tracks/genres/favorites/playlists, createPlaylist/addToPlaylist/removeFromPlaylist(PlaylistItemIds)/delete/rename, setFavorite, fetchLyrics/similarAlbums, reportPlayback Started/Progress/Stopped), src/hooks/use-jf.ts (useJfQuery: dedupe+cache+invalidate), src/lib/format.ts (duration helpers + extractDominantColor canvas).
- Auth: auth-store v2 seeds default server "desalyn" (creds server-side only), auto-connect via POST /api/jf/__ready with connecting/error screens; login/settings can add Jellyfin servers via __configure (page reload on switch to refresh client caches).
- Refactored ALL views to live data: home (hero/genres/5 carousels/playlists with skeletons), albums (server sort+infinite scroll+debounced search), album detail (item alias + dominant-color hero), artists (paged+search), artist detail (real photo/bio/discography/top songs), tracks (paged 100), genres (+detail via genres= param), search (3 parallel server queries), favorites (server IsFavorite), playlists (server CRUD + entry-id removal), song context menus (add-to-playlist via server, quick-create), sidebar (server playlists + server box), settings (server info v10.11.11), now-playing (Jellyfin lyrics API + Similar related + container badge).
- Player: favorites sync to server (verified "Eraser" written to Jellyfin), playback reporting (Started/Progress/Stopped), audio error fallback to transcode + descriptive toast, persist v2 reset of mock favorites.
- Removed mock layer: library.ts, library-manifest.json, lyrics.ts, playlists-store.ts; added Favorites to sidebar nav.
- Bugfixes during e2e: StrictMode double-effect connect deadlock; missing item/{id} alias; per-route module duplication (globalThis); right-queue toast import; genres AlbumCount removal.
- Verified end-to-end: since ALL server audio files are unreadable (see limitation), pointed proxy at a local fake Jellyfin (scripts/fake-jellyfin.py, Range-capable MP3s): played album via UI, currentTime advanced, seek to 60s worked (206 passthrough), Ctrl+Arrow advanced to track 2, Started/Progress POSTs 200, title format exact. Against the real server: home/albums/artist/playlist/search/favorites all render real data; favorite toggle confirmed server-side.

Stage Summary:
- App now runs entirely off the user's Jellyfin server; mock data layer deleted. Credentials live only in src/lib/jf-server.ts (server-side), browser talks exclusively to same-origin /api/*.
- LIMITATION FOUND: every audio file 404s because the server's media share /mnt1/unraid_share/Music is not mounted (Jellyfin FFmpeg logs: "Error opening input ... No such file or directory"); images still work (Jellyfin image cache). Playback will work the moment the share is remounted; audio pipeline itself proven via fake-server test.
- Known gaps: lyrics absent for most tracks (shows "No lyrics available"); genre stripes show name only (10.11 /Genres lacks ItemCount); ratings UI is local-only (Jellyfin user ratings not wired).


