"use client";
// Feishin rebuild — Hi-Fi studio visualizer: log-frequency spectrum analyzer
// with dBFS grid + L/R peak meters (dBFS scale, peak-hold). Canvas 2D, rAF loop,
// reads post-DSP analyser data from the hifi engine.
import { useEffect, useRef } from "react";
import { hifiEngine } from "@/lib/audio/hifi-engine";
import { cn } from "@/lib/utils";

const BAR_COUNT = 56;
// log-spaced bar edges 30 Hz … 18 kHz over the 2048-bin FFT
const MIN_HZ = 30;
const MAX_HZ = 18000;
const PEAK_HOLD_S = 1.4;
const PEAK_FALL_DB = 20; // dB per second after hold expires

function dbToNorm(db: number, floor = -90): number {
  return Math.max(0, Math.min(1, (db - floor) / -floor));
}

export function HifiVisualizer({ variant = "panel", className }: { variant?: "panel" | "mini"; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const peaksRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const peakAgeRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
  const meterPeakRef = useRef({ left: 0, right: 0, ageL: 0, ageR: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const mini = variant === "mini";
    const spec = new Float32Array(1024); // half of fftSize 2048
    let last = performance.now();

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.clearRect(0, 0, w, h);

      const style = getComputedStyle(canvas);
      const accent = style.getPropertyValue("--primary").trim() || "#e58e5a";
      const dim = style.getPropertyValue("--fg-dim").trim() || "#888";
      const border = style.getPropertyValue("--border").trim() || "#333";

      const hasData = hifiEngine.getSpectrum(spec);
      const levels = hifiEngine.getLevels();

      if (mini) {
        // ---- compact spectrum strip -----------------------------------------
        const bw = w / BAR_COUNT;
        for (let b = 0; b < BAR_COUNT; b++) {
          const db = hasData ? barDb(spec, b) : -100;
          const v = dbToNorm(db);
          const bh = Math.max(1, v * h);
          ctx2d.fillStyle = accent;
          ctx2d.globalAlpha = 0.35 + 0.65 * v;
          ctx2d.fillRect(b * bw + 0.5, h - bh, Math.max(1, bw - 1), bh);
        }
        ctx2d.globalAlpha = 1;
        return;
      }

      // ---- panel: grid ------------------------------------------------------
      ctx2d.font = "9px ui-monospace, monospace";
      ctx2d.textAlign = "left";
      for (const db of [-20, -40, -60, -80]) {
        const y = h - dbToNorm(db) * (h - 14) - 2;
        ctx2d.strokeStyle = border;
        ctx2d.globalAlpha = 0.5;
        ctx2d.beginPath();
        ctx2d.moveTo(22, y);
        ctx2d.lineTo(w, y);
        ctx2d.stroke();
        ctx2d.fillStyle = dim;
        ctx2d.globalAlpha = 0.8;
        ctx2d.fillText(`${db}`, 2, y + 3);
      }
      ctx2d.globalAlpha = 1;

      // ---- spectrum bars ----------------------------------------------------
      const plotW = w - 26;
      const bw = plotW / BAR_COUNT;
      const grad = ctx2d.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, accent);
      grad.addColorStop(0.55, `${accent}b0`);
      grad.addColorStop(1, "#ffffffd0");
      for (let b = 0; b < BAR_COUNT; b++) {
        const db = hasData ? barDb(spec, b) : -100;
        const v = dbToNorm(db);
        const bh = Math.max(1.5, v * (h - 14));
        const x = 26 + b * bw;
        ctx2d.fillStyle = grad;
        ctx2d.globalAlpha = 0.28 + 0.72 * v;
        ctx2d.fillRect(x, h - 2 - bh, Math.max(1.5, bw - 1.5), bh);
        // peak hold
        const peaks = peaksRef.current;
        const ages = peakAgeRef.current;
        if (v >= peaks[b]) {
          peaks[b] = v;
          ages[b] = now;
        } else if (now - ages[b] > PEAK_HOLD_S * 1000) {
          peaks[b] = Math.max(0, peaks[b] - (PEAK_FALL_DB / 90) * dt);
        }
        const py = h - 2 - Math.max(1.5, peaks[b] * (h - 14));
        ctx2d.globalAlpha = 0.9;
        ctx2d.fillStyle = dim;
        ctx2d.fillRect(x, py - 1.5, Math.max(1.5, bw - 1.5), 1.5);
      }
      ctx2d.globalAlpha = 1;

      // ---- frequency labels -------------------------------------------------
      ctx2d.fillStyle = dim;
      ctx2d.globalAlpha = 0.85;
      for (const [hz, label] of [[100, "100"], [1000, "1k"], [10000, "10k"]] as const) {
        const x = 26 + plotW * (Math.log10(hz / MIN_HZ) / Math.log10(MAX_HZ / MIN_HZ));
        ctx2d.textAlign = "center";
        ctx2d.fillText(label, Math.max(28, Math.min(w - 8, x)), h - 0.5 + 0); // labels overlay bottom
      }
      ctx2d.globalAlpha = 1;

      // ---- L/R peak meters (right gutter) ------------------------------------
      const meterW = 7;
      const meterH = h - 2;
      const drawMeter = (level: number, x: number, peak: { v: number; age: number }) => {
        ctx2d.fillStyle = border;
        ctx2d.globalAlpha = 0.6;
        ctx2d.fillRect(x, 2, meterW, meterH);
        ctx2d.globalAlpha = 1;
        const v = dbToNorm(20 * Math.log10(Math.max(level, 1e-5)));
        const segH = meterH - 2;
        const lit = Math.round(v * 28);
        for (let i = 0; i < 28; i++) {
          const frac = i / 27;
          const on = i < lit;
          const y = 2 + segH - (i + 1) * (segH / 28) + 0.5;
          ctx2d.globalAlpha = on ? 1 : 0.18;
          ctx2d.fillStyle = frac > 0.9 ? "#ef4444" : frac > 0.72 ? "#f5c04a" : accent;
          if (on || frac > 0.72) ctx2d.fillRect(x + 1, y, meterW - 2, segH / 28 - 1);
        }
        ctx2d.globalAlpha = 1;
        if (v >= peak.v) {
          peak.v = v;
          peak.age = now;
        } else if (now - peak.age > PEAK_HOLD_S * 1000) {
          peak.v = Math.max(0, peak.v - 0.25 * dt);
        }
        const py = 2 + segH - Math.max(0.02, peak.v) * segH;
        ctx2d.fillStyle = "#fff";
        ctx2d.fillRect(x + 0.5, py - 1, meterW - 1, 1.5);
      };
      const pk = meterPeakRef.current;
      drawMeter(levels.valid ? levels.left : 0, w - meterW * 2 - 6, { get v() { return pk.left; }, set v(x: number) { pk.left = x; }, get age() { return pk.ageL; }, set age(x: number) { pk.ageL = x; } });
      drawMeter(levels.valid ? levels.right : 0, w - meterW - 4, { get v() { return pk.right; }, set v(x: number) { pk.right = x; }, get age() { return pk.ageR; }, set age(x: number) { pk.ageR = x; } });
      ctx2d.fillStyle = dim;
      ctx2d.font = "8px ui-monospace, monospace";
      ctx2d.textAlign = "center";
      ctx2d.fillText("L", w - meterW * 2 - 3, 9);
      ctx2d.fillText("R", w - meterW / 2 - 3, 9);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("block h-full w-full", className)}
      aria-label={variant === "panel" ? "Spectrum analyzer and peak meters" : "Mini spectrum analyzer"}
      role="img"
    />
  );
}

/** Average one log-spaced bar out of the linear FFT bins (dB). */
function barDb(spec: Float32Array, bar: number): number {
  const sampleRate = 48000; // analyser bins span 0..nyquist; exact ctx rate not needed for grouping
  const nyquist = sampleRate / 2;
  const bins = spec.length;
  const f0 = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, bar / BAR_COUNT);
  const f1 = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, (bar + 1) / BAR_COUNT);
  let i0 = Math.floor((f0 / nyquist) * bins);
  let i1 = Math.ceil((f1 / nyquist) * bins);
  i0 = Math.max(0, Math.min(bins - 1, i0));
  i1 = Math.max(i0 + 1, Math.min(bins, i1));
  let sum = 0;
  let peak = -200;
  for (let i = i0; i < i1; i++) {
    sum += spec[i];
    if (spec[i] > peak) peak = spec[i];
  }
  // blend average (body) with peak (transients) for a stable, lively bar
  const avg = sum / (i1 - i0);
  return avg * 0.65 + peak * 0.35;
}
