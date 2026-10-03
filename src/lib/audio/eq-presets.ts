// Feishin rebuild — Hi-Fi studio: graphic equalizer band layout + studio presets.
// 10 bands on the ISO octave centers (31 Hz … 16 kHz), ±12 dB range.
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
  | "hiphop"
  | "jazz"
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
  | "cinema";

export interface EqPreset {
  id: EqPresetId;
  name: string;
  description: string;
  gains: number[]; // dB per band, aligned with EQ_BANDS
}

const P = (id: EqPresetId, name: string, description: string, gains: number[]): EqPreset => ({
  id,
  name,
  description,
  gains,
});

export const EQ_PRESETS: EqPreset[] = [
  P("flat", "Flat", "Bit-transparent reference — no coloration", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  P("reference", "Studio Reference", "Neutral with a touch of air for near-field monitors", [0, 0, 0, 0, 0, -0.5, 0, 1, 2, 2.5]),
  P("acoustic", "Acoustic", "Warm mids for guitars and unplugged sets", [1.5, 1.5, 1, 0.5, 1, 1, 1.5, 2, 1.5, 0.5]),
  P("bassboost", "Bass Boost", "Sub-bass lift for electronic and hip-hop", [6, 5.5, 4, 2, 0.5, 0, 0, 0, 1, 1.5]),
  P("bassreduce", "Bass Reduce", "Tighten boomy rooms and muddy lows", [-6, -5, -3.5, -2, -0.5, 0, 0.5, 1, 1.5, 1.5]),
  P("classical", "Classical", "Hall-friendly curve — natural dynamics preserved", [2, 1.5, 0.5, 0, 0, 0, 0, 0.5, 1.5, 2.5]),
  P("dance", "Dance", "Punchy low end with bright presence", [4.5, 3.5, 1.5, 0, 0.5, 1.5, 1.5, 2.5, 4, 3.5]),
  P("electronic", "Electronic", "Deep subs and crisp synth transients", [5, 4, 1.5, 0, -1, -0.5, 1, 2, 4, 4.5]),
  P("hiphop", "Hip-Hop", "808 weight with vocal clarity", [5.5, 5, 2.5, 1, -0.5, -1, 0.5, 1.5, 2, 2]),
  P("jazz", "Jazz", "Saxophone warmth, soft top end", [2, 2, 1, 1, 0.5, 1, 1.5, 2, 2.5, 2]),
  P("pop", "Pop", "Polished V-curve for radio sheen", [-1, 0.5, 1.5, 2, 2.5, 1.5, 0.5, 1, 2, 1.5]),
  P("rock", "Rock", "Guitar bite and kick drum punch", [3.5, 3, 1.5, 0.5, -0.5, -0.5, 1, 2.5, 3, 2.5]),
  P("vocal", "Vocal Boost", "Presence lift for singers and podcasts", [-2, -1.5, -0.5, 0, 1.5, 3, 4, 3.5, 1.5, 0]),
  P("harman", "Harman Target", "Research-backed preferred listening curve — gentle bass tilt, smooth top", [4, 3.5, 2.5, 1.5, 0.5, 0, -0.5, -1, 0.5, 2]),
  P("latenight", "Late Night", "Equal-loudness compensation for low-volume listening — full sound at whisper level", [3, 2.5, 1, 0, 0, 0, 0, 0.5, 2, 3]),
  P("metal", "Metal", "Scooped mids with surgical pick attack and double-kick punch", [4, 3.5, 1.5, -1, -2.5, -2, -0.5, 1.5, 3, 2.5]),
  P("podcast", "Podcast / Speech", "Max intelligibility — cuts rumble, lifts consonants, tames sibilance", [-6, -5, -3, -1, 0.5, 2, 3.5, 3, 1, -0.5]),
  P("lofi", "Lo-Fi Vintage", "Cassette-era roll-off — warm lows-mids, dusty highs", [2, 2.5, 1.5, 0.5, 0, -0.5, -1.5, -2.5, -4, -5]),
  P("tube", "Tube Warmth", "Valve-amp coloration — gentle low-mid body, silk-soft top", [2.5, 3, 2.5, 1.5, 0.5, 0, -0.5, -0.5, 0, 1]),
  P("car", "Car Stereo", "Road-noise compensation — subs and highs punch through engine hum", [4, 3.5, 2, 0.5, 0, 0, 0.5, 1.5, 2.5, 3]),
  P("cinema", "Cinema", "Soundtrack scale — wide smile with dialogue kept front and center", [3.5, 3, 1.5, 0.5, 0, 0.5, 1, 1.5, 2.5, 3]),
];

export function eqPresetGains(id: EqPresetId): number[] {
  const preset = EQ_PRESETS.find((p) => p.id === id) ?? EQ_PRESETS[0];
  return [...preset.gains];
}
