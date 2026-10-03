// Library Agent API — GET /api/agent/enrichment/[itemId]
// The bridge between the agent's scraped knowledge and the running app.
// kind=bio       -> artist biography (Wikipedia)
// kind=artwork   -> resolved cover/photo URL (Deezer/iTunes/CAA)
// kind=metadata  -> album year/genres/trackCount
// kind=lyrics    -> synced/plain lyrics (LRCLIB) parsed into LyricLine[]
// With &fetch=1 a cache miss triggers a live internet lookup and persists it,
// so the first request "teaches" the agent and every later one is instant.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAgentStarted } from "@/lib/agent/scheduler";
import { ensureConfig } from "@/lib/agent/config";
import { wikiArtistBio } from "@/lib/agent/sources/wikipedia";
import { dzSearchAlbum, dzArtistPicture, bestDzCover } from "@/lib/agent/sources/deezer";
import { itunesSearchAlbum, bestItunesArtwork } from "@/lib/agent/sources/itunes";
import { mbSearchReleaseGroup, caaFrontUrl } from "@/lib/agent/sources/musicbrainz";
import { lrclibGetLyrics } from "@/lib/agent/sources/lrclib";
import { cleanQueryPart } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ itemId: string }> };

export interface EnrichedLine {
  time: number;
  text: string;
}

/** Parse LRC text ("[mm:ss.xx] line") into timed lines. */
export function parseLrc(lrc: string): EnrichedLine[] {
  const lines: EnrichedLine[] = [];
  for (const raw of lrc.split("\n")) {
    const times = [...raw.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (times.length === 0) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of times) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(`0.${m[3]}`) : 0;
      lines.push({ time: min * 60 + sec + frac, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

function plainToSynced(plain: string, duration: number): EnrichedLine[] {
  const ls = plain.split("\n").filter((l) => l.trim().length > 0);
  const step = duration > 0 ? duration / (ls.length + 1) : 3;
  return ls.map((text, i) => ({ time: i * step + 0.5, text }));
}

export async function GET(req: NextRequest, ctx: Ctx) {
  ensureAgentStarted();
  const { itemId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+$/.test(itemId)) {
    return NextResponse.json({ ok: false, error: "Invalid item id" }, { status: 400 });
  }
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") ?? "metadata";
  const doFetch = sp.get("fetch") === "1";
  const name = cleanQueryPart(sp.get("name") ?? "");
  const artist = cleanQueryPart(sp.get("artist") ?? "");
  const album = cleanQueryPart(sp.get("album") ?? "");
  const duration = Number(sp.get("duration") ?? 0) || 0;

  if (!["bio", "artwork", "metadata", "lyrics"].includes(kind)) {
    return NextResponse.json({ ok: false, error: "kind must be bio|artwork|metadata|lyrics" }, { status: 400 });
  }

  try {
    const existing = await db.agentFinding.findUnique({ where: { itemId_kind: { itemId, kind } } });
    if (existing && (existing.status === "found" || existing.status === "applied") && !doFetch) {
      return NextResponse.json({ ok: true, finding: shape(existing) });
    }

    const cfg = await ensureConfig();

    // ---- live lookup paths (only when fetch=1 and we have query context) ----
    if (doFetch) {
      if (kind === "bio" && name && cfg.sources.wikipedia) {
        const bio = await wikiArtistBio(name).catch(() => null);
        if (bio?.extract) {
          const finding = await upsert(itemId, kind, "found", "wikipedia", JSON.stringify({ text: bio.extract, url: bio.pageUrl, thumbnailUrl: bio.thumbnailUrl }), `${bio.extract.length} chars from Wikipedia`, "artist", name, "");
          return NextResponse.json({ ok: true, finding: shape(finding) });
        }
        await upsert(itemId, kind, "missing", "", "{}", "No Wikipedia page found", "artist", name, "");
        return NextResponse.json({ ok: true, finding: null });
      }

      if (kind === "artwork" && name) {
        let hit: { url: string; source: string; width: number; height: number } | null = null;
        const itemType = sp.get("itemType") === "artist" ? "artist" : "album";
        if (itemType === "artist") {
          if (cfg.sources.deezer) {
            const pic = await dzArtistPicture(name).catch(() => null);
            if (pic?.url) hit = { url: pic.url, source: "deezer", width: 1000, height: 1000 };
          }
        } else {
          const dz = cfg.sources.deezer ? await dzSearchAlbum(name, artist).catch(() => null) : null;
          if (dz) {
            const url = bestDzCover(dz);
            if (url) hit = { url, source: "deezer", width: 1000, height: 1000 };
          }
          if (!hit && cfg.sources.itunes) {
            const it = await itunesSearchAlbum(name, artist).catch(() => null);
            const url = it ? bestItunesArtwork(it) : null;
            if (url) hit = { url, source: "itunes", width: 600, height: 600 };
          }
          if (!hit && cfg.sources.musicbrainz && cfg.sources.coverart) {
            const mb = await mbSearchReleaseGroup(name, artist).catch(() => null);
            if (mb) {
              const url = await caaFrontUrl(mb.mbid).catch(() => null);
              if (url) hit = { url, source: "coverart", width: 500, height: 500 };
            }
          }
        }
        if (hit) {
          const finding = await upsert(itemId, kind, "found", hit.source, JSON.stringify(hit), `${hit.width}×${hit.height} via ${hit.source}`, itemType, name, artist);
          return NextResponse.json({ ok: true, finding: shape(finding) });
        }
        await upsert(itemId, kind, "missing", "", "{}", "No artwork found on enabled sources", itemType, name, artist);
        return NextResponse.json({ ok: true, finding: null });
      }

      if (kind === "lyrics" && name && artist && cfg.sources.lrclib) {
        const res = await lrclibGetLyrics({ artist, track: name, album, durationSec: duration }).catch(() => null);
        if (res) {
          const payload = JSON.stringify({ synced: res.syncedLyrics, plain: res.plainLyrics });
          const finding = await upsert(itemId, kind, "found", "lrclib", payload, res.syncedLyrics ? "Synced lyrics via LRCLIB" : "Plain lyrics via LRCLIB", "song", name, artist);
          const lines = res.syncedLyrics ? parseLrc(res.syncedLyrics) : plainToSynced(res.plainLyrics ?? "", duration);
          return NextResponse.json({ ok: true, finding: shape(finding), lines });
        }
        await upsert(itemId, kind, "missing", "", "{}", "No lyrics on LRCLIB", "song", name, artist);
        return NextResponse.json({ ok: true, finding: null, lines: null });
      }

      if (kind === "metadata" && name) {
        let meta: { year?: number; genres?: string[]; trackCount?: number } | null = null;
        let source = "";
        if (cfg.sources.deezer) {
          const dz = await dzSearchAlbum(name, artist).catch(() => null);
          if (dz) {
            meta = { year: dz.release_date ? Number(dz.release_date.slice(0, 4)) : undefined, genres: dz.genres?.data?.map((g) => g.name).filter(Boolean), trackCount: dz.nb_tracks ?? undefined };
            source = "deezer";
          }
        }
        if (!meta && cfg.sources.itunes) {
          const it = await itunesSearchAlbum(name, artist).catch(() => null);
          if (it) {
            meta = { year: it.releaseDate ? Number(it.releaseDate.slice(0, 4)) : undefined, genres: it.primaryGenreName ? [it.primaryGenreName] : undefined, trackCount: it.trackCount ?? undefined };
            source = "itunes";
          }
        }
        if (meta && (meta.year || meta.genres?.length || meta.trackCount)) {
          const summary = [meta.year ? `Year ${meta.year}` : "", meta.genres?.[0] ?? "", meta.trackCount ? `${meta.trackCount} tracks` : ""].filter(Boolean).join(" · ");
          const finding = await upsert(itemId, kind, "found", source, JSON.stringify(meta), summary || `Metadata via ${source}`, "album", name, artist);
          return NextResponse.json({ ok: true, finding: shape(finding) });
        }
        await upsert(itemId, kind, "missing", "", "{}", "No metadata found on enabled sources", "album", name, artist);
        return NextResponse.json({ ok: true, finding: null });
      }
    }

    // plain cache lookup result (hit/miss/missing)
    if (existing && (existing.status === "found" || existing.status === "applied")) {
      const payload = JSON.parse(existing.payload || "{}") as Record<string, unknown>;
      if (kind === "lyrics") {
        const synced = typeof payload.synced === "string" ? payload.synced : null;
        const plain = typeof payload.plain === "string" ? payload.plain : null;
        const lines = synced ? parseLrc(synced) : plain ? plainToSynced(plain, duration) : null;
        return NextResponse.json({ ok: true, finding: shape(existing), lines });
      }
      return NextResponse.json({ ok: true, finding: shape(existing) });
    }
    return NextResponse.json({ ok: true, finding: null });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "enrichment failed" }, { status: 500 });
  }
}

function shape(f: { kind: string; status: string; source: string; payload: string; summary: string; updatedAt: Date }) {
  return {
    kind: f.kind,
    status: f.status,
    source: f.source,
    summary: f.summary,
    payload: safeParse(f.payload),
    updatedAt: f.updatedAt,
  };
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function upsert(
  itemId: string,
  kind: string,
  status: string,
  source: string,
  payload: string,
  summary: string,
  itemType: string,
  itemName: string,
  itemSubtitle: string,
) {
  return db.agentFinding.upsert({
    where: { itemId_kind: { itemId, kind } },
    update: { status, source, payload, summary, itemType, itemName, itemSubtitle },
    create: { itemId, kind, status, source, payload, summary, itemType, itemName, itemSubtitle },
  });
}
