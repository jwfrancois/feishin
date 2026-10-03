// Library Agent — library scan job (the "manager" duty).
// Works through the library in small, polite batches:
//   1. Resolves the pending-artwork queue (gaps the app noticed while serving images).
//   2. Alternates random batches of albums / artists, filling metadata gaps:
//      albums  -> missing artwork (Deezer → iTunes → MusicBrainz+CAA), missing year/genre/trackcount
//      artists -> missing bio (Wikipedia), missing photo (Deezer → Wikipedia thumb)
// Every scraped datum is upserted into AgentFinding so the app + proxy can use it.
import { db } from "@/lib/db";
import { jfJson, type JfFetchOptions } from "@/lib/jf-server";
import { ensureConfig, updateConfig } from "../config";
import { applyFindingToJellyfin } from "../writeback";
import { dzSearchAlbum, dzArtistPicture, bestDzCover, type DeezerAlbum } from "../sources/deezer";
import { itunesSearchAlbum, bestItunesArtwork, type ItunesAlbum } from "../sources/itunes";
import { mbSearchReleaseGroup, mbSearchArtist, caaFrontUrl } from "../sources/musicbrainz";
import { wikiArtistBio } from "../sources/wikipedia";

interface JfRawItem {
  Id: string;
  Name?: string;
  Type?: string;
  Genres?: string[];
  ProductionYear?: number;
  Overview?: string;
  ChildCount?: number;
  ImageTags?: { Primary?: string };
  AlbumArtists?: { Name: string; Id: string }[];
}

async function jfItems(path: string, params: Record<string, string>): Promise<JfRawItem[]> {
  const sp = new URLSearchParams(params);
  const data = (await jfJson(path, { params: sp } as JfFetchOptions)) as { Items?: JfRawItem[] };
  return data.Items ?? [];
}

export interface ScanResult {
  processed: number;
  enriched: number;
  missing: number;
  logLines: string[];
}

class RunLog {
  lines: string[] = [];
  add(s: string) {
    const ts = new Date().toISOString().slice(11, 19);
    this.lines.push(`[${ts}] ${s}`);
    if (this.lines.length > 120) this.lines.splice(0, this.lines.length - 120);
  }
}

// ---------------------------------------------------------------- artwork resolution

interface ArtworkHit {
  url: string;
  source: string;
  width: number;
  height: number;
}

async function resolveAlbumArtwork(name: string, artist: string, dz: DeezerAlbum | null, it: ItunesAlbum | null): Promise<ArtworkHit | null> {
  const cfg = await ensureConfig();
  if (dz) {
    const url = bestDzCover(dz);
    if (url) return { url, source: "deezer", width: 1000, height: 1000 };
  }
  if (!it && cfg.sources.itunes) {
    it = (await itunesSearchAlbum(name, artist)) ?? null;
  }
  if (it) {
    const url = bestItunesArtwork(it);
    if (url) return { url, source: "itunes", width: 600, height: 600 };
  }
  if (cfg.sources.musicbrainz && cfg.sources.coverart) {
    const mb = await mbSearchReleaseGroup(name, artist);
    if (mb) {
      const url = await caaFrontUrl(mb.mbid);
      if (url) return { url, source: "coverart", width: 500, height: 500 };
    }
  }
  return null;
}

// ---------------------------------------------------------------- album enrichment

/** Push a freshly created finding into Jellyfin when write-back mode is "auto". */
async function maybeAutoApply(findingId: string, log: RunLog, autoApply: boolean): Promise<void> {
  if (!autoApply) return;
  const r = await applyFindingToJellyfin(findingId).catch((err: unknown) => ({
    ok: false as const,
    detail: err instanceof Error ? err.message : "write-back error",
  }));
  if (r.ok && (r.detail.startsWith("skipped") || r.detail.startsWith("already"))) return; // server already has it — stay quiet
  log.add(`  → Jellyfin: ${r.ok ? r.detail : `FAILED — ${r.detail}`}`);
}

async function enrichAlbum(item: JfRawItem, log: RunLog, cfgSources: { deezer: boolean; itunes: boolean; musicbrainz: boolean }, autoApply = false): Promise<{ enriched: number; missing: number }> {
  const name = item.Name ?? "";
  const artist = item.AlbumArtists?.[0]?.Name ?? "";
  let enriched = 0;
  let missing = 0;

  const needsArt = !item.ImageTags?.Primary;
  const needsMeta = !item.ProductionYear || !item.Genres || item.Genres.length === 0;

  let dz: DeezerAlbum | null = null;
  let it: ItunesAlbum | null = null;
  const needSources = needsArt || needsMeta;
  if (needSources && cfgSources.deezer) {
    dz = (await dzSearchAlbum(name, artist)) ?? null;
  }
  if (needSources && !dz && cfgSources.itunes) {
    it = (await itunesSearchAlbum(name, artist)) ?? null;
  }

  if (needsArt) {
    const hit = await resolveAlbumArtwork(name, artist, dz, it);
    if (hit) {
      const finding = await db.agentFinding.upsert({
        where: { itemId_kind: { itemId: item.Id, kind: "artwork" } },
        update: { status: "found", source: hit.source, payload: JSON.stringify(hit), summary: `${hit.width}×${hit.height} cover via ${hit.source}`, itemName: name, itemSubtitle: artist, itemType: "album" },
        create: { itemId: item.Id, itemType: "album", itemName: name, itemSubtitle: artist, kind: "artwork", status: "found", source: hit.source, payload: JSON.stringify(hit), summary: `${hit.width}×${hit.height} cover via ${hit.source}` },
      });
      log.add(`artwork: "${name}" — ${hit.source}`);
      await maybeAutoApply(finding.id, log, autoApply);
      enriched++;
    } else {
      await db.agentFinding.upsert({
        where: { itemId_kind: { itemId: item.Id, kind: "artwork" } },
        update: { status: "missing", source: "", summary: "No cover found on any enabled source", itemName: name, itemSubtitle: artist, itemType: "album" },
        create: { itemId: item.Id, itemType: "album", itemName: name, itemSubtitle: artist, kind: "artwork", status: "missing", summary: "No cover found on any enabled source" },
      });
      log.add(`artwork: "${name}" — not found`);
      missing++;
    }
  }

  if (needsMeta) {
    const year =
      (dz?.release_date ?? it?.releaseDate ?? "").slice(0, 4) ||
      (needsArt ? "" : String(item.ProductionYear || "")) ||
      "";
    const genres = dz?.genres?.data?.map((g) => g.name).filter(Boolean) ?? (it?.primaryGenreName ? [it.primaryGenreName] : []);
    const trackCount = dz?.nb_tracks ?? it?.trackCount ?? 0;
    const source = dz ? "deezer" : it ? "itunes" : "";
    if ((year || genres.length > 0 || trackCount > 0) && source) {
      const summary = [year ? `Year ${year}` : "", genres.length ? `Genre ${genres[0]}` : "", trackCount ? `${trackCount} tracks` : ""].filter(Boolean).join(" · ") || "Metadata via " + source;
      const finding = await db.agentFinding.upsert({
        where: { itemId_kind: { itemId: item.Id, kind: "metadata" } },
        update: { status: "found", source, payload: JSON.stringify({ year: year ? Number(year) : undefined, genres, trackCount: trackCount || undefined }), summary, itemName: name, itemSubtitle: artist, itemType: "album" },
        create: { itemId: item.Id, itemType: "album", itemName: name, itemSubtitle: artist, kind: "metadata", status: "found", source, payload: JSON.stringify({ year: year ? Number(year) : undefined, genres, trackCount: trackCount || undefined }), summary },
      });
      log.add(`metadata: "${name}" — ${[year, genres[0], trackCount ? `${trackCount} tracks` : ""].filter(Boolean).join(" / ") || source}`);
      await maybeAutoApply(finding.id, log, autoApply);
      enriched++;
    } else {
      log.add(`metadata: "${name}" — not found`);
      missing++;
    }
  }

  return { enriched, missing };
}

// ---------------------------------------------------------------- artist enrichment

async function enrichArtist(item: JfRawItem, log: RunLog, cfgSources: { wikipedia: boolean; deezer: boolean; itunes: boolean }, autoApply = false): Promise<{ enriched: number; missing: number }> {
  const name = item.Name ?? "";
  let enriched = 0;
  let missing = 0;
  const needsBio = cfgSources.wikipedia && !item.Overview?.trim();
  const needsPhoto = !item.ImageTags?.Primary;

  if (needsBio) {
    const bio = await wikiArtistBio(name).catch(() => null);
    if (bio?.extract) {
      const finding = await db.agentFinding.upsert({
        where: { itemId_kind: { itemId: item.Id, kind: "bio" } },
        update: { status: "found", source: "wikipedia", payload: JSON.stringify({ text: bio.extract, url: bio.pageUrl, thumbnailUrl: bio.thumbnailUrl }), summary: `${bio.extract.length} chars from Wikipedia`, itemName: name, itemType: "artist" },
        create: { itemId: item.Id, itemType: "artist", itemName: name, kind: "bio", status: "found", source: "wikipedia", payload: JSON.stringify({ text: bio.extract, url: bio.pageUrl, thumbnailUrl: bio.thumbnailUrl }), summary: `${bio.extract.length} chars from Wikipedia` },
      });
      log.add(`bio: "${name}" — wikipedia (${bio.extract.length} chars)`);
      await maybeAutoApply(finding.id, log, autoApply);
      enriched++;
    } else {
      await db.agentFinding.upsert({
        where: { itemId_kind: { itemId: item.Id, kind: "bio" } },
        update: { status: "missing", source: "", summary: "No Wikipedia page found", itemName: name, itemType: "artist" },
        create: { itemId: item.Id, itemType: "artist", itemName: name, kind: "bio", status: "missing", summary: "No Wikipedia page found" },
      });
      log.add(`bio: "${name}" — not found`);
      missing++;
    }
  }

  if (needsPhoto) {
    let hit: ArtworkHit | null = null;
    if (cfgSources.deezer) {
      const pic = await dzArtistPicture(name).catch(() => null);
      if (pic?.url) hit = { url: pic.url, source: "deezer", width: 1000, height: 1000 };
    }
    if (hit) {
      const finding = await db.agentFinding.upsert({
        where: { itemId_kind: { itemId: item.Id, kind: "artwork" } },
        update: { status: "found", source: hit.source, payload: JSON.stringify(hit), summary: "Artist photo via " + hit.source, itemName: name, itemType: "artist" },
        create: { itemId: item.Id, itemType: "artist", itemName: name, kind: "artwork", status: "found", source: hit.source, payload: JSON.stringify(hit), summary: "Artist photo via " + hit.source },
      });
      log.add(`photo: "${name}" — ${hit.source}`);
      await maybeAutoApply(finding.id, log, autoApply);
      enriched++;
    } else {
      log.add(`photo: "${name}" — not found`);
      missing++;
    }
  }

  return { enriched, missing };
}

// ---------------------------------------------------------------- main job

export async function runScanJob(): Promise<ScanResult> {
  const cfg = await ensureConfig();
  const log = new RunLog();
  let processed = 0;
  let enriched = 0;
  let missing = 0;
  log.add(`scan started (batch ${cfg.batchSize}, stage next: ${cfg.lastStage === "albums" ? "artists" : "albums"})`);

  // Phase 1 — resolve pending artwork requests recorded by the image proxy.
  let pending: { itemId: string; itemName: string; itemSubtitle: string; itemType: string }[] = [];
  try {
    pending = await db.agentFinding.findMany({ where: { kind: "artwork", status: "pending" }, orderBy: { updatedAt: "asc" }, take: Math.ceil(cfg.batchSize / 2) });
  } catch {
    /* db hiccup — proceed with random batch */
  }
  for (const p of pending) {
    try {
      const item = (await jfJson(`item/${p.itemId}`, {})) as unknown as JfRawItem;
      if (!item?.Id) throw new Error("item not found");
      processed++;
      if (item.Type === "MusicArtist") {
        const r = await enrichArtist({ ...item, Name: item.Name ?? p.itemName }, log, { wikipedia: cfg.sources.wikipedia, deezer: cfg.sources.deezer, itunes: cfg.sources.itunes }, cfg.writeBack === "auto");
        enriched += r.enriched;
        missing += r.missing;
      } else {
        const r = await enrichAlbum(item, log, { deezer: cfg.sources.deezer, itunes: cfg.sources.itunes, musicbrainz: cfg.sources.musicbrainz }, cfg.writeBack === "auto");
        enriched += r.enriched;
        missing += r.missing;
      }
    } catch (err) {
      // item vanished from the server — drop the pending entry
      try {
        await db.agentFinding.delete({ where: { itemId_kind: { itemId: p.itemId, kind: "artwork" } } });
      } catch {
        /* already gone */
      }
      log.add(`pending "${p.itemName || p.itemId}" — dropped (${err instanceof Error ? err.message : "error"})`);
      processed++;
    }
  }
  if (pending.length) log.add(`pending queue resolved (${pending.length} items)`);

  // Phase 2 — random batch alternating albums / artists.
  const stage: "albums" | "artists" = cfg.lastStage === "albums" ? "artists" : "albums";
  await updateConfig({ lastStage: stage });

  if (stage === "albums") {
    const albums = await jfItems("Items", {
      includeItemTypes: "MusicAlbum",
      recursive: "true",
      sortBy: "Random",
      limit: String(Math.max(4, cfg.batchSize - pending.length)),
      fields: "ChildCount,Genres,AlbumArtists,ProductionYear",
    });
    log.add(`album batch: ${albums.length} random albums`);
    for (const album of albums) {
      try {
        const r = await enrichAlbum(album, log, { deezer: cfg.sources.deezer, itunes: cfg.sources.itunes, musicbrainz: cfg.sources.musicbrainz }, cfg.writeBack === "auto");
        enriched += r.enriched;
        missing += r.missing;
        processed++;
      } catch (err) {
        log.add(`album "${album.Name}" — error: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  } else {
    const artists = await jfItems("Artists/AlbumArtists", {
      sortBy: "Random",
      limit: String(Math.max(4, cfg.batchSize - pending.length)),
      fields: "Genres,Overview",
    });
    log.add(`artist batch: ${artists.length} random artists`);
    for (const artist of artists) {
      try {
        const r = await enrichArtist(artist, log, { wikipedia: cfg.sources.wikipedia, deezer: cfg.sources.deezer, itunes: cfg.sources.itunes }, cfg.writeBack === "auto");
        enriched += r.enriched;
        missing += r.missing;
        processed++;
      } catch (err) {
        log.add(`artist "${artist.Name}" — error: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
  }

  log.add(`scan finished — ${processed} processed, ${enriched} enriched, ${missing} unresolved`);
  return { processed, enriched, missing, logLines: log.lines };
}
