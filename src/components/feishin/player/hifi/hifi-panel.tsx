"use client";
// Feishin rebuild — Hi-Fi Studio panel: the studio-grade sound drawer.
// Master bypass, output readout, spectrum analyzer + L/R peak meters, preamp,
// 10-band graphic EQ with presets, headphone crossfeed, stereo width, balance,
// dynamics compressor, loudness normalization. All changes apply live.
import { Fragment, useEffect, useState } from "react";
import { Power, RotateCcw, AudioWaveform, Sparkles, Loader2, BadgeCheck, Undo2, SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenuNS as DropdownMenu,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { hifiEngine, type HifiOutputInfo } from "@/lib/audio/hifi-engine";
import { useHifiStore, useHifiUi } from "@/store/hifi-store";
import { EQ_BANDS, EQ_PRESETS, EQ_PRESET_GROUPS, EQ_MIN_DB, EQ_MAX_DB, type EqPresetId } from "@/lib/audio/eq-presets";
import { reanalyzeCurrentProfile } from "./agent-auto-eq";
import { HifiVisualizer } from "./hifi-visualizer";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated,transparent)] p-4" data-hifi-section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-[var(--fg)]">{title}</h3>
        {hint ? <span className="text-[11px] text-[var(--fg-dim)]">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function HSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3", disabled && "opacity-50")}>
      <span className="w-28 shrink-0 text-[12px] text-[var(--fg)]">{label}</span>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0] ?? 0)}
        className="flex-1"
      />
      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-[var(--fg-dim)]">{format(value)}</span>
    </div>
  );
}

const DYN_MODES = [
  { id: "off", label: "Off", desc: "Untouched dynamics" },
  { id: "reference", label: "Reference", desc: "Gentle 2:1 mastering glue" },
  { id: "night", label: "Night", desc: "Heavy 6:1 — quiet-late listening" },
  { id: "club", label: "Club", desc: "4:1 punch for parties" },
  { id: "custom", label: "Custom", desc: "Dial it in yourself" },
] as const;

export function HifiPanel() {
  const open = useHifiUi((s) => s.open);
  const setOpen = useHifiUi((s) => s.setOpen);
  const s = useHifiStore();
  const [info, setInfo] = useState<HifiOutputInfo>({ available: false, sampleRate: 0, baseLatency: 0, state: "unavailable", channels: 0 });
  const activePreset = EQ_PRESETS.find((p) => p.id === s.eqPreset);

  useEffect(() => {
    if (!open) return;
    hifiEngine.resume(); // opening the panel is a user gesture — legit resume point
    const refresh = () => setInfo(hifiEngine.getOutputInfo());
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)] p-4 sm:max-w-[520px]"
        data-testid="hifi-panel"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <SheetTitle className="flex items-center gap-2 text-[15px] font-bold text-[var(--fg)]">
              <AudioWaveform size={17} className="text-[var(--primary)]" />
              Hi-Fi Studio
            </SheetTitle>
            <SheetDescription className="text-[12px] text-[var(--fg-dim)]">
              Studio-grade signal chain — everything applies live to playback.
            </SheetDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-[11px] font-semibold uppercase tracking-wide", s.enabled ? "text-[var(--primary)]" : "text-[var(--fg-dim)]")}>
              {s.enabled ? "Processing" : "Bypassed"}
            </span>
            <Switch checked={s.enabled} onCheckedChange={s.setEnabled} aria-label="Toggle DSP processing" />
          </div>
        </div>

        {/* output readout */}
        <div className="grid grid-cols-4 gap-2 text-center" data-testid="hifi-output-info">
          {[
            { k: "Engine", v: info.available ? (info.state === "running" ? "Running" : info.state) : "N/A" },
            { k: "Sample rate", v: info.available ? `${(info.sampleRate / 1000).toFixed(1)} kHz` : "—" },
            { k: "Latency", v: info.available && info.baseLatency > 0 ? `${Math.round(info.baseLatency * 1000)} ms` : "—" },
            { k: "Channels", v: info.available ? `${info.channels} ch` : "—" },
          ].map((c) => (
            <div key={c.k} className="rounded border border-[var(--border)] px-1 py-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--fg-dim)]">{c.k}</div>
              <div className="text-[12px] font-semibold tabular-nums text-[var(--fg)]">{c.v}</div>
            </div>
          ))}
        </div>

        {/* visualizer */}
        <div className="h-[150px] shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-black/30" data-testid="hifi-visualizer">
          <HifiVisualizer variant="panel" />
        </div>

        {/* agent auto-eq */}
        <Section title="Agent Auto-EQ" hint="cloud listening analysis">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className={s.autoEq ? "text-[var(--primary)]" : "text-[var(--fg-dim)]"} />
              <div>
                <div className="text-[12px] text-[var(--fg)]">Let the agent tune the sound</div>
                <div className="text-[11px] text-[var(--fg-dim)]">
                  Analyzes the {s.autoEqScope === "album" ? "album" : "track"} (genres + internet tags) and shapes EQ, imaging and dynamics to match
                </div>
              </div>
            </div>
            <Switch checked={s.autoEq} onCheckedChange={s.setAutoEq} aria-label="Agent Auto-EQ" data-testid="hifi-autoeq-switch" />
          </div>

          {s.autoEq ? (
            <>
              <div className="mb-3 flex items-center gap-1.5">
                <span className="text-[11px] text-[var(--fg-dim)]">Analyze:</span>
                {([
                  { id: "track", label: "Each track" },
                  { id: "album", label: "Whole album" },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => s.setAutoEqScope(opt.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      s.autoEqScope === opt.id
                        ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--fg-dim)] hover:bg-[var(--hover)] hover:text-[var(--fg)]",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {s.agentStatus === "analyzing" && !s.agentProfile ? (
                <div className="flex items-center gap-2 rounded border border-[var(--border)] px-3 py-2.5 text-[12px] text-[var(--fg-dim)]" data-testid="hifi-agent-analyzing">
                  <Loader2 size={13} className="animate-spin" /> Agent is listening to this {s.autoEqScope}…
                </div>
              ) : s.agentProfile ? (
                <div className="rounded border border-[var(--border)] bg-black/20 p-3" data-testid="hifi-agent-profile">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--fg)]">
                      <BadgeCheck size={14} className="text-[var(--primary)]" />
                      {s.agentProfile.name}
                      <span className="rounded bg-[var(--primary)]/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--primary)]">
                        {Math.round(s.agentProfile.confidence * 100)}%
                      </span>
                      {s.agentProfile.presetId && s.agentProfile.presetName ? (
                        <button
                          type="button"
                          title={`Curve built on the ${s.agentProfile.presetName} studio preset — click to snap to its exact gains`}
                          onClick={() => {
                            if (s.agentProfile?.presetId) s.applyPreset(s.agentProfile.presetId as EqPresetId);
                          }}
                          className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--fg-dim)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
                          data-testid="hifi-agent-preset-chip"
                        >
                          <SlidersHorizontal size={10} /> {s.agentProfile.presetName}
                        </button>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title="Ask the agent to re-analyze now"
                        onClick={() => void reanalyzeCurrentProfile()}
                        className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--fg-dim)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
                        data-testid="hifi-agent-reanalyze"
                      >
                        <RotateCcw size={11} /> Re-analyze
                      </button>
                      <button
                        type="button"
                        title="Drop the agent profile (until the next track)"
                        onClick={s.clearAgentProfile}
                        className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--fg-dim)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
                      >
                        <Undo2 size={11} /> Clear
                      </button>
                    </div>
                  </div>
                  {s.agentProfile.tags.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {s.agentProfile.tags.slice(0, 8).map((t, i) => (
                        <span key={`${t.tag}-${i}`} className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--fg-dim)]">
                          {t.tag}
                          <span className="ml-1 text-[9px] opacity-70">{t.source}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="text-[11px] leading-relaxed text-[var(--fg-dim)]">{s.agentProfile.rationale}</p>
                  {s.agentOverridden ? (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-[var(--primary)]" data-testid="hifi-agent-override">
                      <Undo2 size={11} /> Manual override active — the agent reapplies its profile on the next {s.autoEqScope === "album" ? "album" : "track"}.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded border border-[var(--border)] px-3 py-2.5 text-[12px] text-[var(--fg-dim)]">
                  Play a track — the agent will listen, fetch genre signatures from Deezer &amp; MusicBrainz, and shape the chain automatically.
                  {s.agentStatus === "error" ? " Last attempt failed (agent offline?) — it retries on the next track." : ""}
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-[var(--fg-dim)]">
              Auto-EQ is off — your manual curve stays untouched. The agent still powers bios, artwork and the internet discography.
            </p>
          )}
        </Section>

        {/* preamp + loudness */}
        <Section title="Preamp & Loudness" hint="input stage">
          <div className="flex flex-col gap-3">
            <HSlider label="Preamp" value={s.preamp} min={-12} max={12} step={0.5} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`} onChange={s.setPreamp} disabled={!s.enabled} />
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] text-[var(--fg)]">Loudness normalization</div>
                <div className="text-[11px] text-[var(--fg-dim)]">Gently evens volume across tracks (~−19 dBFS target)</div>
              </div>
              <Switch checked={s.loudnessNorm} onCheckedChange={s.setLoudnessNorm} aria-label="Loudness normalization" />
            </div>
          </div>
        </Section>

        {/* equalizer */}
        <Section title="Graphic Equalizer" hint={activePreset ? activePreset.description : "custom curve — ±12 dB, ISO octaves"}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button type="button" className="rounded border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-[var(--fg)] hover:bg-[var(--hover)]" data-testid="hifi-eq-preset">
                  {activePreset ? activePreset.name : "Custom"}
                  <span className="ml-1 text-[var(--fg-dim)]">▾</span>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="start" sideOffset={6} className="fs-menu-content max-h-80 overflow-y-auto">
                  {EQ_PRESET_GROUPS.map((group) => (
                    <Fragment key={group.id}>
                      <DropdownMenu.Label className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--fg-dim)]/80">
                        {group.label}
                      </DropdownMenu.Label>
                      {group.presets.map((p) => (
                        <DropdownMenu.Item key={p.id} onSelect={() => s.applyPreset(p.id)} className="flex flex-col items-start">
                          <span className="text-[12px] font-semibold">{p.name}</span>
                          <span className="text-[10px] text-[var(--fg-dim)]">{p.description}</span>
                        </DropdownMenu.Item>
                      ))}
                    </Fragment>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <button
              type="button"
              onClick={() => s.applyPreset("flat")}
              className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1.5 text-[11px] text-[var(--fg-dim)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
            >
              <RotateCcw size={11} /> Flat
            </button>
          </div>
          <div className="flex items-stretch justify-between gap-1 px-1" data-testid="hifi-eq">
            {EQ_BANDS.map((band, i) => (
              <div key={band.freq} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className={cn("text-[9px] tabular-nums", (s.eqGains[i] ?? 0) !== 0 ? "text-[var(--primary)]" : "text-[var(--fg-dim)]")}>
                  {(s.eqGains[i] ?? 0) > 0 ? "+" : ""}
                  {(s.eqGains[i] ?? 0).toFixed(1)}
                </span>
                <div className="flex h-36 items-center justify-center">
                  <Slider
                    aria-label={`${band.label} Hz band`}
                    orientation="vertical"
                    value={[s.eqGains[i] ?? 0]}
                    min={EQ_MIN_DB}
                    max={EQ_MAX_DB}
                    step={0.5}
                    disabled={!s.enabled}
                    onValueChange={(v) => s.setBandGain(i, v[0] ?? 0)}
                    className="h-full"
                  />
                </div>
                <span className="text-[9px] text-[var(--fg-dim)]">{band.label}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* imaging */}
        <Section title="Stereo Imaging" hint="headphone-friendly">
          <div className="flex flex-col gap-3">
            <HSlider label="Crossfeed" value={s.crossfeed} min={0} max={1} step={0.01} format={(v) => (v === 0 ? "Off" : `${Math.round(v * 100)}%`)} onChange={s.setCrossfeed} disabled={!s.enabled} />
            <HSlider label="Stereo width" value={s.stereoWidth} min={0} max={2} step={0.05} format={(v) => (v === 0 ? "Mono" : v === 1 ? "Normal" : `${Math.round(v * 100)}%`)} onChange={s.setStereoWidth} disabled={!s.enabled} />
            <HSlider label="Balance" value={s.balance} min={-1} max={1} step={0.05} format={(v) => (v === 0 ? "Center" : v < 0 ? `L ${Math.round(-v * 100)}` : `R ${Math.round(v * 100)}`)} onChange={s.setBalance} disabled={!s.enabled} />
          </div>
        </Section>

        {/* dynamics */}
        <Section title="Dynamics" hint="compressor → makeup">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {DYN_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.desc}
                onClick={() => s.setDynamics({ mode: m.id })}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  s.dynamics.mode === m.id
                    ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--fg-dim)] hover:bg-[var(--hover)] hover:text-[var(--fg)]",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {s.dynamics.mode === "custom" ? (
            <div className="flex flex-col gap-3">
              <HSlider label="Threshold" value={s.dynamics.threshold} min={-60} max={0} step={1} format={(v) => `${v} dB`} onChange={(v) => s.setDynamics({ threshold: v })} disabled={!s.enabled} />
              <HSlider label="Ratio" value={s.dynamics.ratio} min={1} max={20} step={0.5} format={(v) => `${v.toFixed(1)}:1`} onChange={(v) => s.setDynamics({ ratio: v })} disabled={!s.enabled} />
              <HSlider label="Attack" value={s.dynamics.attack} min={0.001} max={0.2} step={0.001} format={(v) => `${(v * 1000).toFixed(0)} ms`} onChange={(v) => s.setDynamics({ attack: v })} disabled={!s.enabled} />
              <HSlider label="Release" value={s.dynamics.release} min={0.05} max={1} step={0.01} format={(v) => `${(v * 1000).toFixed(0)} ms`} onChange={(v) => s.setDynamics({ release: v })} disabled={!s.enabled} />
              <HSlider label="Makeup gain" value={s.dynamics.makeup} min={-6} max={12} step={0.5} format={(v) => `+${v.toFixed(1)} dB`} onChange={(v) => s.setDynamics({ makeup: v })} disabled={!s.enabled} />
            </div>
          ) : (
            <p className="text-[11px] text-[var(--fg-dim)]">
              {DYN_MODES.find((m) => m.id === s.dynamics.mode)?.desc} — pick <em>Custom</em> for full control of threshold, ratio, attack, release and makeup.
            </p>
          )}
        </Section>

        {/* footer */}
        <div className="flex items-center justify-between gap-2 pb-2">
          <div className="flex items-center gap-2 text-[11px] text-[var(--fg-dim)]">
            <Power size={11} className={s.enabled ? "text-[var(--primary)]" : ""} />
            {s.enabled ? "DSP chain active" : "Bypass — bit-perfect direct output"}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--fg-dim)] hover:text-[var(--fg)]">
              <Switch checked={s.miniViz} onCheckedChange={s.setMiniViz} aria-label="Mini visualizer in player bar" />
              mini viz
            </label>
            <button
              type="button"
              onClick={s.resetAll}
              className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1.5 text-[11px] text-[var(--fg-dim)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
            >
              <RotateCcw size={11} /> Reset all
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
