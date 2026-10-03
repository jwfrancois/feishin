// Library Agent API — GET /api/agent/sound-profile/[itemId]
// Analyzes a track or album (local genres + Deezer album genres + MusicBrainz
// artist tags) and returns the agent's Hi-Fi DSP profile for it, cached in the
// AgentFinding table (kind="sound").
//   &fetch=0     -> cached profile only (no network), { ok:false } on miss
//   &fetch=1     -> default; analyze on cache miss
//   &refresh=1   -> force re-analysis even if cached
import { NextRequest, NextResponse } from "next/server";
import { ensureAgentStarted } from "@/lib/agent/scheduler";
import { analyzeSoundProfile, getCachedSoundProfile, storeSoundProfile, type SoundProfileInput } from "@/lib/agent/sound-profile";

export const dynamic = "force-dynamic";

const RETRY_COOLDOWN_MS = 90_000; // keep in sync with sound-profile.ts

type Ctx = { params: Promise<{ itemId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  ensureAgentStarted();
  const { itemId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+$/.test(itemId)) {
    return NextResponse.json({ ok: false, error: "Invalid item id" }, { status: 400 });
  }
  const sp = req.nextUrl.searchParams;
  const itemType: SoundProfileInput["itemType"] = sp.get("itemType") === "album" ? "album" : "track";
  const name = (sp.get("name") ?? "").trim();
  const artist = (sp.get("artist") ?? "").trim();
  const album = (sp.get("album") ?? "").trim();
  const genres = (sp.get("genres") ?? "").trim();
  const yearRaw = Number(sp.get("year"));
  const durationRaw = Number(sp.get("duration"));
  const wantFetch = sp.get("fetch") !== "0";
  const refresh = sp.get("refresh") === "1";

  try {
    if (!refresh) {
      const cached = await getCachedSoundProfile(itemId);
      if (cached.profile && !cached.retryable) return NextResponse.json({ ok: true, profile: cached.profile, cached: true });
      // inconclusive last attempt: serve it if very recent (cooldown), otherwise re-analyze
      if (cached.profile && cached.retryable && cached.ageMs < RETRY_COOLDOWN_MS) {
        return NextResponse.json({ ok: true, profile: cached.profile, cached: true, stale: true });
      }
      if (!wantFetch) return NextResponse.json({ ok: false, reason: "not-analyzed" });
    }

    if (!name) {
      // nothing to analyze — return a neutral profile-shaped miss
      return NextResponse.json({ ok: false, reason: "missing-name" });
    }

    const input: SoundProfileInput = {
      itemId,
      itemType,
      name,
      artist: artist || undefined,
      album: album || undefined,
      genres: genres || undefined,
      year: Number.isFinite(yearRaw) && yearRaw > 1900 ? yearRaw : undefined,
      duration: Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : undefined,
    };

    const profile = await analyzeSoundProfile(input);
    await storeSoundProfile(profile, name, artist || album || "");
    return NextResponse.json({ ok: true, profile, cached: false });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "analysis failed" }, { status: 500 });
  }
}
