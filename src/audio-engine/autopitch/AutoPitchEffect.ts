import type { AutoPitchSettings } from "@/types/autoPitch";
import { generateImpulseResponseSamples } from "../effects/impulseResponse";
import { resolveAutoPitch, autoPitchLatencySec, type AutoPitchReverb } from "./resolveAutoPitch";
import { workletProfiler } from "@/lib/diagnostics/workletProfiler";

/** What the worklet reports for the live view (MIDI numbers, null = none). */
export interface PitchTelemetry {
  /** Detected pitch of the voice. */
  d: number | null;
  /** Note it is being pulled to. */
  t: number | null;
  /** Pitch that comes out. */
  o: number | null;
  /** 1 while there is a voiced sound. */
  v: number;
}

export const AUTOPITCH_WORKLET_URL = `/worklets/autopitch-processor.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`;

/**
 * One track's AutoPitch stage: the autopitch-processor worklet (tuning,
 * harmony voices, vocoder, character effects - mono in, stereo out) plus a
 * convolution reverb for the presets that call for one. Sits between the
 * track's input and its Fx chain (AudioEngine/bounce), outside the chain on
 * purpose: BandLab keeps AutoPitch separate from Fx presets. The worklet
 * module must already be loaded on `ctx`.
 */
export class AutoPitchEffect {
  readonly input: AudioNode;
  readonly output: GainNode;
  private ctx: BaseAudioContext;
  private node: AudioWorkletNode;
  private convolver: ConvolverNode;
  private reverbGain: GainNode;
  private irKey: string | null = null;
  private first = true;
  private lowLatency = false;
  private lastSettings: AutoPitchSettings | null = null;
  private written = new Map<string, number>();

  /** `label` names the track in the performance diagnostic. */
  constructor(ctx: BaseAudioContext, label = "") {
    this.ctx = ctx;
    this.node = new AudioWorkletNode(ctx, "autopitch-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    });
    this.input = this.node;
    this.output = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.normalize = true;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0;
    this.node.connect(this.output);
    this.node.connect(this.convolver);
    this.convolver.connect(this.reverbGain);
    this.reverbGain.connect(this.output);
    workletProfiler.register(this.node, "nucleo", label);
  }

  /** Output delay vs. input, for clip-scheduling compensation. */
  get latencySec(): number {
    return autoPitchLatencySec(this.lowLatency, this.ctx.sampleRate);
  }

  setSettings(settings: AutoPitchSettings): void {
    // Every project change re-syncs every track (a knob on another track,
    // a fader...): the same settings object means nothing to do. It used to
    // re-schedule ~70 parameters per track each time, ~60 times a second
    // while a knob moved, and leave them all under endless automation.
    if (settings === this.lastSettings) return;
    this.lastSettings = settings;
    const { worklet, reverb } = resolveAutoPitch(settings);
    this.lowLatency = worklet.lowLatency >= 0.5;
    const t = this.ctx.currentTime;
    for (const [name, value] of Object.entries(worklet)) {
      if (this.written.get(name) === value) continue;
      this.written.set(name, value);
      const param = this.node.parameters.get(name);
      if (!param) continue;
      // First write lands at once (an offline render must be right from
      // sample zero); later ones glide 30 ms - a ramp that ends, so the
      // parameter is constant again afterwards.
      if (this.first) param.value = value;
      else {
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
        param.linearRampToValueAtTime(value, t + 0.03);
      }
    }
    this.first = false;
    this.setReverb(reverb, t);
  }

  private setReverb(reverb: AutoPitchReverb | null, t: number): void {
    if (reverb) {
      const key = `${reverb.decaySec}:${reverb.sizeType}`;
      if (key !== this.irKey) {
        const sr = this.ctx.sampleRate;
        const left = generateImpulseResponseSamples(sr, reverb.decaySec, reverb.sizeType);
        const right = generateImpulseResponseSamples(sr, reverb.decaySec, reverb.sizeType);
        const buffer = this.ctx.createBuffer(2, left.length, sr);
        buffer.copyToChannel(left, 0);
        buffer.copyToChannel(right, 1);
        this.convolver.buffer = buffer;
        this.irKey = key;
      }
    }
    this.reverbGain.gain.setTargetAtTime(reverb ? reverb.mix : 0, t, 0.02);
  }

  /** Live pitch reports (every ~17 ms while sound comes in), or null to
   * stop them - only the open panel's track pays for them. */
  watchPitch(cb: ((p: PitchTelemetry) => void) | null): void {
    this.node.port.onmessage = cb
      ? (e: MessageEvent) => {
          // the performance meter's reports share this port
          if (e.data && typeof e.data === "object" && !("prof" in e.data)) cb(e.data as PitchTelemetry);
        }
      : null;
    this.node.port.postMessage({ type: "telemetry", on: !!cb });
  }

  dispose(): void {
    workletProfiler.unregister(this.node);
    this.node.disconnect();
    this.convolver.disconnect();
    this.reverbGain.disconnect();
    this.output.disconnect();
    this.node.port.close();
  }
}
