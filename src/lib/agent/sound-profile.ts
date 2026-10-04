// Library Agent — sound-profile analyzer ("Auto-EQ brain").
//
// The agent inspects what is playing (track or album), gathers genre/mood
// signals from three layers — the Jellyfin library's own genres, Deezer's
// album genres and MusicBrainz artist tags — then distills them through a
// studio-curve knowledge base into a concrete Hi-Fi DSP profile:
// 10-band EQ gains, preamp trim, headphone crossfeed, stereo width,
// a dynamics mode and a loudness-normalization recommendation.
//
// Everything is deterministic and explainable: the profile carries its
// matched tags, contributing sources and a plain-English rationale that the
// Hi-Fi Studio panel shows to the user. Results are cached per item in the
// AgentFinding table (kind="sound") so repeat plays apply instantly.
import { db } from "@/lib/db";
import type { AgentSoundProfile } from "@/lib/types";
import { EQ_PRESETS, type EqPresetId } from "@/lib/audio/eq-presets";
import { ensureConfig } from "./config";
import { dzSearchAlbum } from "./sources/deezer";
import { mbSearchArtist } from "./sources/musicbrainz";

// ---------------------------------------------------------------------------
// Genre-class knowledge base
// ---------------------------------------------------------------------------

interface ClassSignature {
  id: string;
  label: string;
  /** keywords matched against lowercased tags (word-ish includes) */
  keys: string[];
  /** studio preset (eq-presets.ts) this class's curve is built on — shown in the
   *  Hi-Fi panel as the "mapped preset" chip; null = the agent's own variant */
  presetId: EqPresetId | null;
  /** 10-band EQ gains in dB (31…16k ISO octaves) */
  gains: number[];
  crossfeed: number;
  stereoWidth: number;
  dynamics: AgentSoundProfile["dynamics"];
  loudnessNorm: boolean;
  /** short "why" fragment woven into the rationale */
  why: string;
}

const DYN = (mode: AgentSoundProfile["dynamics"]["mode"]): AgentSoundProfile["dynamics"] => ({
  ...(mode === "reference"
    ? { threshold: -6, ratio: 2, attack: 0.005, release: 0.15, makeup: 1.5 }
    : mode === "night"
      ? { threshold: -28, ratio: 6, attack: 0.012, release: 0.28, makeup: 4 }
      : mode === "club"
        ? { threshold: -18, ratio: 4, attack: 0.008, release: 0.18, makeup: 2.5 }
        : { threshold: 0, ratio: 1, attack: 0.003, release: 0.25, makeup: 0 }),
  mode,
});

export const SOUND_CLASSES: ClassSignature[] = [
  {
    id: "edm",
    label: "EDM & Festival",
    keys: ["edm", "big room", "mainstage", "festival", "future bass", "hardstyle", "electro house", "progressive house", "bass house", "psytrance"],
    presetId: "edm",
    gains: [6, 5, 2, 0, -1, -0.5, 1, 2.5, 4.5, 5],
    crossfeed: 0,
    stereoWidth: 1.2,
    dynamics: DYN("club"),
    loudnessNorm: false,
    why: "festival-scale sub lift with drop-ready air, club glue for wall-of-sound masters",
  },
  {
    id: "electronic",
    label: "Electronic",
    keys: ["electronic", "electronica", "techno", "house", "edm", "trance", "dubstep", "drum and bass", "dnb", "jungle", "idm", "synth", "electro", "dance", "club", "rave", "breakbeat", "garage", "downtempo dance"],
    presetId: "electronic",
    gains: [5, 4, 1.5, 0, -1, -0.5, 1, 2, 4, 4.5],
    crossfeed: 0,
    stereoWidth: 1.15,
    dynamics: DYN("club"),
    loudnessNorm: false,
    why: "deep sub lift with crisp synth transients, gentle club glue",
  },
  {
    id: "hiphop",
    label: "Hip-Hop",
    keys: ["hip hop", "hip-hop", "hiphop", "rap", "trap", "drill", "grime", "808", "boom bap", "urban", "g-funk"],
    presetId: "hiphop",
    gains: [5.5, 5, 2.5, 1, -0.5, -1, 0.5, 1.5, 2, 2],
    crossfeed: 0,
    stereoWidth: 1,
    dynamics: DYN("off"),
    loudnessNorm: false,
    why: "808 weight kept tight, vocal clarity preserved",
  },
  {
    id: "rock",
    label: "Rock",
    keys: ["rock", "grunge", "indie rock", "alt rock", "alternative", "hard rock", "punk", "garage rock", "post-rock", "psych", "emo"],
    presetId: "rock",
    gains: [3.5, 3, 1.5, 0.5, -0.5, -0.5, 1, 2.5, 3, 2.5],
    crossfeed: 0,
    stereoWidth: 1.05,
    dynamics: DYN("off"),
    loudnessNorm: false,
    why: "guitar bite and kick punch, dynamics untouched",
  },
  {
    id: "metal",
    label: "Metal",
    keys: ["metal", "metalcore", "doom", "hardcore", "death", "black metal", "thrash", "sludge", "djent"],
    presetId: null, // agent's own variant — cleans low-mid mud instead of scooping it
    gains: [-1, 1, 2, 1.5, 0, -0.5, 1.5, 2.5, 3, 2],
    crossfeed: 0,
    stereoWidth: 1.1,
    dynamics: DYN("reference"),
    loudnessNorm: false,
    why: "low-mid mud cleaned so dense mixes stay legible, light mastering glue",
  },
  {
    id: "pop",
    label: "Pop",
    keys: ["pop", "k-pop", "kpop", "dance pop", "synth-pop", "teen", "top 40", "electropop", "indie pop"],
    presetId: "pop",
    gains: [-1, 0.5, 1.5, 2, 2.5, 1.5, 0.5, 1, 2, 1.5],
    crossfeed: 0.05,
    stereoWidth: 1.05,
    dynamics: DYN("reference"),
    loudnessNorm: true,
    why: "polished radio V-curve, level kept even across tracks",
  },
  {
    id: "soul",
    label: "Soul & Funk",
    keys: ["soul", "funk", "r&b", "rnb", "rhythm and blues", "motown", "gospel", "disco", "neo-soul", "doo-wop"],
    presetId: "randb",
    gains: [1, 1.5, 2, 2, 1.5, 1.5, 1, 0.5, 1.5, 1],
    crossfeed: 0.1,
    stereoWidth: 1,
    dynamics: DYN("off"),
    loudnessNorm: true,
    why: "warm low-mids for horns and bass, top end left calm",
  },
  {
    id: "jazzclub",
    label: "Jazz Club",
    keys: ["vocal jazz", "smooth jazz", "lounge", "cool jazz", "cabaret", "swing revival"],
    presetId: "jazzclub",
    gains: [1, 1.5, 2, 1.5, 0.5, 1, 1.5, 2, 1.5, 1],
    crossfeed: 0.2,
    stereoWidth: 1.05,
    dynamics: DYN("off"),
    loudnessNorm: true,
    why: "intimate club stage — tight lows, warm presence, gentle top for close-mic'd ensembles",
  },
  {
    id: "jazz",
    label: "Jazz",
    keys: ["jazz", "bebop", "swing", "big band", "fusion", "bossa", "saxophone", "free jazz"],
    presetId: "jazz",
    gains: [2, 2, 1, 1, 0.5, 1, 1.5, 2, 2.5, 2],
    crossfeed: 0.25,
    stereoWidth: 1.1,
    dynamics: DYN("off"),
    loudnessNorm: false,
    why: "saxophone warmth, soft top, 25% crossfeed for a natural headphone stage",
  },
  {
    id: "classical",
    label: "Classical",
    keys: ["classical", "orchestral", "orchestra", "symphony", "symphonic", "chamber", "opera", "piano", "string quartet", "baroque", "romantic", "modern classical", "concerto", "sonata"],
    presetId: "classical",
    gains: [2, 1.5, 0.5, 0, 0, 0, 0, 0.5, 1.5, 2.5],
    crossfeed: 0.3,
    stereoWidth: 1.2,
    dynamics: DYN("off"),
    loudnessNorm: false,
    why: "hall-friendly curve — compression OFF so natural dynamics survive, 30% crossfeed opens the soundstage",
  },
  {
    id: "acoustic",
    label: "Acoustic & Folk",
    keys: ["acoustic", "folk", "singer-songwriter", "unplugged", "guitar", "bluegrass", "americana", "country", "roots", "freak folk", "celtic"],
    presetId: "acoustic",
    gains: [1.5, 1.5, 1, 0.5, 1, 1, 1.5, 2, 1.5, 0.5],
    crossfeed: 0.2,
    stereoWidth: 1.05,
    dynamics: DYN("off"),
    loudnessNorm: true,
    why: "warm mids for strings, loudness normalization for quiet dynamic masters",
  },
  {
    id: "ambient",
    label: "Ambient & Chill",
    keys: ["ambient", "chillout", "chill", "lo-fi", "lofi", "new age", "meditation", "drone", "soundscape", "sleep", "focus", "downtempo"],
    presetId: "chill",
    gains: [2.5, 2.5, 1, 0, 0, -0.5, 0, 1, 2.5, 3],
    crossfeed: 0.15,
    stereoWidth: 1.25,
    dynamics: DYN("reference"),
    loudnessNorm: true,
    why: "slow-attack pads get air, extra width, gentle reference glue",
  },
  {
    id: "blues",
    label: "Blues & Country",
    keys: ["blues", "delta blues", "chicago blues", "jump blues", "gospel blues"],
    presetId: "blues",
    gains: [1.5, 1.5, 1.5, 1, 0.5, 0.5, 1, 1.5, 1, 0.5],
    crossfeed: 0.2,
    stereoWidth: 1,
    dynamics: DYN("off"),
    loudnessNorm: true,
    why: "even, honest curve that keeps vintage recordings warm",
  },
  {
    id: "world",
    label: "World & Groove",
    keys: ["reggae", "dub", "ska", "dancehall", "afrobeat", "afrobeats", "salsa", "latin", "bossa nova", "world", "brazil", "cumbia", "highlife", "soca", "reggaeton"],
    presetId: "reggae",
    gains: [4, 3.5, 2, 1, 0, 0, 0.5, 1, 1.5, 1],
    crossfeed: 0.1,
    stereoWidth: 1.05,
    dynamics: DYN("off"),
    loudnessNorm: false,
    why: "bass-forward groove with mids left open for percussion",
  },
  {
    id: "vocal",
    label: "Vocal Focus",
    keys: ["vocal", "ballad", "a cappella", "acapella", "choral", "podcast", "speech", "audiobook", "comedy", "spoken word", "voice"],
    presetId: "vocal",
    gains: [-2, -1.5, -0.5, 0, 1.5, 3, 4, 3.5, 1.5, 0],
    crossfeed: 0.1,
    stereoWidth: 1,
    dynamics: DYN("night"),
    loudnessNorm: true,
    why: "presence lift 1–4 kHz so voices sit forward, night compression for evenness",
  },
];

// Tag-specific accents layered on top of the blended class curve.
interface Accent {
  keys: string[];
  apply: (gains: number[]) => string; // mutates gains copy, returns a why-fragment
}

const ACCENTS: Accent[] = [
  {
    keys: ["bass", "sub", "808", "808s", "deep"],
    apply: (g) => {
      g[0] += 1.5;
      g[1] += 1.5;
      g[2] += 1;
      return "extra sub weight";
    },
  },
  {
    keys: ["bright", "airy", "shimmer", "crisp"],
    apply: (g) => {
      g[7] += 1;
      g[8] += 1.5;
      g[9] += 1.5;
      return "extra air up top";
    },
  },
  {
    keys: ["vocal", "vocals", "singer"],
    apply: (g) => {
      g[5] += 1;
      g[6] += 1.5;
      g[7] += 1;
      return "vocal presence nudge";
    },
  },
  {
    keys: ["lo-fi", "lofi", "vinyl", "vintage", "warm"],
    apply: (g) => {
      g[8] -= 1.5;
      g[9] -= 2;
      g[2] += 0.5;
      return "tamed highs for a warmer vintage feel";
    },
  },
  {
    keys: ["live", "concert", "stage"],
    apply: (g) => {
      g[0] += 1;
      g[9] += 1;
      return "audience-energy lows and highs";
    },
  },
];

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function collectTags(raw: string[], source: string, into: Map<string, { weight: number; sources: Set<string> }>, weight: number) {
  for (const r of raw) {
    const tag = r.toLowerCase().trim();
    // junk guard: drop empty / single-char / purely numeric tags ("0", "12", …)
    if (!tag || tag.length < 2 || /^\d+$/.test(tag) || tag.length > 40) continue;
    const hit = into.get(tag);
    if (hit) {
      hit.weight += weight;
      hit.sources.add(source);
    } else {
      into.set(tag, { weight, sources: new Set([source]) });
    }
  }
}

interface BlendResult {
  classScores: { cls: ClassSignature; score: number }[];
  matchedTags: { tag: string; cls: string }[];
}

function blendClasses(tags: Map<string, { weight: number; sources: Set<string> }>): BlendResult {
  const scores = new Map<string, number>();
  const matched: { tag: string; cls: string }[] = [];
  for (const [tag, meta] of tags) {
    for (const cls of SOUND_CLASSES) {
      if (cls.keys.some((k) => tag === k || tag.includes(k))) {
        scores.set(cls.id, (scores.get(cls.id) ?? 0) + meta.weight);
        matched.push({ tag, cls: cls.id });
        break; // each tag feeds its best (first-matched) class only
      }
    }
  }
  const classScores = [...scores.entries()]
    .map(([id, score]) => ({ cls: SOUND_CLASSES.find((c) => c.id === id)!, score }))
    .filter((e) => e.cls)
    .sort((a, b) => b.score - a.score);
  return { classScores, matchedTags: matched };
}

const clampDb = (v: number) => Math.max(-12, Math.min(12, Math.round(v * 4) / 4));

export interface SoundProfileInput {
  itemId: string;
  itemType: "track" | "album";
  name: string;
  artist?: string;
  album?: string;
  /** comma-separated genres known locally (Jellyfin tags) */
  genres?: string;
  year?: number;
  duration?: number;
}

/** Build the profile from already-collected tags (pure, testable). */
export function computeProfile(input: SoundProfileInput, tags: Map<string, { weight: number; sources: Set<string> }>): AgentSoundProfile {
  const { classScores, matchedTags } = blendClasses(tags);
  const totalScore = classScores.reduce((acc, c) => acc + c.score, 0);
  const distinctSources = new Set([...tags.values()].flatMap((t) => [...t.sources])).size;

  const top = classScores[0]?.cls ?? null;
  const topScore = classScores[0]?.score ?? 0;

  // ---- EQ curve: weighted blend of matched class signatures ----------------
  let gains = new Array(10).fill(0) as number[];
  let crossfeed = 0;
  let width = 1;
  let normVotes = 0;
  if (top && totalScore > 0) {
    gains = gains.map((_, i) => {
      let v = 0;
      for (const { cls, score } of classScores) v += cls.gains[i] * (score / totalScore);
      return clampDb(v);
    });
    crossfeed = Math.round(classScores.reduce((acc, c) => acc + c.cls.crossfeed * (c.score / totalScore), 0) * 100) / 100;
    width = Math.round(classScores.reduce((acc, c) => acc + c.cls.stereoWidth * (c.score / totalScore), 0) * 100) / 100;
    normVotes = classScores.reduce((acc, c) => acc + (c.cls.loudnessNorm ? c.score : 0), 0) / totalScore;
  }

  // ---- accents from raw tags ----------------------------------------------
  const whyBits: string[] = [];
  for (const accent of ACCENTS) {
    const hit = [...tags.keys()].find((t) => accent.keys.some((k) => t.includes(k)));
    if (hit) {
      const g = [...gains];
      const note = accent.apply(g);
      for (let i = 0; i < 10; i++) gains[i] = clampDb(g[i]);
      whyBits.push(`${note} (“${hit}”)`);
    }
  }

  // ---- dynamics: top class decides (categorical) ---------------------------
  const dynamics = top ? { ...top.dynamics } : DYN("off");

  // ---- loudness normalization: class vote + old-master heuristic -----------
  let loudnessNorm = normVotes >= 0.5;
  const year = input.year;
  const oldMaster = typeof year === "number" && year > 1900 && year < 1995;
  if (oldMaster && !loudnessNorm && top?.id !== "electronic" && top?.id !== "hiphop") {
    loudnessNorm = true;
    whyBits.push(`pre-1995 master (${year}) — normalization evens the level`);
  }

  // ---- confidence ----------------------------------------------------------
  const confidence = top
    ? Math.min(0.97, 0.3 + 0.18 * distinctSources + 0.04 * matchedTags.length + Math.min(0.2, topScore / 4))
    : 0.15;

  // ---- naming --------------------------------------------------------------
  const name = top ? `Agent · ${top.label}` : "Agent · Neutral Reference";
  const mappedPreset = top?.presetId ? EQ_PRESETS.find((p) => p.id === top.presetId) ?? null : null;

  // ---- rationale -----------------------------------------------------------
  const tagList = [...tags.keys()].slice(0, 6);
  const srcLabel = [...new Set([...tags.values()].flatMap((t) => [...t.sources]))].join(" · ") || "no sources";
  const parts: string[] = [];
  if (top) {
    parts.push(`${matchedTags.length} matched tag${matchedTags.length === 1 ? "" : "s"} (${tagList.join(", ")}) via ${srcLabel} → ${top.label} curve: ${top.why}`);
    if (mappedPreset) parts.push(`built on the ${mappedPreset.name} studio preset`);
  } else {
    parts.push(`No recognizable genre signature (tags: ${tagList.length ? tagList.join(", ") : "none"} via ${srcLabel}) — staying bit-transparent; the manual EQ remains yours`);
  }
  if (whyBits.length) parts.push(whyBits.join("; "));
  parts.push(dynamics.mode === "off" ? "dynamics left untouched" : `${dynamics.mode} dynamics (${dynamics.ratio}:1)`);
  if (crossfeed > 0.02) parts.push(`${Math.round(crossfeed * 100)}% crossfeed`);
  if (Math.abs(width - 1) > 0.02) parts.push(`width ${Math.round(width * 100)}%`);

  return {
    version: 1,
    name,
    topClass: top?.id ?? "neutral",
    presetId: mappedPreset?.id,
    presetName: mappedPreset?.name,
    tags: matchedTags.map((m) => ({ tag: m.tag, source: [...tags.get(m.tag)?.sources ?? ["?"]].join("+") })),
    sources: [...new Set([...tags.values()].flatMap((t) => [...t.sources]))],
    gains,
    preamp: 0,
    crossfeed,
    stereoWidth: width,
    balance: 0,
    dynamics,
    loudnessNorm,
    confidence: Math.round(confidence * 100) / 100,
    rationale: parts.join(". ") + ".",
    analyzedAt: new Date().toISOString(),
    itemType: input.itemType,
    itemId: input.itemId,
    itemName: input.name,
  };
}

/**
 * Full analysis pipeline for one item: collect tags from the library genres
 * (client-supplied), Deezer album genres and MusicBrainz artist tags, then
 * compute the DSP profile. Network sources are best-effort with hard
 * timeouts — the profile is still produced if they fail.
 */
export async function analyzeSoundProfile(input: SoundProfileInput): Promise<AgentSoundProfile> {
  const tags = new Map<string, { weight: number; sources: Set<string> }>();

  // 1) local genres straight from the client/library — strongest signal
  const localGenres = (input.genres ?? "")
    .split(/[,;|/·]+/)
    .map((g) => g.trim())
    .filter(Boolean);
  collectTags(localGenres, "library", tags, 1.0);

  // 2) internet layers — respect the agent's source switches
  const cfg = await ensureConfig();
  const jobs: Promise<void>[] = [];
  if (cfg.enabled && cfg.sources.deezer && input.album) {
    jobs.push(
      dzSearchAlbum(input.album, input.artist ?? "").then((album) => {
        if (album?.genres?.data) collectTags(album.genres.data.map((g) => g.name), "deezer", tags, 0.8);
      }),
    );
  }
  if (cfg.enabled && cfg.sources.musicbrainz && input.artist) {
    jobs.push(
      mbSearchArtist(input.artist).then((artist) => {
        if (artist?.genres) collectTags(artist.genres, "musicbrainz", tags, 0.6);
      }),
    );
  }
  await Promise.allSettled(jobs);

  return computeProfile(input, tags);
}

// ---------------------------------------------------------------------------
// Cache (AgentFinding, kind="sound")
// ---------------------------------------------------------------------------

const SOUND_KIND = "sound";
const RETRY_COOLDOWN_MS = 90_000; // don't re-hit the internet more than once/1.5 min per item

export async function getCachedSoundProfile(
  itemId: string,
): Promise<{ profile: AgentSoundProfile | null; retryable: boolean; ageMs: number }> {
  const row = await db.agentFinding.findUnique({ where: { itemId_kind: { itemId, kind: SOUND_KIND } } });
  if (!row) return { profile: null, retryable: true, ageMs: Infinity };
  let profile: AgentSoundProfile | null = null;
  try {
    profile = JSON.parse(row.payload) as AgentSoundProfile;
  } catch {
    profile = null;
  }
  const ageMs = Date.now() - new Date(row.updatedAt).getTime();
  // "found" = a real genre signature was matched (stable — serve from cache);
  // pending/missing = last attempt was inconclusive (likely a rate-limited or
  // unreachable source) — retryable after the cooldown.
  const retryable = row.status !== "found";
  return { profile, retryable, ageMs };
}

export async function storeSoundProfile(profile: AgentSoundProfile, itemName: string, itemSubtitle: string): Promise<void> {
  const matched = profile.topClass !== "neutral";
  const status = matched ? "found" : "pending"; // pending = retry later, don't pin a weak profile
  const summary = matched
    ? `${profile.name} — ${Math.round(profile.confidence * 100)}% confidence — ${profile.tags.length} tags (${profile.sources.join(", ") || "none"})`
    : `No genre signature yet (weak/internet-unreachable) — will re-probe`;
  await db.agentFinding.upsert({
    where: { itemId_kind: { itemId: profile.itemId, kind: SOUND_KIND } },
    create: {
      itemId: profile.itemId,
      itemType: profile.itemType,
      itemName,
      itemSubtitle,
      kind: SOUND_KIND,
      source: profile.sources.join("+") || "local",
      status,
      payload: JSON.stringify(profile),
      summary,
    },
    update: {
      itemName,
      itemSubtitle,
      source: profile.sources.join("+") || "local",
      status,
      payload: JSON.stringify(profile),
      summary,
    },
  });
}
