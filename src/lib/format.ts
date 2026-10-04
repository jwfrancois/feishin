// Feishin rebuild — display format helpers (feishin-style)
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatLongDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatPlayCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Extract a dominant color from an image URL (client-side, small canvas). */
export async function extractDominantColor(url: string): Promise<[number, number, number] | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    const size = 24;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [pr, pg, pb] = [data[i], data[i + 1], data[i + 2]];
      // skip near-black / near-white pixels for a more useful accent
      const max = Math.max(pr, pg, pb);
      const min = Math.min(pr, pg, pb);
      if (max < 18 || min > 240) continue;
      r += pr;
      g += pg;
      b += pb;
      count++;
    }
    if (count === 0) return null;
    return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
  } catch {
    return null;
  }
}
