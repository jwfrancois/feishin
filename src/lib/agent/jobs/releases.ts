// Library Agent — release radar job ("record store clerk" duty).
// Each run checks a random batch of library artists against MusicBrainz and
// flags recent releases (last 24 months) that are missing from the library —
// so you hear about new albums instead of discovering them a year late.
// In-app knowledge only (the agent can't add albums to Jellyfin for you).
import { db } from "@/lib/db";
import { jfJson, type JfFetchOptions } from "@/lib/jf-server";
import { mbSearchArtist, mbArtistReleaseGroups, type MbDiscogRelease } from "../sources/musicbrainz";

class RunLog {
  lines: string[] = [];
  add(s: string) {
    const ts = new Date().toISOString().slice(11, 19);
    this.lines.push(`[${ts}] ${s}`);
    if (this.lines.length > 120) this.lines.splice(0, this.lines.length - 120);
  }
}

export interface ReleasesResult {
  processed: number;
  enriched: number;
  missing: number;
  logLines: string[];
}

const RELEASES_KIND = "releases";
const ARTISTS_PER_RUN = 6;
const LOOKBACK_YEARS = 2;
const MAX_PER_ARTIST = 3;

/** Strip edition qualifiers ("(Deluxe Edition)", "[Remastered 2011]") then normalize for title matching. */
function normTitle(s: string): string {
  return s
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface JfAlbumLite {
  Id: string;
  Name?: string;
}

/** Normalized album titles ONE artist has in the library (one small query per artist). */
async function fetchArtistAlbumTitles(artistId: string): Promise<Set<string>> {
  const titles = new Set<string>();
  const sp = new URLSearchParams({
    includeItemTypes: "MusicAlbum",
    recursive: "true",
    AlbumArtistIds: artistId,
    limit: "2000",
  });
  const data = (await jfJson("Items", { params: sp } as JfFetchOptions)) as { Items?: JfAlbumLite[] };
  for (const a of data.Items ?? []) {
    const title = normTitle(a.Name ?? "");
    if (title) titles.add(title);
  }
  return titles;
}

function isRadarCandidate(r: MbDiscogRelease): boolean {
  if (r.primaryType && r.primaryType !== "Album" && r.primaryType !== "EP") return false;
  const sec = (r.secondaryTypes ?? []).map((t) => t.toLowerCase());
  if (sec.includes("live") || sec.includes("compilation") || sec.includes("dj-mix")) return false;
  const year = Number(r.year ?? 0);
  const cutoff = new Date().getFullYear() - LOOKBACK_YEARS;
  return year >= cutoff;
}

/** Split collaboration credits ("A & B", "A feat. B", "A vs B", "A, B") into the primary artist. */
function primaryArtist(name: string): string {
  const parts = name.split(/\s*(?:,|&|\bfeat\.?\b|\bfeaturing\b|\bft\.?\b|\bwith\b|\bvs\.?\b|\bversus\b|\bx\b)\s*/i);
  return (parts[0] ?? "").trim();
}

async function findArtistMbid(name: string): Promise<{ mbid: string; matchedOn: string } | null> {
  const direct = await mbSearchArtist(name).catch(() => null);
  if (direct) return { mbid: direct.mbid, matchedOn: name };
  const primary = primaryArtist(name);
  if (!primary || primary.toLowerCase() === name.toLowerCase().trim()) return null;
  const fallback = await mbSearchArtist(primary).catch(() => null);
  if (fallback) return { mbid: fallback.mbid, matchedOn: primary };
  return null;
}

export async function runReleasesJob(): Promise<ReleasesResult> {
  const log = new RunLog();
  log.add(`release radar — checking ${ARTISTS_PER_RUN} random artists against MusicBrainz (last ${LOOKBACK_YEARS} years)`);

  // library albums are fetched per-artist below — one small query each

  const sp = new URLSearchParams({
    sortBy: "Random",
    limit: String(ARTISTS_PER_RUN),
    fields: "Overview",
  });
  const data = (await jfJson("Artists/AlbumArtists", { params: sp } as JfFetchOptions)) as { Items?: { Id: string; Name?: string }[] };
  const artists = (data.Items ?? []).filter((a) => (a.Name ?? "").trim().length > 0);

  let processed = 0;
  let enriched = 0;
  let missing = 0;

  for (const artist of artists) {
    const name = artist.Name ?? "";
    try {
      const mb = await findArtistMbid(name);
      if (!mb) {
        log.add(`"${name}" — no MusicBrainz match, skipped`);
        missing++;
        processed++;
        continue;
      }
      const groups = (await mbArtistReleaseGroups(mb.mbid, 100)).filter(isRadarCandidate);
      const owned = await fetchArtistAlbumTitles(artist.Id);
      const missingReleases = groups.filter((r) => !owned.has(normTitle(r.title))).slice(0, MAX_PER_ARTIST);

      if (missingReleases.length === 0) {
        // clean up any stale finding for this artist
        const stale = await db.agentFinding.findUnique({ where: { itemId_kind: { itemId: artist.Id, kind: RELEASES_KIND } }, select: { id: true } });
        if (stale) {
          await db.agentFinding.delete({ where: { id: stale.id } });
          log.add(`"${name}" — previously flagged releases now in library, finding cleared`);
        }
        processed++;
        continue;
      }

      const latest = missingReleases[0];
      const summary =
        missingReleases.length === 1
          ? `New release not in your library — "${latest.title}" (${latest.year ?? "?"})`
          : `${missingReleases.length} releases not in your library — latest "${latest.title}" (${latest.year ?? "?"})`;
      await db.agentFinding.upsert({
        where: { itemId_kind: { itemId: artist.Id, kind: RELEASES_KIND } },
        update: {
          status: "found",
          source: "musicbrainz",
          payload: JSON.stringify({ artistName: name, mbid: mb.mbid, matchedOn: mb.matchedOn, missing: missingReleases.map((r) => ({ title: r.title, year: r.year, type: r.primaryType, mbid: r.mbid })) }),
          summary,
          itemName: name,
          itemType: "artist",
        },
        create: { itemId: artist.Id, itemType: "artist", itemName: name, kind: RELEASES_KIND, status: "found", source: "musicbrainz", payload: JSON.stringify({ artistName: name, mbid: mb.mbid, matchedOn: mb.matchedOn, missing: missingReleases.map((r) => ({ title: r.title, year: r.year, type: r.primaryType, mbid: r.mbid })) }), summary },
      });
      log.add(`"${name}" — ${missingReleases.map((r) => `${r.title} (${r.year ?? "?"})`).join(", ")}`);
      enriched++;
      processed++;
    } catch (err) {
      log.add(`"${name}" — error: ${err instanceof Error ? err.message : "unknown"}`);
      processed++;
    }
  }

  log.add(`release radar finished — ${processed} artists checked, ${enriched} flagged, ${missing} unmatched on MusicBrainz`);
  return { processed, enriched, missing, logLines: log.lines };
}
