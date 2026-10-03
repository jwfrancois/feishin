"use client";
// Feishin rebuild — Hi-Fi studio store (persisted): DSP chain settings for the
// Web Audio engine. The engine (lib/audio/hifi-engine.ts) subscribes to this
// store and applies every change to live AudioNodes.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { EQ_BANDS, EQ_PRESETS, eqPresetGains, type EqPresetId } from "@/lib/audio/eq-presets";

export type DynamicsMode = "off" | "reference" | "night" | "club" | "custom";

export interface DynamicsSettings {
  mode: DynamicsMode;
  threshold: number; // dB
  ratio: number; // 1..20
  attack: number; // s
  release: number; // s
  makeup: number; // dB of extra output gain
}

export interface HifiState {
  enabled: boolean; // master DSP chain (bypass = bit-perfect direct path)
  preamp: number; // dB, -12..+12
  eqGains: number[]; // dB per band, -12..+12 (length = EQ_BANDS.length)
  eqPreset: EqPresetId | "custom";
  crossfeed: number; // 0..1 headphone crossfeed amount (0 = off)
  stereoWidth: number; // 0..2 (1 = normal, 0 = mono, 2 = extra wide)
  balance: number; // -1 (L) .. +1 (R)
  dynamics: DynamicsSettings;
  loudnessNorm: boolean; // RMS-based loudness normalization toward ~-19 dBFS
  miniViz: boolean; // compact spectrum in the player bar
  setEnabled: (v: boolean) => void;
  setPreamp: (v: number) => void;
  setBandGain: (band: number, gain: number) => void;
  setEqGains: (gains: number[]) => void;
  applyPreset: (id: EqPresetId) => void;
  setCrossfeed: (v: number) => void;
  setStereoWidth: (v: number) => void;
  setBalance: (v: number) => void;
  setDynamics: (patch: Partial<DynamicsSettings>) => void;
  setLoudnessNorm: (v: boolean) => void;
  setMiniViz: (v: boolean) => void;
  resetAll: () => void;
}

export const DEFAULT_DYNAMICS: DynamicsSettings = {
  mode: "off",
  threshold: -18,
  ratio: 3,
  attack: 0.008,
  release: 0.2,
  makeup: 0,
};

const DEFAULT_EQ = eqPresetGains("flat");

export const useHifiStore = create<HifiState>()(
  persist(
    (set) => ({
      enabled: true,
      preamp: 0,
      eqGains: DEFAULT_EQ,
      eqPreset: "flat",
      crossfeed: 0,
      stereoWidth: 1,
      balance: 0,
      dynamics: DEFAULT_DYNAMICS,
      loudnessNorm: false,
      miniViz: false,
      setEnabled: (v) => set({ enabled: v }),
      setPreamp: (v) => set({ preamp: Math.max(-12, Math.min(12, v)) }),
      setBandGain: (band, gain) =>
        set((s) => {
          const eqGains = [...s.eqGains];
          eqGains[band] = Math.max(-12, Math.min(12, gain));
          return { eqGains, eqPreset: "custom" as const };
        }),
      setEqGains: (gains) => set({ eqGains: gains }),
      applyPreset: (id) => set({ eqGains: eqPresetGains(id), eqPreset: id }),
      setCrossfeed: (v) => set({ crossfeed: Math.max(0, Math.min(1, v)) }),
      setStereoWidth: (v) => set({ stereoWidth: Math.max(0, Math.min(2, v)) }),
      setBalance: (v) => set({ balance: Math.max(-1, Math.min(1, v)) }),
      setDynamics: (patch) =>
        set((s) => {
          const dynamics = { ...s.dynamics, ...patch };
          if (patch.mode && patch.mode !== "custom") {
            // mode chips load a full studio starting point
            const preset: Record<Exclude<DynamicsMode, "custom" | "off">, DynamicsSettings> = {
              reference: { mode: "reference", threshold: -6, ratio: 2, attack: 0.005, release: 0.15, makeup: 1.5 },
              night: { mode: "night", threshold: -28, ratio: 6, attack: 0.012, release: 0.28, makeup: 4 },
              club: { mode: "club", threshold: -18, ratio: 4, attack: 0.008, release: 0.18, makeup: 2.5 },
            };
            if (patch.mode === "off") return { dynamics: { ...DEFAULT_DYNAMICS, mode: "off" } };
            return { dynamics: preset[patch.mode] };
          }
          return { dynamics };
        }),
      setLoudnessNorm: (v) => set({ loudnessNorm: v }),
      setMiniViz: (v) => set({ miniViz: v }),
      resetAll: () =>
        set({
          enabled: true,
          preamp: 0,
          eqGains: DEFAULT_EQ,
          eqPreset: "flat",
          crossfeed: 0,
          stereoWidth: 1,
          balance: 0,
          dynamics: DEFAULT_DYNAMICS,
          loudnessNorm: false,
        }),
    }),
    {
      name: "feishin-hifi",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export { EQ_BANDS, EQ_PRESETS };

/** Non-persisted UI state for the Hi-Fi Studio panel (opened from player bar / settings). */
export const useHifiUi = create<{ open: boolean; setOpen: (v: boolean) => void; toggle: () => void }>()((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
