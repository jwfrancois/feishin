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



---
Task ID: 2-github-push
Agent: main (Super Z)
Task: Push project code to GitHub as a private repo using user-provided credentials

Work Log:
- Verified git repo state: branch main, working tree clean, no remote configured
- Verified GitHub token against api.github.com/user (login: jwfrancois)
- Checked .env (only local DATABASE_URL, no secrets) and grepped tracked files for hardcoded credentials (Jellyfin creds present in src/lib/jf-server.ts and src/store/auth-store.ts — accepted since repo is private and they are the user's own)
- Untracked runtime image cache (.cache/jf-img/, 71 binary files) and added /.cache/ to .gitignore
- Created private repo jwfrancois/feishin via POST /user/repos (private: true)
- Added remote origin and pushed main (5 commits, 319 tracked files)
- Verified via API: private: true, default_branch: main

Stage Summary:
- Code pushed to https://github.com/jwfrancois/feishin (private)
- Runtime cache excluded from version control
- Note: Jellyfin server credentials remain hardcoded in src/lib/jf-server.ts / src/store/auth-store.ts

---
Task ID: 3
Agent: main (Super Z)
Task: Continue Jellyfin real-data integration (close remaining gaps) + write README + push

Work Log:
- Verified prior integration still live: POST /api/jf/__ready connects to "desalyn" 10.11.11; albums query returns real data; browser renders home/albums with 7,031 albums, zero console errors.
- Probed rating API: Jellyfin 10.11 removed numeric 0-10 rating (POST classic path 200 but does not persist; consolidated /Items/{id}/Rating 404). Confirmed via v10.11.0 source (UserLibraryController.cs): only likes/dislike remains (POST /UserItems/{itemId}/Rating?likes=). Upstream Feishin also hides star ratings for Jellyfin (isRatingSupported = NAVIDROME || SUBSONIC only).
- Resolved the "ratings local-only" gap faithfully: removed fake/hardcoded RatingStars from album-detail (toast-only), artist-detail (hardcoded value=4), player-bar (demoRating useState); added real Jellyfin LikeButton (thumbs-up) wired to UserData.Likes via new setLike() in jellyfin.ts (POST likes=true/false, DELETE clears); added likes?: boolean|null to Album/Artist/Song types + mappers (UserData.Likes).
- Bugfix found in testing: DELETE /UserItems/{id}/Rating returns 400 without explicit userId (API-key auth); added userId injection for UserItems/* paths in jf-server.ts jfJson; re-verified full like→unlike cycle through proxy (200/200, server state clean).
- Added userId/GET interception for __ready control endpoint in JSON proxy (was leaking to Jellyfin on GET).
- Added env-var override support for server credentials (JELLYFIN_URL/USERNAME/PASSWORD/API_KEY) with existing values as defaults.
- Added proxy cache invalidation for UserItems on POST/DELETE.
- Probed genre counts: facetFields ignored by 10.11 /Items, /Genres lacks ItemCount — stays name-only (server limitation, documented).
- Verified e2e via agent-browser: album detail shows LikeButton + FavoriteHeart; like click → POST /api/jf/UserItems/.../Rating?likes=true 200; server-side persistence confirmed (Likes: True, Rating: 10); test artifacts cleaned up; zero page errors.
- Wrote comprehensive README.md (features, setup, env config, architecture diagram, known limitations, credits).

Stage Summary:
- All UI now reflects real server state: favorites, likes, playcounts, playlists; no fake/hardcoded values remain in views.
- README.md added; credentials overridable via env vars.
- Ready to commit + push to github.com/jwfrancois/feishin.

---
Task ID: 4
Agent: main (Super Z)
Task: Fix Jellyfin media-proxy errors from user's console log (image 404s, Started 502, audio 404/500, bare-ID request)

Work Log:
- Diagnosed each error against the live server:
  - /api/jf-img 404s: two causes — (a) items with no Primary ImageTag (client still requested), (b) items on unmounted share /mnt1/unraid_share whose extracted art can't be served (upstream 404 passthrough).
  - /api/jf/Sessions/Playing/Started 502: route does not exist in Jellyfin (Emby-legacy path); confirmed vs upstream Feishin source (sessions/playing, /progress, /stopped) and live probes (Playing 204, Progress 400 without session, Stopped 204, Started 404).
  - /api/jf-audio 404 + universal 500: media share still unmounted server-side; universal transcode spins ffmpeg only to fail.
  - bare-ID request /{itemId} 404+500: stale persisted queue entries (interim audioUrl format) + no URL sanitization in audio-engine.
- Fixes:
  - jellyfin.ts reportPlayback: start -> POST /Sessions/Playing (progress/stop routes already correct); verified full flow 204/204/204 with session token via curl script (scripts/test-jf-session-flow.sh).
  - jf-img proxy: on upstream !ok return deterministic SVG placeholder (gradient hues from id hash + initials from name param), 200 with short browser cache, NOT disk-cached so real art returns automatically after server fix.
  - jfImageUrl now takes item name; mapAlbum/mapSong/mapArtist/mapPlaylist pass names; tagless artists/playlists now render initials tiles too.
  - audio-engine: URL sanitizer (must start with / or http) — stale bare-id entries toast+skip instead of hitting app root; on error HEAD-probe the stream first so missing files skip immediately without the pointless universal transcode; handleUnavailable reports stop, toasts once per track, auto-advances, pauses after 3 consecutive failures; onPlaying resets failure streak.
  - player-store persist v2 -> v3 with migrate() that clears queue/currentIndex (purges stale song objects in existing browsers).
- Verified: tsc src/ clean; curl — placeholder 200 image/svg+xml for tagless + unmounted-share albums, real art still 200 image/jpeg, /Sessions/Playing + /Progress via proxy 200; agent-browser e2e — home renders real data with TB/initials tiles, Nelly Furtado album (/mnt/nas_share, mounted) plays with seek (position 17.9s), title format exact, playback reports (Playing/Progress/Stopped) all 200, all 52 image requests 200, zero page errors; Eraser (unmounted) skips gracefully via HEAD probe, no universal 500.
- Discovery: /mnt/nas_share/Media IS mounted and streams (audio/flac 200); /mnt1/unraid_share/Music remains unmounted server-side (user should remount to restore that portion + its art).

Stage Summary:
- All console-noise sources from the user's log eliminated: no more Started 502, no image 404 storms, no bare-ID requests, no wasteful universal 500s; unavailable tracks degrade gracefully with toasts.
- README.md known-limitations section updated to match new behavior.

---
Task ID: 5
Agent: main (Super Z)
Task: Build and integrate a cloud agent ("Library Agent") that services the media library (internet metadata scraping) and monitors system health

Work Log:
- Designed autonomous agent running inside the Next.js server: instrumentation.ts boots a globalThis-singleton scheduler (30s tick) that launches two due jobs — health check (every 5 min) and library scan (every 45 min), both concurrency-guarded with full run bookkeeping (AgentRun rows with status/duration/counters/log).
- Prisma schema replaced (User/Post scaffold out): AgentRun, AgentFinding (unique itemId+kind; statuses pending/found/missing/applied), HealthSnapshot (last 240 kept), AgentConfig singleton (enabled, intervals, batchSize, per-source toggles, stage alternation); db:push + generate OK.
- Internet sources (all key-less, rate-limited, descriptive UA): MusicBrainz (1 req/s limiter; release-group/artist search) + Cover Art Archive front art; Deezer (album covers xl, artist pictures, release metadata); iTunes Search (600x600 artwork, year/genre); Wikipedia REST (artist bios w/ disambiguation skip); LRCLIB (synced LRC + plain lyrics).
- Scan job: phase 1 resolves pending artwork queue (gaps the image proxy noticed while serving); phase 2 random batch alternating albums/artists filling art/bio/metadata gaps only (Jellyfin item field checks incl. Overview after adding fields=Genres,Overview fix); results upserted into AgentFinding.
- Health job: 9 checks — Jellyfin reachability+version+latency, auth state, library counts, media-file readability (Range-probe 6 random tracks; detects unmounted shares like /mnt1/unraid_share), image pipeline, internet sources (GET probes, any-response=up after HEAD false-negative on MusicBrainz), agent DB latency, artwork cache size (300MB cap), process memory/event-loop lag; aggregated score 0-100 + healthy/degraded/critical.
- App integration ("information the library can use"): jf-img proxy on upstream miss now serves agent-scraped art (disk-cached under normal key, X-Agent-Artwork header, finding marked applied) and records never-seen gaps as pending; artist-detail renders Wikipedia bio with attribution when Jellyfin Overview empty (hook-order bug caught and fixed); now-playing falls back to LRCLIB synced lyrics via agent with "via LRCLIB" badge; jfImageUrl passes artist param for better source matching.
- Agent API: GET /api/agent/status (config+runtime+last runs+counts), POST /api/agent/run (fire-and-forget after fixing await-entire-job flaw), GET /api/agent/findings (filter/paginate), GET /api/agent/health?history=N, GET|PATCH /api/agent/config, GET /api/agent/enrichment/[itemId] (kind=bio|artwork|metadata|lyrics, fetch=1 live-lookup + persist, LRC parser).
- Agent dashboard view (sidebar "Agent" with Bot icon, route "agent"): status pill, Pause/Resume, manual Health check/Scan buttons, 4 stat cards, tabs Health (checks + score sparkline SVG), Enrichments (filterable table 80 rows), Activity (run cards with expandable logs), Settings (schedule numbers + 6 source toggles + explainer); 5s status polling while mounted. Fixed lint errors: setState-in-effect in shared.tsx ItemImage and agent NumberField via adjust-during-render pattern.
- Verified end-to-end: scheduler auto-booted (booted:true), first scan enriched 12 bios; health snapshot correctly CRITICAL 59/100 flagging 0/6 media readable on /mnt1/unraid_share + 6/6 internet sources; bio enrichment live (Nelly Furtado Wikipedia extract); lyrics live (Promiscuous, 78 synced LRC lines); artwork cycle proven (pending "Off The Wall" etc -> iTunes covers found -> jf-img served 112KB jpeg with x-agent-artwork: itunes -> disk cache hit); agent-browser e2e 11/11 PASS, 131 requests all 200, zero console errors; tsc src clean; lint 0 errors; Prisma query log noise disabled (log: error,warn).
- README.md: added Library Agent section (jobs, sources table, health checks, dashboard, endpoints), updated features/architecture/limitations/credits.

Stage Summary:
- The app now has an autonomous library manager: it fills artwork/bio/metadata/lyrics gaps from the internet (rate-limited, attributed) and reports real system health (including the user's unmounted media share — surfaced as critical with details).
- New files: src/instrumentation.ts, src/lib/agent/{http,config,scheduler}.ts, src/lib/agent/sources/{musicbrainz,deezer,itunes,wikipedia,lrclib}.ts, src/lib/agent/jobs/{scan,health}.ts, src/app/api/agent/* (6 routes), src/components/feishin/views/agent.tsx, src/lib/agent-client.ts; prisma/schema.prisma replaced; db at db/custom.db (gitignored).

---
Task ID: 6
Agent: main (Super Z)
Task: Agent upgrades per user: (a) NAS share remount -> health recovery, (b) write metadata back into Jellyfin, (c) tune scan frequency/batch size in Settings

Work Log:
- Health job now groups media-file probes per share (8 random tracks, /mnt root buckets), calls out recovery vs the previous snapshot ("share back online — recovered"), hints "remount them; the score recovers on the next check", and the dashboard Media files card lists per-share readable counts + a "Re-probe after remount" button.
- Schema: AgentFinding + serverStatus/serverError/serverSyncedAt (+ index), AgentConfig + writeBack (off|manual|auto, default manual). db:push + generate OK (dev server restarted to pick up regenerated client).
- jf-server.ts: new jfRaw() binary-body helper (auth, 401 retry, custom content-type, query params); JfFetchOptions gained PUT.
- New src/lib/agent/writeback.ts: applyFindingToJellyfin + applyBatchToJellyfin (globalThis batch flag, 350 ms spacing). Fill-if-missing writers: bio -> POST /Items/{id} Overview + Wikipedia attribution (only if empty); artwork -> POST /Items/{id}/Images/Primary binary upload (only if no Primary tag); metadata -> ProductionYear/Genres (only if missing); lyrics -> POST /Audio/{id}/Lyrics?fileName=lyrics.lrc with raw LRC text (LyricDto JSON rejected with fileName-required 400; /Items/{id}/Lyrics is 404 on 10.11 — lyrics are Audio-scoped). Results tracked per finding; successful applies invalidate the jf cache.
- New routes: POST /api/agent/findings/[id]/apply (single), GET|POST /api/agent/writeback (batch, fire-and-forget, running flag poll).
- Scan job: auto-apply when config.writeBack==="auto" (maybeAutoApply logs "→ Jellyfin:" lines incl. failures); findings API exposes serverStatus/serverError.
- Dashboard: Enrichments table gained Server column (in-app/on server/failed + tooltip) and per-row write buttons + "Write all to Jellyfin" batch button with poll-til-done; Settings gained "Jellyfin write-back" 3-way control and preset chips for scan interval (10/15/30/45/60/120 min) + batch size (8/16/32/64); health card shows per-share breakdown.
- Verified LIVE against real server: metadata "Own It" -> year 2018/genres Christian persisted on server (idempotent re-apply skips); bio "Damae" -> 967-char Wikipedia overview + attribution on server; lyrics "I'm Like A Bird" -> 62 synced LRC lines stored server-side (Start ticks verified); batch of 5 -> +4 artist bios synced; auto scan run -> write-back attempted and honestly failed on dead-share artwork; artwork upload to imageless album on /mnt1/unraid_share fails 500 (Jellyfin cannot save next to media on the unmounted share — request itself is correct; will succeed after remount; skip-guard proven against album that already had art).
- Discoveries: Deezer CDN (Akamai) 403-blocks this sandbox IP (health check shows sources reachable via root GET, but search API blocked — documented); all imageless albums belong to the dead share; POST /Items/{id} metadata lives in the DB so it works despite the dead share.
- agent-browser e2e: Agent view renders new Server column, write buttons, batch button, per-share health rows, re-probe button, settings presets + write-back control; preset 30 min + writeBack=auto clicked and persisted via API; zero page errors / zero console errors. tsc src clean; eslint clean.
- README: write-back section (table of kinds, modes, remount caveat), health per-share + recovery, settings presets, new endpoints, known limitations updated.
- Left configured: writeBack=auto (user asked for server write-back), scanInterval=30 min.

Stage Summary:
- The agent now writes scraped bios/metadata/lyrics/artwork back INTO Jellyfin (fill-if-missing, tracked, retryable) — proven end-to-end against the live server.
- NAS share recovery is first-class: per-share readability, recovery detection, re-probe button; score recovers on the next check after remount.
- Scan frequency/batch size tunable via number fields AND presets; changes take effect within ~30 s.

---
Task ID: 7
Agent: main (Super Z)
Task: (a) NAS remount re-probe + health score verification, (b) Fanart.tv artist-photo source with API key, (c) internet bio + discography on artist pages

Work Log:
- Re-probe after remount: ran health checks — /mnt/nas_share RECOVERED (tracks stream 200 via proxy; verified against real Jellyfin, not just the sampler). /mnt1/unraid_share still unmounted server-side (404 both direct API-key probe and proxy; ~94% of tracks live there), so the score holds at 59-67 until that host-side remount happens. With unraid back the media check passes and the score computes to ~92 (matches the user's ~90+ expectation). Per-share breakdown + "Re-probe after remount" button (Task 6) surface all of this in the dashboard.
- Fanart.tv source (new src/lib/agent/sources/fanart.ts): artistthumb/artistbackground (likes-ranked) keyed by MusicBrainz MBID; API key resolved from AgentConfig.fanartApiKey (new SQLite column) -> FANARTTV_API_KEY env -> empty. fanartProbe() for health ("ok" | "bad-key" | "no-key" | "down"). Network path verified live: endpoint reachable, 401 without key as documented.
- Wiring: scan job artist-photo chain = fanart -> deezer -> wikipedia thumbnail (new last-resort fallback reading bio payload); enrichment route live artist-artwork lookup got the same chain; health check probes fanart and appends key state to "Internet sources" detail (7/7 reachable — Fanart.tv: no API key...); dashboard Settings gained "Fanart.tv (artist photos)" toggle (auto-rendered from sources) + API-key TextField (adjust-during-render pattern) + explainer.
- Internet bio: artist-detail now ALWAYS fetches the agent's Wikipedia bio (not only when the Jellyfin overview is empty) and renders both attributed sections ("From your Jellyfin library" + "Biography via Wikipedia · Library Agent"); expand/collapse kept; default template only when both absent.
- Internet discography: new GET /api/agent/discography/[artistId] — MusicBrainz release-groups (mbArtistReleaseGroups browse, 1 req/s limiter, newest first) cached in AgentFinding kind="discography"; in-library diff recomputed LIVE each request against the artist's Jellyfin albums (normalized-title match) so library changes reflect instantly; sorted albums -> EPs -> singles. agent-client.getAgentDiscography() + artist-detail "From the internet" section (count badge, "N matched your library" note, rows with year/title/type/secondary-types/"not in library" badge, links to musicbrainz.org).
- Verified LIVE: Nelly Furtado -> MBID resolved, 100 release-groups, 4 matched ("7", "The Ride", "The Spirit Indestructible", "Folklore"), 96 not-in-library listed albums-first; bio renders; agent settings fields render; scan + auto write-back still work (metadata "Is Your Love Big Enough?" -> year/genres written to Jellyfin); health check shows fanart key state.
- Debugging detour (resolved): app initially seemed non-interactive — caused by reading only the first 300 chars of body.innerText (sidebar with 771 server playlists dominates it); scoped checks to [data-testid=main-content] and everything worked; temporary probes in router-store removed afterwards. No real defect.
- Ops: sandbox reaps user-spawned dev servers every ~60s; added scripts/ensure-dev.sh (respawn + readiness wait, used per verification round) and scripts/dev-watchdog.sh (best-effort keep-alive). jf-server SWR cache now bounded (trimCache: expired eviction + 400-entry cap) — health had warned at 1.2 GB RSS.
- tsc: 0 errors in src/ (7120 pre-existing in feishin-ref/ + examples/); eslint clean on all touched files; browser e2e: artist page + agent dashboard verified, 0 console errors, screenshots in download/.

Stage Summary:
- Artist pages now combine library + internet: Wikipedia bio alongside the Jellyfin overview, and a MusicBrainz "From the internet" discography of releases not in the library.
- Fanart.tv integrated as the first-choice artist-photo source with first-class API-key management (Settings field + env var + health-check key state); works the moment the user pastes their free personal key.
- Health check verified the nas_share remount recovery; unraid_share still awaits a host-side remount (score recovers to ~92 automatically on the next check once done).

---
Task ID: 8
Agent: main (Super Z)
Task: Paste the user's Fanart.tv API key into .env and verify it end-to-end (artist photos + health probe)

Work Log:
- Pasted the user-provided Fanart.tv key into /home/z/my-project/.env as FANARTTV_API_KEY (alongside DATABASE_URL).
- Security: discovered .env was TRACKED in git (committed before the .env* ignore rule existed; content at HEAD = DATABASE_URL only, no secrets). Ran git rm --cached .env so the file stays on disk but can never be pushed; the key therefore never enters git history (verified: git show HEAD:.env has no key).
- Restarted the dev server so Next.js loads the new env var (bun run dev, port 3000 healthy).
- Key validation: direct curl to webservice.fanart.tv/v3/music/<coldplay-mbid> -> HTTP 200 with data; assets.fanart.tv image fetch -> HTTP 200 (925 KB, 2.1s) so the fanart CDN is NOT blocked on this network (unlike Deezer's Akamai CDN).
- Health re-probe (POST /api/agent/run {"job":"health"}): "Internet sources: 7/7 reachable - Fanart.tv: API key working". GET /api/agent/health serves the latest stored snapshot (does not re-run); scheduler re-checks every 5 min; a health run is recorded status="failed" BY DESIGN when the verdict is critical (error: null confirms no crash).
- Live artist-photo test: GET /api/agent/enrichment/<coldplay-id>?kind=artwork&itemType=artist&name=Coldplay&fetch=1 -> status=found, source=fanart, 1000x1000 via assets.fanart.tv. Niche artists ((G)I-DLE, $uicideboy$) return null = legit no-coverage; deezer->wikipedia-thumbnail fallback chain handles them.
- UI pipeline confirmed: all item images route through jfImageUrl -> /api/jf-img/<id>; on upstream miss tryAgentArtwork() serves the agent's fanart finding (X-Agent-Artwork header) with disk cache; Coldplay artist id served 200 image/jpeg via proxy.
- Internet bio + discography re-verified live: Coldplay discography = 100 releases (6 library + 94 internet-only via MusicBrainz); bio path unchanged from Task 7.
- Investigated dev.log "[agent] health (schedule) -> failed in 24s": benign - that's the critical-verdict recording, not a crash; score is 67 only because /mnt1/unraid_share is still unmounted on the Jellyfin server host (host-side action; score auto-recovers to ~92 on the next 5-min check).
- False alarm resolved: the enrichment route's summary line looked corrupted ("eta.year") in tool output - display pipeline strips "[m" sequences (ANSI-escape-like); codepoint dump + balanced-bracket check prove the file was always correct ("[meta.year"). No code change made or needed this session.

Stage Summary:
- Fanart.tv API key is live from .env: health probe reports "API key working"; Coldplay artist photo fetched source=fanart (1000x1000) and served through the jf-img proxy pipeline.
- .env untracked from git (key can never be pushed; history verified clean).
- Health score holds at 67 solely due to the unmounted /mnt1/unraid_share on the server host; recovers to ~92 automatically on the next 5-min check after the user remounts it.

---
Task ID: 9
Agent: main (Super Z)
Task: Add a professional Hi-Fi studio sound system to the media player

Work Log:
- DSP engine (src/lib/audio/hifi-engine.ts): Web Audio singleton — MediaElementSource → preamp → 10-band peaking EQ (ISO octaves 31 Hz…16 kHz, Q 1.41) → bs2b-flavored crossfeed (0.3 ms delayed lowpassed opposite channel + direct-gain dip) → mid/side stereo width matrix → balance (StereoPanner) → dynamics compressor + static makeup estimate → loudness-norm gain → master → destination; analysers tapped post-chain (spectrum 2048 + per-channel L/R meters); bit-perfect bypass path with click-free 15 ms crossfades; mono upmix forced before splitting stages; MediaElementSource cached in WeakMap (re-mount safe); context resumed on play + panel open.
- Loudness normalization: 450 ms RMS loop toward ~-19 dBFS, gain clamped 0.2-5, smoothed 0.6 s.
- Store (src/store/hifi-store.ts): zustand+persist "feishin-hifi" — enabled, preamp, eqGains[10], preset id, crossfeed, stereoWidth, balance, dynamics (off/reference/night/club/custom), loudnessNorm, miniViz + non-persisted UI store for panel open state; engine subscribes and applies all params with setTargetAtTime ramps.
- Presets (src/lib/audio/eq-presets.ts): 13 studio EQ presets (Flat, Studio Reference, Acoustic, Bass Boost/Reduce, Classical, Dance, Electronic, Hip-Hop, Jazz, Pop, Rock, Vocal Boost).
- UI: hifi-visualizer.tsx (canvas log-frequency spectrum with dBFS grid + peak-hold + L/R 28-segment meters, panel + mini variants, dpr-aware); hifi-panel.tsx (right Sheet: processing pill, output readout cards, visualizer, preamp, EQ with vertical sliders + preset dropdown, imaging, dynamics chips + custom sliders, reset, mini-viz toggle); player bar gained waveform button + optional mini spectrum; settings Playback gained "Hi-Fi Studio sound system" row (Open studio + master switch).
- Wired: audio-engine attaches engine to the stable <audio> node once; panel mounted once in feishin-app; HifiPanel reads useHifiUi.
- Verified e2e (agent-browser, real playback of Nelly Furtado via Jellyfin): engine Running 44.1 kHz / 23 ms / 2 ch; EQ band live 0→+2.0 dB; Rock preset fills all 10 bands exactly; Night chip selects; bypass A/B — audio flows through BOTH paths (t advanced 156→165.9 bypassed, →167.6 re-enabled); track auto-advanced through the chain; spectrum + L/R meters animate with music; mini viz live in player bar; settings "Open studio" opens the panel; 0 console errors, 0 page errors; screenshots in download/hifi-e2e-*.png.
- Fixed during verify: Float32Array<ArrayBuffer> generics (TS 5.9); flex-shrink collapsed the canvas container to 0 height → shrink-0.
- tsc: 0 errors in src/; eslint 0 errors on touched files.

Stage Summary:
- The player now has a real studio signal chain: preamp, 10-band graphic EQ with 13 presets, headphone crossfeed, M/S stereo width, balance, 4-mode dynamics compressor, loudness normalization, bit-perfect bypass, spectrum analyzer + peak meters (panel) and an optional mini visualizer in the player bar. All settings persist and apply live without interruption to playback.

---
Task ID: 10
Agent: main (Super Z)
Task: Agent-driven Auto-EQ — the cloud agent analyzes the playing track/album and adjusts the Hi-Fi sound output automatically

Work Log:
- Analyzer (src/lib/agent/sound-profile.ts): "Auto-EQ brain" — collects genre/mood tags from 3 layers (Jellyfin library genres w=1.0, Deezer album genres w=0.8, MusicBrainz artist tags w=0.6, all honoring the agent's source switches) and blends them through a studio knowledge base of 13 genre-class signatures (electronic, hip-hop, rock, metal, pop, soul, jazz, classical, acoustic, ambient, blues, world, vocal) each defining 10-band EQ gains + crossfeed + stereo width + dynamics mode + loudness-norm vote. Weighted blend of matched classes, then tag accents (bass/808 → sub lift, lo-fi/vinyl → tamed highs, bright → air, vocal → presence, live → width) and a pre-1995 old-master heuristic that enables loudness normalization. Produces an explainable AgentSoundProfile: gains, preamp, crossfeed, width, dynamics params, norm flag, confidence 0–1, matched tags w/ sources, and a plain-English rationale. Deterministic and clamped (±12 dB, 0.25 steps).
- API: GET /api/agent/sound-profile/[itemId]?itemType=track|album&name&artist&album&genres&year&duration[&refresh=1] — cached in AgentFinding kind="sound" (@@unique itemId+kind reused). Robustness: a profile with a matched class caches as status="found" (permanent); an inconclusive/neutral one stores status="pending" and retries after a 90 s cooldown (a transient MusicBrainz rate-limit no longer poisons the cache). Junk tags ("0", numeric, 1-char) filtered.
- Client: agent-client.getAgentSoundProfile(); hifi-store gained autoEq (persisted, default ON), autoEqScope (track|album, persisted, default album), runtime agentProfile/agentOverridden/agentStatus + applyAgentProfile (sets EQ curve custom, preamp, crossfeed, width, dynamics, norm; balance deliberately untouched) + clearAgentProfile; every manual DSP setter now flags agentOverridden when a profile is active; persistence narrowed via partialize (agent runtime state is session-local). DSP engine applies everything live with its existing smoothing ramps — no playback interruption.
- Controller (player/hifi/agent-auto-eq.tsx, mounted next to every AudioEngine): on current-track change (1.2 s debounce) asks the agent for the profile under the current scope (album scope reuses the album profile for all its tracks; itemId falls back to track when no albumId), guards against track races + autoEq toggled off mid-flight, applies via store; reanalyzeCurrentProfile() powers the panel's Re-analyze button (refresh=1 + toast).
- UI: Hi-Fi panel gained an "Agent Auto-EQ" section (master switch, Track/Album scope chips, profile card with name + confidence %, tag chips w/ source, rationale, Re-analyze/Clear buttons, "Manual override active" notice, analyzing/idle/error states); player-bar Hi-Fi button shows a primary dot while an agent profile is actively tuning (hidden on manual override).
- tsc: 0 errors in src/; eslint 0 errors on all touched files.

Verification (agent-browser, real playback via Jellyfin):
- API ground truth: Kendrick Lamar "Savior" (Rap) → Agent · Hip-Hop 97% (library rap + MB alternative/conscious hip-hop); Asia "One Step Closer" (Progressive Rock, 1982) → Agent · Rock + pre-1995 norm heuristic; "Waitlist" (Electro/Dance/Disco) → blended Agent · Electronic with club dynamics 4:1; NPR podcast (Podcast) → Agent · Vocal Focus with night 6:1; cache-hit on repeat call; album-scope analysis works (Mr. Morale album id).
- Resilience proof: first analysis of Yes' album hit an MB rate limit and cached Neutral; after the retry fix, same item re-analyzed to Agent · Rock 80% (art rock/classic rock/disco via musicbrainz).
- Browser E2E with real streaming (unraid_share files 404 upstream as known; used nas_share tracks): played Yes "Long Distance Runaround" (junk library genre "0" — agent rescued via MB artist tags) → profile card "Agent · Rock 80%", EQ sliders moved to the blended curve [2.75, 2.5, 1.75, 1, …], preset custom. Reload with "The Naked Scientists" (Speech) current → controller auto-applied "Agent · Vocal Focus 72%" (night dynamics −28 dB/6:1, norm on, crossfeed 10%). Mid-session Previous-track switch flipped every DSP param back to the Rock curve with no playback interruption (audio t advancing 12.6→14.6 s). Manual preamp nudge → agent dot hides + "Manual override active" badge shows; agent reapplies on next scope change. 0 console errors, 0 page errors. Screenshots: download/hifi-agent-1-panel.png … hifi-agent-4-override.png.

Stage Summary:
- The player now listens back: the Library Agent analyzes each track or album (library genres + Deezer + MusicBrainz), distills a genre-signature into a full Hi-Fi DSP profile and applies it live — with confidence, matched tags and a human-readable rationale in the Hi-Fi Studio panel. Auto-EQ is on by default, scoped per album (switchable per track), robust to rate-limited sources (pending-retry cache), and always yields to manual control while re-engaging on the next item.

---
Task ID: 11
Agent: main (Super Z)
Task: README refresh (Hi-Fi Studio + Agent Auto-EQ) + finish the metadata write-back task (batch kind filter + live backlog sync)

Work Log:
- Write-back audit: found the batch (applyBatchToJellyfin) selected ALL found/not-synced findings, including "sound" (Auto-EQ profiles) and "discography" kinds that have no Jellyfin writer — 11 of 25 batch slots were wasted per run and counted as "failed". Also the dashboard showed "write" buttons on those rows (click -> "no writer" toast).
- New src/lib/agent/writable-kinds.ts: shared WRITABLE_KINDS = [bio, artwork, metadata, lyrics] + isWritableKind(), imported by both server (writeback.ts) and client (agent.tsx) so they can never drift.
- writeback.ts: batch query now filters kind to WRITABLE_KINDS (still overridable via body kind); single-apply returns an honest "in-app knowledge only — not written to Jellyfin" for non-writable kinds.
- agent.tsx: write buttons gated by isWritableKind(); KIND_META gained sound ("Auto-EQ profile", Waves icon) and discography ("Discography", Disc3 icon) — they also appear as filter chips now.
- LIVE batch run against the real Jellyfin server (limit 100, ~6.5 min): bios 38->76 synced, metadata 5->10 synced, lyrics 1->5 synced, artwork +1 synced; remaining artwork failures are ALL the unmounted /mnt1/unraid_share (HTTP 500, retried automatically after remount); sound/discography findings left untouched (serverStatus none) — zero "no writer" failures.
- README.md refresh: new "Hi-Fi Studio sound system" section (signal chain diagram, stage table, presets, spectrum/meters, bypass) + "Agent Auto-EQ" subsection (tag layers/weights, 13 genre signatures, accents, pre-1995 heuristic, confidence/rationale, scope, manual override, endpoint + pending-retry cache); Features gained Hi-Fi + Auto-EQ bullets; architecture tree gained lib/audio/, agent writeback/sound-profile, hifi store/panel; REST endpoints list gained /api/agent/sound-profile/[itemId] and /api/agent/discography/[artistId] + batch body; Known limitations gained "Auto-EQ is stylistic, not room correction".
- MultiEdit partial-application gotcha: the editor applied earlier edits of a failed batch (non-atomic in practice), duplicating two feature bullets and the whole Hi-Fi section; repaired precisely with scripts/fix-readme.py (assertions + dedupe), verified 1 copy of each.
- tsc: 0 errors in src/; eslint clean on touched files.

Stage Summary:
- Write-back batch is now precise (only server-writable kinds), the dashboard only offers write where it works, and the entire writable backlog is ON the Jellyfin server (76 artist bios, 10 year/genre writes, 5 lyrics, 2 artwork) — artwork for the dead share self-heals after remount. README now documents the full player incl. the studio DSP and agent-driven Auto-EQ.

---
Task ID: 12
Agent: main (Super Z)
Task: Re-verify flaky jf-audio universal-mode 404s, move hardcoded Jellyfin creds to .env, add Dockerfile for desktop install

Work Log:
- jf-audio re-verification: random-sample repro showed BOTH modes failing (default 404 "Error processing request.", universal 500) for tracks on ANY share — including nas_share which streamed fine in earlier sessions. Decisive evidence: a DIRECT upstream curl (bypassing all proxy code) fails identically, and the agent health snapshot reports "Media files: 0/8 sampled tracks streamable — shares offline" (score 67 -> 59, image pipeline 404 too). Conclusion: NOT a proxy bug — both NAS shares (/mnt/nas_share AND /mnt1/unraid_share) are currently unmounted on the Jellyfin server host; the proxy faithfully passes upstream failures through and self-heals after remount. The audio route now returns an actionable error body ("file missing or its media share is unmounted on the server" / "server could not read/transcode the source") with the upstream detail attached.
- Credentials moved to .env (verified zero occurrences of url/username/password/api-key in src/): jf-server.ts DEFAULT_CONN is env-only now (empty strings when unset -> proxy reports unconfigured); .env gained JELLYFIN_URL/USERNAME/PASSWORD/API_KEY (untracked, stays local); committed .env.example template (no secrets).
- Client default-server flow rewritten without any hardcoded server: auth-store starts with servers:[] and gained seedServer() (id srv-default, url/username/name from the proxy); feishin-app useServerConnection probes POST /api/jf/__ready once when no server is selected and seeds from the response (url/username/serverName live server-side), showing the connecting screen instead of flashing the login view; unconfigured deployments land on the Add-server login screen as before.
- Debugging gotcha fixed en route: fresh-profile boot crashed with "Application error" (blank) — added a temporary global-error.tsx to surface it: ReferenceError seedPending (FeishinApp destructured only {currentServer,status}). After the one-line fix, kept a permanent styled global-error boundary (dark shell, error message + digest, Retry).
- E2E (agent-browser, FRESH localStorage): clear storage -> reload -> auto-seed probe -> connected to desalyn -> full app shell renders, feishin-auth persisted with srv-default; zero page errors, zero console errors. With pre-existing localStorage the old behavior is unchanged.
- Docker: multi-stage Dockerfile (oven/bun:1; deps with frozen bun.lock -> prisma generate + bun run build -> runner copies .next/standalone + full node_modules for first-boot `bunx prisma db push --skip-generate`; ENV HOSTNAME/PORT/DATABASE_URL=file:/app/db/custom.db; VOLUME /app/db + /app/.cache), .dockerignore (excludes .env/secrets, node_modules, .next, .git, db, .cache, feishin-ref, logs, local tooling), docker-compose.yml (ports 3000, env_file .env, DATABASE_URL pinned to container path, named volumes feishin-db/feishin-cache, restart unless-stopped).
- Validation without docker in sandbox: ran the exact build-stage commands locally — prisma generate OK; NEXT_TELEMETRY_DISABLED=1 bun run build OK (all routes compiled, standalone assembled incl. static+public); then ran the standalone server with env-only config: home 200, /api/jf/__ready authenticated, agent booted (instrumentation works in standalone), health 200, audio proxy error-hint body confirmed.
- README: Configuration table now includes DATABASE_URL + FANARTTV_API_KEY and links .env.example; new "Running with Docker (desktop / NAS)" section (compose + plain docker commands, volumes explained).
- tsc: 0 errors in src/; eslint 0 errors on touched files (1 pre-existing unused-disable left untouched).

Stage Summary:
- The flaky audio 404/500s are fully explained (both NAS shares offline server-side; proxy is correct and now says so in its errors) — they vanish once the shares are remounted. Credentials are no longer in source: .env (git-ignored) is the single source, with .env.example as template, and fresh browsers auto-discover the server from the proxy. A docker compose up -d --build now installs the player on any desktop/NAS with persistent agent DB + artwork cache.

---
Task ID: 12b (hotfix)
Agent: main (Super Z)
Task: Desktop install failed — user's clone had no .env.example ("Cannot find path .env.example")

Work Log:
- Root cause: .gitignore rule `.env*` swallowed `.env.example`; the `git add` in Task 12 silently skipped it, so commit 062cb24 shipped Dockerfile/.dockerignore/docker-compose.yml but NOT the env template the README tells users to copy.
- Fix: added `!.env.example` negation to .gitignore; verified `git check-ignore .env` still ignores the real .env; staged, committed (f6f6cda), pushed to origin/main; `git ls-tree origin/main` now shows .env.example.

Stage Summary:
- Users can now `git pull` and `copy .env.example .env` as documented. Lesson: after commits that "should" include a dotfile, verify with git ls-tree — gitignore negation or -f is required for any .env* template file.

---
Task ID: 12c (deployment confirmed)
Agent: main (Super Z)
Task: User desktop install via Docker

Work Log:
- User confirmed "Everything works perfectly" — Docker deployment on Windows (jwfrancois/feishin clone, .env with Jellyfin creds, compose port remap) is live and connected to the real server.

Stage Summary:
- Project fully delivered end-to-end: app + agent + Hi-Fi studio + Docker packaging, running on the user's desktop against their Jellyfin server.

---
Task ID: 13
Agent: main (Super Z)
Task: More agent superpowers (library audit + release radar) and 8 new studio EQ presets

Work Log:
- EQ: 8 new studio presets in eq-presets.ts (13 -> 21): Harman Target, Late Night, Metal, Podcast/Speech, Lo-Fi Vintage, Tube Warmth, Car Stereo, Cinema — each with a reasoned 10-band curve; panel/store render them automatically (EQ_PRESETS is mapped directly).
- New agent job "audit" (jobs/audit.ts): rolling-window QC sweep — pages of 500 songs in SortName order, 6 pages/run (~3k songs) with 120-song boundary overlap; detects duplicate titles (normalized title+album-artist groups) and low-bitrate sources (<176 kbps), worst first; window-local stale pruning so lists self-correct as the cursor wraps. Cursor persisted as AgentConfig.auditCursor (schema + db push, Prisma client regenerated).
- New agent job "releases" (jobs/releases.ts): release radar — 6 random artists/run, MusicBrainz release-groups (Album/EP, no live/compilation/DJ-mix) filtered to the last 24 months, diffed against per-artist library album titles (one small query per artist); flags missing releases as findings anchored to the artist, auto-clears when the album lands in the library.
- Collaboration-credit matching: "A & B / A feat. B / A vs B / A, B" artist names reduce to the primary artist when the full name has no MB match (library is full of these; first run went 6/6 unmatched -> 2/6 unmatched, rest are genuinely obscure).
- Scheduler: JobId union gained audit|releases; audit hourly (rolling drips), releases 12h; run route accepts all four jobs; status route exposes lastAuditRun/lastReleasesRun + running flags; run bookkeeping/Activity feed work unchanged.
- Dashboard: KIND_META gained dupes (Copy icon), quality (Gauge), releases (Rocket); SOURCE_LABELS gained jellyfin="Your library"; header gained Audit + Releases buttons; trigger() label map; AgentStatus interface extended.
- Scale discovery + redesign: the server hosts 119,430 songs (7,031 albums) — the original full-walk audit ran >4 min/page batches and would take hours, so it became the rolling window (3.7 min per hourly run, verified live). The releases job's initial full-library album snapshot was replaced with per-artist queries for the same reason.
- Live verification against the real server: audit window 1 covered songs 0-3,500 — 230 duplicate titles found (cap 60 findings/run; "3 copies — DÁKITI by Bad Bunny", "3 copies — Dynamite by BTS"); releases run matched 4/6 artists with 0 missing recent albums (library up to date there). Orphaned "running" rows from interrupted deploys are now marked cancelled on restart (one-time cleanup via script).
- tsc: 0 errors in src/; eslint clean on all touched files.

Stage Summary:
- The agent now does five jobs: enrichment, write-back, health, quality-control audit (dupes + low-bitrate), and a release radar for new music. 21 studio EQ presets ship in the Hi-Fi panel. Everything verified live against the 119k-song library.

---
Task ID: 13-b
Agent: main (Super Z)
Task: Per-genre Auto-EQ presets mapped to the new curves + "most-played artists" monthly digest

Work Log:
- EQ presets 21 -> 29 (eq-presets.ts): new curves EDM Festival, Jazz Club, Bass Shaper, Small Speakers, Reggae & Dub, R&B / Soul, Ambient & Chill, Blues & Roots; added EqPresetGroup ("genre" | "studio" | "environment") + EQ_PRESET_GROUPS export; every preset tagged with a group. Four of the new presets (blues/chill/randb/reggae) exactly mirror the Auto-EQ genre-class curves that previously had no preset twin.
- Auto-EQ genre knowledge base (sound-profile.ts): ClassSignature gained presetId; all 15 classes mapped to studio presets (soul->randb, ambient->chill, blues->blues, world->reggae, new edm->edm, new jazzclub->jazzclub; metal intentionally null = agent's own low-mid-cleanup variant). New classes: "edm" (EDM & Festival; keys edm/big room/mainstage/festival/future bass/hardstyle/electro house/progressive house/bass house/psytrance, placed before electronic) and "jazzclub" (Jazz Club; vocal jazz/smooth jazz/lounge/cool jazz/cabaret/swing revival moved out of the jazz class, placed before jazz).
- Profile carries presetId/presetName (types.ts optional fields — backward compatible with cached v1 profiles); rationale now states "built on the <name> studio preset".
- Hi-Fi panel: preset dropdown grouped with labels (Genre curves / Studio targets / Environment & speakers, scrollable); Agent Auto-EQ card shows a clickable "mapped preset" chip (SlidersHorizontal) that snaps the EQ to the exact preset gains (flags manual override as designed).
- Monthly digest backend: Prisma model PlaySnapshot (batch timestamp shared by all rows of one run; artist-level aggregation: artistKey normalized via audit's norm(), artistName, artistId, playCount, trackCount; indexes on takenAt/artistKey) + db push. New job jobs/digest.ts: runDigestSnapshot() pages Jellyfin /Items sorted by PlayCount desc (fields must include UserData — the server stores counts in UserData.PlayCount and the sort only engages when the field is requested; top-level PlayCount is always null on 10.11), aggregates per artist, skips artist-less radio items, replaces today's batch (deleteMany >= startOfToday + createMany). computeMonthlyDigest() diffs newest batch vs oldest batch in month-to-date window (fallback trailing 30 days; <2 batches => honest "collecting" state with snapshotDays + reason).
- GOTCHA fixed: Prisma groupBy on takenAt did not honor orderBy desc — batch times are now sorted in JS (a swapped order produced inverted deltas/empty list; caught in verification round 1).
- Digest wired end to end: scheduler JobId + digest (24h interval) + runJobNow branch; /api/agent/run accepts "digest"; status route exposes lastDigestRun + running.digest; new /api/agent/digest route (GET digest + POST snapshot trigger, background job like the others).
- Dashboard: 5th tab "digest" (after health) with Monthly listening digest header card (window label, days, total plays, baseline->latest dates, tracked artists, Snapshot now button, running pill), collecting state (Building your listening baseline + explanation + CTA), ready state (ranked top-25 artists: rank, name click-through to the artist page via router-store, "new" pill, delta bar scaled to leader, +delta and all-time counts), how-it-works footer. Header gained a Digest trigger button; status poll interval tightens to 3s while a snapshot runs.
- Verification (live against the real Jellyfin): real snapshot stored 52 artists (Gracie Abrams 16, Madonna 13, Brent Faiyaz 10, Nelly Furtado 9, Willie Nelson 9...); with a seeded 3-day baseline the digest returned status ready, days 3, correct baseline<latest ordering, positive deltas ranked (Nelly Furtado +4, Willie Nelson +4, Santana +4...) and test rows were fully cleaned afterwards (sandbox back to 1 real batch). Sound-profile probes: jazz+vocal jazz -> Jazz preset, edm+electro house -> EDM Festival, reggae+dub -> Reggae & Dub (world class), metal -> no chip (agent variant) — all ~76% confidence with library+Deezer+MusicBrainz tags.
- Browser e2e (agent-browser): digest tab renders collecting + ready states; artist click-through opens the artist page (Wikipedia bio + discography render); Hi-Fi panel shows the grouped preset catalog (29 unique preset ids verified) and a live-played track produced "Agent · Electronic 84%" with the clickable "Electronic" mapped-preset chip; spectrum analyzer + meters animate during playback; zero console errors.
- Sandbox lessons: tool-spawned background servers (nohup/setsid) are reaped between calls — server-dependent verification must run inside single tool calls (scripts/verify-digest*.sh); Prisma stores DateTime as epoch-ms INTEGER in SQLite (text cutoff comparisons silently match everything — use integer millis).
- tsc: 0 errors in src/; eslint: 0 errors (14 pre-existing warnings).

Stage Summary:
- Auto-EQ is now preset-mapped end to end: 29 grouped studio presets, 15 genre signatures each naming the preset its curve is built on, chip in the profile card that snaps to exact gains.
- The agent's sixth duty shipped: a daily play-count snapshot powering a monthly "most-played artists" digest tab (month-to-date with trailing-30-day fallback, honest baseline state, artist click-through, nothing written back to Jellyfin).

---
Task ID: 14
Agent: main (Super Z)
Task: Integrate Jellyfin podcasts into the music player (browse shows, episode lists, playback, resume, played state, search)

Work Log:
- Probed the live server: dedicated "Podcasts" library exists (id 608e1ed1..., CollectionType "music", /mnt/nas_share/Media/assets) with 60 MusicAlbum show entities + 70,626 Audio episodes; episodes carry Album=<show>, Artists (e.g. "BBC Radio"), PremiereDate, UserData.Played/PlaybackPositionTicks; IndexNumber null.
- jf-server.ts: ConnState/loadServerMeta now also discover podcastLibraryId (music collection named /podcast/i); getConnectionState/configureConnection expose/reset it. New path alias "podcasts/Items" -> Items scoped to the podcast library (parentId set BEFORE the music-library injection — first implementation set it after and the injection won, returning 7,031 music albums; caught in live verification round 1). New "played/{id}" alias (POST -> Users/{uid}/PlayedItems/{id}, DELETE unmarks), symmetric with favorite/.
- api/jf/[...path]/route.ts: POST/DELETE now invalidate "Items"/"item/" caches when the mutated path is played|favorite/* (narrow guard so per-10s scrobble POSTs never nuke the cache) — without this the UI read stale played state for up to 5 min.
- types.ts: Podcast interface (episodeCount, addedAt, latestAt, latestEpisode, overview, likes...); Song gained resumeAt/played/publishedAt/isPodcast.
- jellyfin.ts: mapPodcast; mapSong maps resumeAt (PlaybackPositionTicks/1e7), played, publishedAt (PremiereDate ?? DateCreated). Fetchers: fetchPodcastsPage (shows + newest-240-episodes query merged per AlbumId -> latestAt/latestEpisode, no N+1), fetchPodcast (item/{id}), fetchPodcastEpisodes (paged, NON-recursive — recursive under a show parent took 17-57s and Overview/AlbumArtists fields pushed a 5,000-item query past 120s; non-recursive limit 100 = ~5s, episodes are direct children), fetchResumableEpisodes (filters=IsResumable), fetchRecentEpisodes, markPlayed. searchAll gained a podcasts section (podcasts/Items MusicAlbum, tolerant .catch).
- player-store: pendingResume {id, at} + armResume/clearResume; persisted resumePositions map + setResume (<=0 clears). AudioEngine: onTimeUpdate/onPause persist positions (15s < t < duration-10); onEnded clears; onLoadedMetadata consumes pendingResume once (id-guarded, clamped) -> jumps to the position before playback.
- views/podcasts.tsx (new, ~670 lines): PodcastsView (Continue listening + New episodes ScrollCarousels of EpisodeCards with progress underlines; show grid of PodcastCards mirroring AlbumCard with episode counts + "updated N ago"; search filter; sorts name/recentlyUpdated/recentlyAdded/episodes/random, client-side). PodcastDetailView (hero with dominant-color gradient, episode count + total runtime + genre/year, Play/Resume/Latest, favorite heart; episode list: server-paginated 100/page with accumulate+dedupe, newest/oldest toggle, per-row play/pause, cover, date + duration + playcount, resume progress bar, "X min left", played check, kebab: play/play next/add to queue/mark played-unplayed). playEpisodes() arms resume from the local map first. EpisodeCard falls back to blank when episodes have no album/artist metadata.
- Resume persistence quirk: Jellyfin 10.11 accepted Sessions/Playing/Progress+Stopped (200, session PositionTicks updated) but never committed PlaybackPositionTicks to UserData for these podcast items — solution: player-store resumePositions (localStorage) is the primary resume source, merged with server resumeAt; Continue listening merges server IsResumable + locally-resumable recent episodes; mark-played also drops the local resume.
- Wiring: router-store Route + "podcasts"/"podcast"; feishin-app MainContent cases; sidebar LIBRARY_ITEMS (lucide Podcast icon) + isActiveRoute pairing; song-actions goToAlbum(albumId, isPodcast) routes podcast episodes to the podcast page (player bar, context menu "Go to podcast"); now-playing album link podcast-aware; search.tsx gained a Podcasts tab + results section (PodcastCard exported from podcasts view).
- Verification (live): 60 shows via alias; episodes 2,780 with correct sort; played roundtrip POST->True->DELETE->False with fresh reads; music-library regression intact (7,031 albums via plain Items); browser e2e — sidebar item, show grid, detail hero ("2,780 episodes · 363h 26m total · Podcast · 2018"), play latest -> title "(1 / 20) Children in warzones — BBC Radio", seek advanced, pause -> resumePositions persisted (31.76s), Continue listening card appeared, clicking it resumed at the persisted position (31.76 -> 34.2 on play), zero console errors.
- .env was wiped by the sandbox rebuild (untracked file); restored from session knowledge (JELLYFIN_*, FANARTTV_API_KEY). tsc: 0 errors in src/; eslint: 0 errors.

Stage Summary:
- Podcasts are a first-class library section now: 60 shows / 70k episodes browse smoothly (paged queries tuned around the server's slow recursive scans), episodes play through the existing engine with play-count reporting, resume works across reloads via a local position map merged with server state, played state round-trips to Jellyfin, and shows surface in global search. Nothing was written back beyond standard playback reports and played flags.

---
Task ID: 15
Agent: main (Super Z)
Task: Fix "Jellyfin: 502" runtime crash on the Podcasts page (user-reported error overlay)

Work Log:
- Diagnosed the reported crash (`Jellyfin: 502 at jf jellyfin.ts:25 <- fetchPodcastsPage:439 <- use-jf.ts:23`): the client `jf()` helper threw when the /api/jf proxy returned 502 (upstream Jellyfin slow/hiccuping — recursive podcast queries over 70k episodes take 15-57s under load), and `useJfQuery.startFetch` re-threw that error from a fire-and-forget promise — an unhandled promise rejection, which Next.js surfaces as a full-screen Runtime Error overlay. Bare "502" message (no detail) = the browser got a non-JSON 502 body (gateway), so `res.json()` failed and only the status code surfaced.
- use-jf.ts: startFetch no longer re-throws — errors are stored in the cache entry (surfaced via the hook's existing `error` field) and listeners are notified; fire-and-forget callers (effect, stale revalidate, refetch) can never produce unhandled rejections. This is the fix for the crash class, not just this instance.
- views/podcasts.tsx: new recoverable error panel (message + Retry button) shown when the shows query fails with no cached data; the misleading "No podcasts found" empty state no longer appears on failures.
- jellyfin.ts fetchPodcastsPage: shows query is now NON-recursive first (recursive fallback only when the flat query returns 0 — nested folder layouts). Verified live: identical result set (60 shows), 3.5-6.9s vs 15s+ recursive; recursive enumeration of 70k episodes was the main latency/502 driver.
- jf-server.ts: (1) stale-on-error — when a background refresh fails, the last-known-good response is KEPT (marked `stale`, exempt from trimCache eviction) and served while every new request still retries upstream; previously the failed refresh deleted the good stale entry and the next request got a 502. (2) One quick retry (800ms) for retryable upstream failures (network/timeout/408/429/5xx) in the fresh-fetch path; 4xx not retried. (3) Guard: `podcasts/Items` with no discovered podcast library now returns an empty page instead of falling through to the music-library parentId injection (which silently served 7,031 music albums as podcasts on servers without a podcast library).
- eslint: kept the 3 pre-existing (unused-but-harmless) exhaustive-deps directives — running --fix removes them and exposes deeper react-hooks compiler errors (set-state-in-effect, preserve-manual-memoization) in pre-existing code; verified via stash test that HEAD lints with the same 0-errors/3-warnings state.
- Verification: tsc 0 errors in src/; eslint 0 errors (3 pre-existing warnings, same as HEAD); live — flat shows query 200/60 shows, warm cache hit fast, per-show episodes 200 in 1.5s (2,780 eps, correct sort), homepage 200. Initial 60s probe timeout was Turbopack on-demand recompile after edits, not a regression.

Stage Summary:
- The Podcasts page can no longer crash the app: upstream slowness now degrades to (a) stale last-known-good data when available, (b) a retryable error panel when not, and the queries themselves got 2-4x cheaper (non-recursive shows). Root cause of the user-visible "Jellyfin: 502" overlay is eliminated at three layers (client promise handling, server cache resilience, query cost).

---
Task ID: 16
Agent: main (Super Z)
Task: Document Docker installation on Ubuntu Server and Portainer

Work Log:
- Added docker-compose.portainer.yml: same service/volumes/ports as docker-compose.yml but NO env_file (Portainer repository stacks clone the repo without secrets) — JELLYFIN_* / FANARTTV_API_KEY are passed via stack environment variables through compose ${VAR:-} interpolation; empty strings are safe because jf-server treats unset/empty as "unconfigured" and the UI falls back to the in-app add-server login (__configure persists at runtime). YAML validated (service, 6 env entries, volumes).
- README: new "Deploying on Ubuntu Server" section (get.docker.com install, private-repo clone via token/SSH, cp .env.example .env, compose up --build, ufw allow 3000) and "Deploying with Portainer" section with two paths: A) CLI build + Portainer container management (recommended — updates stay git pull && compose up --build), B) fully Portainer-managed repository stack with the new compose file, including the update-rebuild caveat (delete + redeploy stack; named volumes persist).
- Noted the "ttp://" README link was a terminal display artifact, not a real typo — left the line untouched.

Stage Summary:
- Deployment story now covers desktop (Windows), Ubuntu Server, and Portainer (both management styles); portainer compose variant pushed so a repository stack can be deployed without ever committing secrets.
