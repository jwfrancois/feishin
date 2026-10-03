// Feishin rebuild — deterministic mock synced lyrics (like feishin's lyrics feature)
import { mulberry32, hashStr } from "./library";

const OPENERS = [
  "I was running through the static",
  "Midnight painted on the window",
  "There's a light inside the hallway",
  "We were talking to the shadows",
  "Hold the line, the wires humming",
  "Every streetlight knows my name now",
  "Echoes falling through the silence",
  "Rain is writing on the pavement",
  "Turn the dial and let it wander",
  "Golden hour on the water tower",
  "Something's breathing in the chorus",
  "I can hear the floorboards dreaming",
];

const MIDDLES = [
  "and the city sings it back to me",
  "where the neon learns to breathe",
  "we were younger in the echoes",
  "but the morning always answers",
  "while the tape is slowly turning",
  "and the pavement remembers everything",
  "with the radio left on",
  "as the headlights drift away",
  "and the ceiling holds the sound",
  "like a secret keeping still",
  "under electric weather",
  "till the quiet takes over",
];

const ENDINGS = [
  "So hold on, hold on, we're not done yet",
  "And I keep coming back to you",
  "Let it play, let it play all night",
  "We are made of the same old light",
  "Nothing left to prove tonight",
  "And the story writes itself",
  "Take me where the quiet ends",
  "I will follow you down there",
  "Every heartbeat is a drum",
  "We were never meant to last",
  "But we're burning anyway",
  "Lift me up above the noise",
];

export interface LyricLine {
  time: number;
  text: string;
}

export function getLyrics(trackId: string, trackName: string, artist: string, duration: number): LyricLine[] {
  const rnd = mulberry32(hashStr(trackId + trackName));
  const lines: LyricLine[] = [];
  const count = Math.max(8, Math.floor(duration / 7));
  lines.push({ time: 0.5, text: artist });
  lines.push({ time: 2.2, text: `Provided by homelab internal` });
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  for (let i = 0; i < count; i++) {
    const style = rnd();
    let text: string;
    if (style < 0.35) text = pick(OPENERS);
    else if (style < 0.75) text = `${pick(OPENERS)}, ${pick(MIDDLES)}`;
    else text = pick(ENDINGS);
    lines.push({
      time: 3 + (i * (duration - 6)) / count,
      text,
    });
  }
  // weave the track title in
  lines[Math.floor(lines.length / 2)] = { time: 3 + ((count / 2) * (duration - 6)) / count, text: trackName };
  return lines;
}

export function getActiveLyricIndex(lines: LyricLine[], position: number): number {
  let active = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= position) active = i;
    else break;
  }
  return active;
}
