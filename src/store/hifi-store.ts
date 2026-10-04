"use client";
// Feishin rebuild — Hi-Fi studio store (persisted): DSP chain settings for the
// Web Audio engine. The engine (lib/audio/hifi-engine.ts) subscribes to this
// store and applies every change to live AudioNodes.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { EQ_BANDS, EQ_PRESETS, eqPresetGains, type EqPresetId } from "@/lib/audio/eq-presets";
import type { AgentSoundProfile } from "@/lib/types";

export type DynamicsMode = "off" | "reference" | "night" | "club" | "custom";

/** Runtime status of the agent Auto-EQ pipeline (shared panel ↔ controller). */
export type AgentEqStatus = "idle" | "analyzing" | "error";

export type AutoEqScope = "track" | "album";

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
  // ---- agent Auto-EQ -------------------------------------------------------
  autoEq: boolean; // agent analyzes the track/album and tunes the DSP
  autoEqScope: AutoEqScope; // what the agent analyzes: the track or its album
  agentProfile: AgentSoundProfile | null; // last profile applied by the agent (runtime)
  agentOverridden: boolean; // user touched a control after the agent applied (runtime)
  agentStatus: AgentEqStatus; // idle | analyzing | error (runtime)
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
  setAutoEq: (v: boolean) => void;
  setAutoEqScope: (v: AutoEqScope) => void;
  applyAgentProfile: (p: AgentSoundProfile) => void;
  clearAgentProfile: () => void;
  setAgentStatus: (s: AgentEqStatus) => void;
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
      autoEq: true,
      autoEqScope: "album",
      agentProfile: null,
      agentOverridden: false,
      agentStatus: "idle",
      setEnabled: (v) => set({ enabled: v }),
      setPreamp: (v) => set((s) => ({ preamp: Math.max(-12, Math.min(12, v)), agentOverridden: s.agentProfile ? true : s.agentOverridden })),
      setBandGain: (band, gain) =>
        set((s) => {
          const eqGains = [...s.eqGains];
          eqGains[band] = Math.max(-12, Math.min(12, gain));
          return { eqGains, eqPreset: "custom" as const, agentOverridden: s.agentProfile ? true : s.agentOverridden };
        }),
      setEqGains: (gains) => set((s) => ({ eqGains: gains, agentOverridden: s.agentProfile ? true : s.agentOverridden })),
      applyPreset: (id) => set((s) => ({ eqGains: eqPresetGains(id), eqPreset: id, agentOverridden: s.agentProfile ? true : s.agentOverridden })),
      setCrossfeed: (v) => set((s) => ({ crossfeed: Math.max(0, Math.min(1, v)), agentOverridden: s.agentProfile ? true : s.agentOverridden })),
      setStereoWidth: (v) => set((s) => ({ stereoWidth: Math.max(0, Math.min(2, v)), agentOverridden: s.agentProfile ? true : s.agentOverridden })),
      setBalance: (v) => set({ balance: Math.max(-1, Math.min(1, v)) }), // balance is hardware/user territory — never flags override
      setDynamics: (patch) =>
        set((s) => {
          const dynamics = { ...s.dynamics, ...patch };
          const agentOverridden = s.agentProfile ? true : s.agentOverridden;
          if (patch.mode && patch.mode !== "custom") {
            // mode chips load a full studio starting point
            const preset: Record<Exclude<DynamicsMode, "custom" | "off">, DynamicsSettings> = {
              reference: { mode: "reference", threshold: -6, ratio: 2, attack: 0.005, release: 0.15, makeup: 1.5 },
              night: { mode: "night", threshold: -28, ratio: 6, attack: 0.012, release: 0.28, makeup: 4 },
              club: { mode: "club", threshold: -18, ratio: 4, attack: 0.008, release: 0.18, makeup: 2.5 },
            };
            if (patch.mode === "off") return { dynamics: { ...DEFAULT_DYNAMICS, mode: "off" }, agentOverridden };
            return { dynamics: preset[patch.mode], agentOverridden };
          }
          return { dynamics, agentOverridden };
        }),
      setLoudnessNorm: (v) => set((s) => ({ loudnessNorm: v, agentOverridden: s.agentProfile ? true : s.agentOverridden })),
      setMiniViz: (v) => set({ miniViz: v }),
      setAutoEq: (v) => set(v ? { autoEq: true } : { autoEq: false, agentProfile: null, agentOverridden: false, agentStatus: "idle" }),
      setAutoEqScope: (v) => set({ autoEqScope: v }),
      applyAgentProfile: (p) =>
        set({
          eqGains: p.gains.map((g) => Math.max(-12, Math.min(12, g))),
          eqPreset: "custom" as const,
          preamp: Math.max(-12, Math.min(12, p.preamp ?? 0)),
          crossfeed: Math.max(0, Math.min(1, p.crossfeed ?? 0)),
          stereoWidth: Math.max(0, Math.min(2, p.stereoWidth ?? 1)),
          dynamics: { ...p.dynamics },
          loudnessNorm: !!p.loudnessNorm,
          agentProfile: p,
          agentOverridden: false,
          agentStatus: "idle",
        }),
      clearAgentProfile: () => set({ agentProfile: null, agentOverridden: false, agentStatus: "idle" }),
      setAgentStatus: (st) => set({ agentStatus: st }),
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
          agentProfile: null,
          agentOverridden: false,
          agentStatus: "idle",
        }),
    }),
    {
      name: "feishin-hifi",
      storage: createJSONStorage(() => localStorage),
      // persist user preferences only — agent runtime state (last profile,
      // override flag, status) is deliberately session-local
      partialize: (s) => ({
        enabled: s.enabled,
        preamp: s.preamp,
        eqGains: s.eqGains,
        eqPreset: s.eqPreset,
        crossfeed: s.crossfeed,
        stereoWidth: s.stereoWidth,
        balance: s.balance,
        dynamics: s.dynamics,
        loudnessNorm: s.loudnessNorm,
        miniViz: s.miniViz,
        autoEq: s.autoEq,
        autoEqScope: s.autoEqScope,
      }),
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
