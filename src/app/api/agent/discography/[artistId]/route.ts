// Library Agent API — GET /api/agent/discography/[artistId]
// The internet discography for an artist: MusicBrainz release-groups diffed
// against the artist's albums in the Jellyfin library, so artist pages can show
// releases that are NOT in the library ("the internet info as well", not just
// the Jellyfin library). Release lists are cached in AgentFinding (kind=
// "discography"); the in-library diff is recomputed fresh on every request so
// newly-added albums instantly drop out of the "not in library" list.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jfJson } from "@/lib/jf-server";
import { ensureAgentStarted } from "@/lib/agent/scheduler";
import { ensureConfig } from "@/lib/agent/config";
import { mbSearchArtist, mbArtistReleaseGroups, type MbDiscogRelease } from "@/lib/agent/sources/musicbrainz";
import { cleanQueryPart } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ artistId: string }> };

export interface DiscogRelease extends MbDiscogRelease {
  inLibrary: boolean;
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function libraryAlbumTitles(artistId: string): Promise<string[]> {
  const data = (await jfJson("Items", {
    params: new URLSearchParams({
      includeItemTypes: "MusicAlbum",
      AlbumArtistIds: artistId,
      recursive: "true",
      limit: "500",
      fields: "Name",
    }),
  })) as { Items?: { Name?: string }[] };
  return (data.Items ?? []).map((i) => i.Name ?? "").filter(Boolean);
}

function diffReleases(releases: MbDiscogRelease[], libTitles: string[]): DiscogRelease[] {
  const libSet = new Set(libTitles.map(normTitle).filter(Boolean));
  const typeRank = (t?: string) => (t === "Album" ? 0 : t === "EP" ? 1 : t === "Single" ? 2 : 3);
  return releases
    .map((r) => ({ ...r, inLibrary: libSet.has(normTitle(r.title)) }))
    .sort((a, b) => {
      const t = typeRank(a.primaryType) - typeRank(b.primaryType);
      if (t !== 0) return t; // albums first, then EPs, then singles/remixes
      return (b.year ?? "").localeCompare(a.year ?? ""); // newest first within a type
    });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  ensureAgentStarted();
  const { artistId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+$/.test(artistId)) {
    return NextResponse.json({ ok: false, error: "Invalid artist id" }, { status: 400 });
  }
  const sp = req.nextUrl.searchParams;
  const name = cleanQueryPart(sp.get("name") ?? "");
  const doFetch = sp.get("fetch") === "1";

  try {
    const cached = await db.agentFinding.findUnique({ where: { itemId_kind: { itemId: artistId, kind: "discography" } } });
    const payload =
      cached && (cached.status === "found" || cached.status === "applied") ? safeParse(cached.payload) : null;
    const mbid = typeof payload?.mbid === "string" ? (payload.mbid as string) : "";
    const cachedReleases = Array.isArray(payload?.releases) ? (payload.releases as MbDiscogRelease[]) : [];

    // live lookup: when asked, or on a cold cache
    if ((doFetch || cachedReleases.length === 0) && name) {
      const cfg = await ensureConfig();
      if (cfg.sources.musicbrainz) {
        const artist = mbid ? { mbid } : await mbSearchArtist(name).catch(() => null);
        if (artist?.mbid) {
          const rgs = await mbArtistReleaseGroups(artist.mbid).catch(() => [] as MbDiscogRelease[]);
          if (rgs.length > 0) {
            await db.agentFinding.upsert({
              where: { itemId_kind: { itemId: artistId, kind: "discography" } },
              update: {
                status: "found",
                source: "musicbrainz",
                payload: JSON.stringify({ mbid: artist.mbid, releases: rgs }),
                summary: `${rgs.length} MusicBrainz releases`,
                itemName: name,
                itemType: "artist",
              },
              create: {
                itemId: artistId,
                itemType: "artist",
                itemName: name,
                kind: "discography",
                status: "found",
                source: "musicbrainz",
                payload: JSON.stringify({ mbid: artist.mbid, releases: rgs }),
                summary: `${rgs.length} MusicBrainz releases`,
              },
            });
            const titles = await libraryAlbumTitles(artistId).catch(() => [] as string[]);
            const releases = diffReleases(rgs, titles);
            return NextResponse.json({
              ok: true,
              mbid: artist.mbid,
              source: "musicbrainz",
              total: releases.length,
              inLibrary: releases.filter((r) => r.inLibrary).length,
              releases,
            });
          }
          if (doFetch) {
            await db.agentFinding.upsert({
              where: { itemId_kind: { itemId: artistId, kind: "discography" } },
              update: {
                status: "missing",
                source: "musicbrainz",
                summary: "No MusicBrainz releases found",
                itemName: name,
                itemType: "artist",
                ...(artist.mbid ? { payload: JSON.stringify({ mbid: artist.mbid, releases: [] }) } : {}),
              },
              create: { itemId: artistId, itemType: "artist", itemName: name, kind: "discography", status: "missing", source: "musicbrainz", summary: "No MusicBrainz releases found" },
            });
          }
        }
      }
    }

    // cached releases — diff against the current library so newly added albums drop out
    if (cachedReleases.length > 0) {
      const titles = await libraryAlbumTitles(artistId).catch(() => [] as string[]);
      const releases = diffReleases(cachedReleases, titles);
      return NextResponse.json({
        ok: true,
        mbid,
        source: "musicbrainz",
        total: releases.length,
        inLibrary: releases.filter((r) => r.inLibrary).length,
        releases,
      });
    }
    return NextResponse.json({ ok: true, releases: null });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "discography lookup failed" }, { status: 500 });
  }
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}
