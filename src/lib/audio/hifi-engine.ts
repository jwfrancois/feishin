// Feishin rebuild — Hi-Fi studio DSP engine (Web Audio API, singleton).
//
// Signal chain (all native AudioNodes, no worklets):
//   <audio> ──► MediaElementSource ─┬─► bypass ────────────────────────────────► out
//                                   └─► preamp → 10-band EQ → crossfeed →
//                                       stereo width (M/S) → balance →
//                                       dynamics compressor → makeup →
//                                       loudness-norm gain → master ──► out
//                                                                  └─► analysers (spectrum + L/R meters)
//
// The engine subscribes to useHifiStore and applies every change to live nodes
// with short smoothing ramps so slider drags are click-free. Bypass switches
// between the two paths (bit-perfect direct route vs. processed chain).
"use client";

import { useHifiStore } from "@/store/hifi-store";
import { EQ_BANDS } from "./eq-presets";

const LOUDNESS_TARGET_RMS = 0.112; // ≈ -19 dBFS — comfortable streaming reference
const CROSSFEED_DELAY_S = 0.00027; // ~0.3 ms — classic shaper for headphone imaging
const CROSSFEED_LOWPASS_HZ = 750;

export interface HifiOutputInfo {
  available: boolean;
  sampleRate: number;
  baseLatency: number;
  state: AudioContextState | "unavailable";
  channels: number;
}

class HifiEngine {
  private ctx: AudioContext | null = null;
  private sourceMap = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
  private attachedEl: HTMLAudioElement | null = null;
  private built = false;

  // chain nodes
  private preamp!: GainNode;
  private stereoize!: GainNode;
  private eq: BiquadFilterNode[] = [];
  private cfDirectL!: GainNode;
  private cfDirectR!: GainNode;
  private cfCrossL!: GainNode; // R feeding L
  private cfCrossR!: GainNode; // L feeding R
  private sideWidth!: GainNode;
  private panner!: StereoPannerNode;
  private compressor!: DynamicsCompressorNode;
  private makeup!: GainNode;
  private normGain!: GainNode;
  private master!: GainNode;
  private bypass!: GainNode;

  // analysis
  private spectrum!: AnalyserNode;
  private analyserL!: AnalyserNode;
  private analyserR!: AnalyserNode;

  private specData: Float32Array<ArrayBuffer> | null = null;
  private meterDataL: Float32Array<ArrayBuffer> | null = null;
  private meterDataR: Float32Array<ArrayBuffer> | null = null;
  private normTimer: ReturnType<typeof setInterval> | null = null;
  private unsub: (() => void) | null = null;

  /** Attach the DSP graph to an <audio> element (safe to call on every mount). */
  attach(el: HTMLAudioElement): void {
    if (typeof window === "undefined") return;
    this.attachedEl = el;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor({ latencyHint: "playback" });
      } catch {
        return;
      }
    }
    // createMediaElementSource throws if called twice on the same element — cache it
    let source = this.sourceMap.get(el);
    if (!source) {
      try {
        source = this.ctx.createMediaElementSource(el);
        this.sourceMap.set(el, source);
      } catch {
        return;
      }
    }
    if (!this.built) this.buildGraph();
    source.connect(this.preamp);
    source.connect(this.bypass);
    el.addEventListener("play", this.handlePlay);
    if (!this.unsub) this.unsub = useHifiStore.subscribe(() => this.applySettings());
    this.applySettings();
  }

  /** Resume the context (needs a user gesture — called from play + panel open). */
  resume(): void {
    void this.ctx?.resume().catch(() => {});
  }

  getOutputInfo(): HifiOutputInfo {
    if (!this.ctx) {
      return { available: false, sampleRate: 0, baseLatency: 0, state: "unavailable", channels: 0 };
    }
    return {
      available: true,
      sampleRate: this.ctx.sampleRate,
      baseLatency: this.ctx.baseLatency ?? 0,
      state: this.ctx.state,
      channels: this.ctx.destination.maxChannelCount,
    };
  }

  // ---- analysis buffers for the visualizer ---------------------------------

  getSpectrum(out: Float32Array): boolean {
    if (!this.spectrum) return false;
    if (!this.specData || this.specData.length !== this.spectrum.frequencyBinCount) {
      this.specData = new Float32Array(this.spectrum.frequencyBinCount);
    }
    this.spectrum.getFloatFrequencyData(this.specData);
    const n = Math.min(out.length, this.specData.length);
    for (let i = 0; i < n; i++) out[i] = this.specData[i];
    return true;
  }

  getLevels(): { left: number; right: number; valid: boolean } {
    const al = this.analyserL;
    const ar = this.analyserR;
    if (!al || !ar) return { left: 0, right: 0, valid: false };
    if (!this.meterDataL || !this.meterDataR || this.meterDataL.length !== al.fftSize) {
      this.meterDataL = new Float32Array(al.fftSize);
      this.meterDataR = new Float32Array(ar.fftSize);
    }
    al.getFloatTimeDomainData(this.meterDataL);
    ar.getFloatTimeDomainData(this.meterDataR);
    let l = 0;
    let r = 0;
    for (let i = 0; i < this.meterDataL.length; i++) {
      const absL = Math.abs(this.meterDataL[i]);
      const absR = Math.abs(this.meterDataR[i]);
      if (absL > l) l = absL;
      if (absR > r) r = absR;
    }
    return { left: l, right: r, valid: true };
  }

  // ---- internals ------------------------------------------------------------

  private handlePlay = () => {
    this.resume();
    this.startNormLoop();
  };

  private buildGraph(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    this.preamp = ctx.createGain();
    // force a stable stereo layout before the splitting stages (mono files upmix)
    this.stereoize = ctx.createGain();
    this.stereoize.channelCount = 2;
    this.stereoize.channelCountMode = "explicit";
    this.stereoize.channelInterpretation = "speakers";

    // 10-band graphic EQ — peaking filters at ISO octave centers
    this.eq = EQ_BANDS.map((band) => {
      const f = ctx.createBiquadFilter();
      f.type = "peaking";
      f.frequency.value = Math.min(band.freq, ctx.sampleRate / 2 - 1000);
      f.Q.value = 1.41;
      f.gain.value = 0;
      return f;
    });

    // ---- crossfeed (bs2b-flavored: delayed + lowpassed opposite channel) ----
    const cfSplit = ctx.createChannelSplitter(2);
    const cfMerge = ctx.createChannelMerger(2);
    this.cfDirectL = ctx.createGain();
    this.cfDirectR = ctx.createGain();
    this.cfCrossL = ctx.createGain(); // right channel feeding left ear
    this.cfCrossR = ctx.createGain(); // left channel feeding right ear
    this.cfCrossL.gain.value = 0;
    this.cfCrossR.gain.value = 0;
    const delayL = ctx.createDelay(0.002);
    delayL.delayTime.value = CROSSFEED_DELAY_S;
    const delayR = ctx.createDelay(0.002);
    delayR.delayTime.value = CROSSFEED_DELAY_S;
    const lpL = ctx.createBiquadFilter();
    lpL.type = "lowpass";
    lpL.frequency.value = CROSSFEED_LOWPASS_HZ;
    const lpR = ctx.createBiquadFilter();
    lpR.type = "lowpass";
    lpR.frequency.value = CROSSFEED_LOWPASS_HZ;

    cfSplit.connect(this.cfDirectL, 0);
    cfSplit.connect(this.cfDirectR, 1);
    this.cfDirectL.connect(cfMerge, 0, 0);
    this.cfDirectR.connect(cfMerge, 0, 1);
    // R → (delay → lowpass → level) → L ear ; L → … → R ear
    cfSplit.connect(delayL, 1);
    delayL.connect(lpL);
    lpL.connect(this.cfCrossL);
    this.cfCrossL.connect(cfMerge, 0, 0);
    cfSplit.connect(delayR, 0);
    delayR.connect(lpR);
    lpR.connect(this.cfCrossR);
    this.cfCrossR.connect(cfMerge, 0, 1);

    // ---- stereo width via mid/side matrix ----------------------------------
    const wSplit = ctx.createChannelSplitter(2);
    const wMerge = ctx.createChannelMerger(2);
    const mid = ctx.createGain();
    mid.gain.value = 0.5;
    const side = ctx.createGain();
    side.gain.value = 0.5;
    const sideInv = ctx.createGain();
    sideInv.gain.value = -0.5;
    this.sideWidth = ctx.createGain();
    const sideNeg = ctx.createGain();
    sideNeg.gain.value = -1;

    cfMerge.connect(wSplit);
    wSplit.connect(mid, 0);
    wSplit.connect(mid, 1); // mid = (L + R) / 2
    wSplit.connect(side, 0);
    wSplit.connect(sideInv, 1); // side = (L − R) / 2
    sideInv.connect(side);
    side.connect(this.sideWidth);
    // out L = mid + side ; out R = mid − side
    mid.connect(wMerge, 0, 0);
    this.sideWidth.connect(wMerge, 0, 0);
    mid.connect(wMerge, 0, 1);
    this.sideWidth.connect(sideNeg);
    sideNeg.connect(wMerge, 0, 1);

    // ---- balance, dynamics, loudness norm, master ---------------------------
    this.panner = ctx.createStereoPanner();
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.knee.value = 24;
    this.makeup = ctx.createGain();
    this.normGain = ctx.createGain();
    this.master = ctx.createGain();
    this.bypass = ctx.createGain();
    this.bypass.gain.value = 0;

    let node: AudioNode = this.stereoize;
    this.preamp.connect(node);
    for (const f of this.eq) {
      node.connect(f);
      node = f;
    }
    node.connect(cfSplit);
    wMerge.connect(this.panner);
    this.panner.connect(this.compressor);
    this.compressor.connect(this.makeup);
    this.makeup.connect(this.normGain);
    this.normGain.connect(this.master);
    this.master.connect(ctx.destination);

    // ---- analysers (post-chain, feed the visualizer) ------------------------
    this.spectrum = ctx.createAnalyser();
    this.spectrum.fftSize = 2048;
    this.spectrum.smoothingTimeConstant = 0.82;
    this.spectrum.minDecibels = -95;
    this.master.connect(this.spectrum);
    this.bypass.connect(this.spectrum); // keep the visualizer alive in bypass mode

    this.analyserL = ctx.createAnalyser();
    this.analyserR = ctx.createAnalyser();
    this.analyserL.fftSize = 1024;
    this.analyserR.fftSize = 1024;
    this.analyserL.smoothingTimeConstant = 0.4;
    this.analyserR.smoothingTimeConstant = 0.4;
    const meterSplit = ctx.createChannelSplitter(2);
    this.master.connect(meterSplit);
    meterSplit.connect(this.analyserL, 0);
    meterSplit.connect(this.analyserR, 1);

    this.built = true;
  }

  private applySettings(): void {
    const ctx = this.ctx;
    if (!ctx || !this.built) return;
    const s = useHifiStore.getState();
    const t = ctx.currentTime;
    const ramp = (p: AudioParam, v: number, tau = 0.02) => p.setTargetAtTime(v, t, tau);

    ramp(this.preamp.gain, Math.pow(10, s.preamp / 20));
    s.eqGains.forEach((gain, i) => this.eq[i] && ramp(this.eq[i].gain, Math.max(-12, Math.min(12, gain)), 0.03));

    // crossfeed: opposite-channel level rises, direct level dips to keep loudness stable
    const cf = s.crossfeed;
    ramp(this.cfCrossL.gain, cf * 0.5);
    ramp(this.cfCrossR.gain, cf * 0.5);
    ramp(this.cfDirectL.gain, 1 - 0.22 * cf);
    ramp(this.cfDirectR.gain, 1 - 0.22 * cf);

    ramp(this.sideWidth.gain, s.stereoWidth);
    ramp(this.panner.pan, s.balance);

    const d = s.dynamics;
    if (d.mode === "off") {
      ramp(this.compressor.threshold, 0);
      ramp(this.compressor.ratio, 1);
      ramp(this.compressor.attack, 0.003);
      ramp(this.compressor.release, 0.25);
      ramp(this.makeup.gain, 1);
    } else {
      ramp(this.compressor.threshold, d.threshold);
      ramp(this.compressor.ratio, d.ratio);
      ramp(this.compressor.attack, d.attack);
      ramp(this.compressor.release, d.release);
      // classic static make-up estimate: half the gain reduction at threshold
      const auto = d.threshold < 0 ? (-d.threshold * (1 - 1 / d.ratio) * 0.5) : 0;
      const total = Math.max(-12, Math.min(12, auto + d.makeup));
      ramp(this.makeup.gain, Math.pow(10, total / 20));
    }

    if (!s.loudnessNorm) ramp(this.normGain.gain, 1, 0.3);
    ramp(this.master.gain, 1);
    // path switch: processed chain vs bit-perfect bypass
    if (s.enabled) {
      ramp(this.bypass.gain, 0, 0.015);
    } else {
      ramp(this.bypass.gain, 1, 0.015);
    }
    // mute/unmute the chain entry so both paths never double-feed the output
    ramp(this.stereoize.gain, s.enabled ? 1 : 0, 0.015);
    this.startNormLoop();
  }

  private startNormLoop(): void {
    if (this.normTimer) return;
    this.normTimer = setInterval(() => {
      const s = useHifiStore.getState();
      if (!this.ctx || !this.built || !s.loudnessNorm || !s.enabled) return;
      if (!this.analyserL) return;
      const buf = new Float32Array(this.analyserL.fftSize);
      this.analyserL.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      if (rms < 1e-5) return; // silence — don't chase gain
      const target = LOUDNESS_TARGET_RMS;
      const gain = Math.max(0.2, Math.min(5, target / rms));
      this.normGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.6);
    }, 450);
  }
}

export const hifiEngine = new HifiEngine();
