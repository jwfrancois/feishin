// Feishin rebuild — Hi-Fi studio: graphic equalizer band layout + studio presets.
// 10 bands on the ISO octave centers (31 Hz … 16 kHz), ±12 dB range.
//
// Presets are grouped for the panel dropdown:
//   genre       — per-genre curves; the Agent Auto-EQ knowledge base maps its
//                 genre classes onto these (see lib/agent/sound-profile.ts)
//   studio      — engineering targets and reference curves
//   environment — playback-context compensation (speakers, car, night…)
export interface EqBand {
  freq: number;
  label: string;
}

export const EQ_BANDS: EqBand[] = [
  { freq: 31, label: "31" },
  { freq: 62, label: "62" },
  { freq: 125, label: "125" },
  { freq: 250, label: "250" },
  { freq: 500, label: "500" },
  { freq: 1000, label: "1k" },
  { freq: 2000, label: "2k" },
  { freq: 4000, label: "4k" },
  { freq: 8000, label: "8k" },
  { freq: 16000, label: "16k" },
];

export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;

export type EqPresetId =
  | "flat"
  | "reference"
  | "acoustic"
  | "bassboost"
  | "bassreduce"
  | "classical"
  | "dance"
  | "electronic"
  | "edm"
  | "hiphop"
  | "jazz"
  | "jazzclub"
  | "pop"
  | "rock"
  | "vocal"
  | "harman"
  | "latenight"
  | "metal"
  | "podcast"
  | "lofi"
  | "tube"
  | "car"
  | "cinema"
  | "bassshaper"
  | "smallspeakers"
  | "reggae"
  | "randb"
  | "chill"
  | "blues";

export type EqPresetGroup = "genre" | "studio" | "environment";

export interface EqPreset {
  id: EqPresetId;
  name: string;
  group: EqPresetGroup;
  description: string;
  gains: number[]; // dB per band, aligned with EQ_BANDS
}

const P = (id: EqPresetId, name: string, group: EqPresetGroup, description: string, gains: number[]): EqPreset => ({
  id,
  name,
  group,
  description,
  gains,
});

export const EQ_PRESETS: EqPreset[] = [
  // ------------------------------------------------------------- genre curves
  P("acoustic", "Acoustic", "genre", "Warm mids for guitars and unplugged sets", [1.5, 1.5, 1, 0.5, 1, 1, 1.5, 2, 1.5, 0.5]),
  P("blues", "Blues & Roots", "genre", "Even, honest curve that keeps vintage recordings warm", [1.5, 1.5, 1.5, 1, 0.5, 0.5, 1, 1.5, 1, 0.5]),
  P("chill", "Ambient & Chill", "genre", "Slow-attack pads get air and extra width — never harsh", [2.5, 2.5, 1, 0, 0, -0.5, 0, 1, 2.5, 3]),
  P("classical", "Classical", "genre", "Hall-friendly curve — natural dynamics preserved", [2, 1.5, 0.5, 0, 0, 0, 0, 0.5, 1.5, 2.5]),
  P("dance", "Dance", "genre", "Punchy low end with bright presence", [4.5, 3.5, 1.5, 0, 0.5, 1.5, 1.5, 2.5, 4, 3.5]),
  P("edm", "EDM Festival", "genre", "Big-room curve — festival-scale subs with drop-ready air", [6, 5, 2, 0, -1, -0.5, 1, 2.5, 4.5, 5]),
  P("electronic", "Electronic", "genre", "Deep subs and crisp synth transients", [5, 4, 1.5, 0, -1, -0.5, 1, 2, 4, 4.5]),
  P("hiphop", "Hip-Hop", "genre", "808 weight with vocal clarity", [5.5, 5, 2.5, 1, -0.5, -1, 0.5, 1.5, 2, 2]),
  P("jazz", "Jazz", "genre", "Saxophone warmth, soft top end", [2, 2, 1, 1, 0.5, 1, 1.5, 2, 2.5, 2]),
  P("jazzclub", "Jazz Club", "genre", "Intimate small-stage tuning — tight lows, warm presence, gentle top", [1, 1.5, 2, 1.5, 0.5, 1, 1.5, 2, 1.5, 1]),
  P("lofi", "Lo-Fi Vintage", "genre", "Cassette-era roll-off — warm lows-mids, dusty highs", [2, 2.5, 1.5, 0.5, 0, -0.5, -1.5, -2.5, -4, -5]),
  P("metal", "Metal", "genre", "Scooped mids with surgical pick attack and double-kick punch", [4, 3.5, 1.5, -1, -2.5, -2, -0.5, 1.5, 3, 2.5]),
  P("pop", "Pop", "genre", "Polished V-curve for radio sheen", [-1, 0.5, 1.5, 2, 2.5, 1.5, 0.5, 1, 2, 1.5]),
  P("randb", "R&B / Soul", "genre", "Silky low-mids for horns and bass — top end left calm", [1, 1.5, 2, 2, 1.5, 1.5, 1, 0.5, 1.5, 1]),
  P("reggae", "Reggae & Dub", "genre", "Bass-forward groove with mids open for skank and percussion", [4, 3.5, 2, 1, 0, 0, 0.5, 1, 1.5, 1]),
  P("rock", "Rock", "genre", "Guitar bite and kick drum punch", [3.5, 3, 1.5, 0.5, -0.5, -0.5, 1, 2.5, 3, 2.5]),
  P("vocal", "Vocal Boost", "genre", "Presence lift for singers and podcasts", [-2, -1.5, -0.5, 0, 1.5, 3, 4, 3.5, 1.5, 0]),
  P("podcast", "Podcast / Speech", "genre", "Max intelligibility — cuts rumble, lifts consonants, tames sibilance", [-6, -5, -3, -1, 0.5, 2, 3.5, 3, 1, -0.5]),
  // ------------------------------------------------------------ studio curves
  P("flat", "Flat", "studio", "Bit-transparent reference — no coloration", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  P("reference", "Studio Reference", "studio", "Neutral with a touch of air for near-field monitors", [0, 0, 0, 0, 0, -0.5, 0, 1, 2, 2.5]),
  P("harman", "Harman Target", "studio", "Research-backed preferred listening curve — gentle bass tilt, smooth top", [4, 3.5, 2.5, 1.5, 0.5, 0, -0.5, -1, 0.5, 2]),
  P("tube", "Tube Warmth", "studio", "Valve-amp coloration — gentle low-mid body, silk-soft top", [2.5, 3, 2.5, 1.5, 0.5, 0, -0.5, -0.5, 0, 1]),
  // ------------------------------------------------------- environment curves
  P("bassboost", "Bass Boost", "environment", "Sub-bass lift for electronic and hip-hop", [6, 5.5, 4, 2, 0.5, 0, 0, 0, 1, 1.5]),
  P("bassshaper", "Bass Shaper", "environment", "Sub-extension specialist — deep foundation while mids stay protected", [7, 6, 3, 0.5, -1.5, -1, 0, 1, 2, 2]),
  P("bassreduce", "Bass Reduce", "environment", "Tighten boomy rooms and muddy lows", [-6, -5, -3.5, -2, -0.5, 0, 0.5, 1, 1.5, 1.5]),
  P("smallspeakers", "Small Speakers", "environment", "Compensates laptop / phone / bookshelf roll-off at both ends", [3, 4, 2, -1, -1.5, 0, 1, 2, 3.5, 4]),
  P("car", "Car Stereo", "environment", "Road-noise compensation — subs and highs punch through engine hum", [4, 3.5, 2, 0.5, 0, 0, 0.5, 1.5, 2.5, 3]),
  P("cinema", "Cinema", "environment", "Soundtrack scale — wide smile with dialogue kept front and center", [3.5, 3, 1.5, 0.5, 0, 0.5, 1, 1.5, 2.5, 3]),
  P("latenight", "Late Night", "environment", "Equal-loudness compensation for low-volume listening — full sound at whisper level", [3, 2.5, 1, 0, 0, 0, 0, 0.5, 2, 3]),
];

export const EQ_PRESET_GROUPS: { id: EqPresetGroup; label: string; presets: EqPreset[] }[] = [
  { id: "genre", label: "Genre curves", presets: EQ_PRESETS.filter((p) => p.group === "genre") },
  { id: "studio", label: "Studio targets", presets: EQ_PRESETS.filter((p) => p.group === "studio") },
  { id: "environment", label: "Environment & speakers", presets: EQ_PRESETS.filter((p) => p.group === "environment") },
];

export function eqPresetGains(id: EqPresetId): number[] {
  const preset = EQ_PRESETS.find((p) => p.id === id) ?? EQ_PRESETS[0];
  return [...preset.gains];
}
