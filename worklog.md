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
