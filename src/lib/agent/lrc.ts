// Library Agent — LRC (synced lyrics) parsing shared by the enrichment route
// (in-app playback) and the Jellyfin write-back module (server lyric upload).

export interface TimedLine {
  time: number; // seconds
  text: string;
}

/** Parse LRC text ("[mm:ss.xx] line") into timed lines. */
export function parseLrc(lrc: string): TimedLine[] {
  const lines: TimedLine[] = [];
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

/** Spread plain (untimed) lyric lines evenly across the track duration. */
export function plainToTimed(plain: string, duration: number): TimedLine[] {
  const ls = plain.split("\n").filter((l) => l.trim().length > 0);
  const step = duration > 0 ? duration / (ls.length + 1) : 3;
  return ls.map((text, i) => ({ time: i * step + 0.5, text }));
}
