import { midiToFrequency } from "../pitch/noteUtils";
import { createRng } from "./rng";
import type { BassNoteEvent, ChordEvent, DrumHitEvent, GeneratedBeat, MelodyNoteEvent } from "@/types/beatGen";

/**
 * Renders a GeneratedBeat's note/hit events into actual audio — four
 * separate stereo AudioBuffers (drums/bass/chords/melody), one per
 * generated track, via OfflineAudioContext. This is the
 * OfflineAudioContext-dependent half (see bounce.ts for the same split
 * elsewhere in this codebase) — not unit-tested, verified via Playwright.
 *
 * **Honesty note, stated plainly rather than left implicit**: every
 * instrument here is a simple synthesized placeholder (sine/saw/triangle
 * oscillators, filtered noise for drums) built from stock Web Audio nodes
 * — there are no sample-based drums/instruments. This is a rough sketch
 * meant to be mixed/replaced/layered in the DAW afterward (per the
 * brief's "editable in the DAW afterward"), not a claim of
 * production-quality sound design.
 */

const TAIL_SEC = 1;

function hashBeat(beat: GeneratedBeat): number {
  const s = `${beat.bpm}:${beat.key}:${beat.scale}:${beat.genre}:${beat.mood}:${beat.bars}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function beatsToSec(beats: number, bpm: number): number {
  return beats * (60 / bpm);
}

function totalDurationSec(beat: GeneratedBeat): number {
  return beatsToSec(beat.bars * 4, beat.bpm) + TAIL_SEC;
}

/** A deterministic (seeded) white-noise buffer — same seed, same texture, consistent with the rest of generate/. */
function createNoiseBuffer(ctx: BaseAudioContext, durationSec: number, rng: () => number): AudioBuffer {
  const length = Math.max(1, Math.floor(durationSec * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
  return buffer;
}

function rampDownTo(param: AudioParam, target: number, atTime: number) {
  param.exponentialRampToValueAtTime(Math.max(target, 0.0001), atTime);
}

function synthKick(ctx: BaseAudioContext, destination: AudioNode, t: number, velocity: number): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.09);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 1.0, t);
  rampDownTo(gain.gain, 0.0001, t + 0.18);

  osc.connect(gain);
  gain.connect(destination);
  osc.start(t);
  osc.stop(t + 0.2);
}

function synthSnare(ctx: BaseAudioContext, destination: AudioNode, t: number, velocity: number, rng: () => number): void {
  const noiseDur = 0.16;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, noiseDur, rng);
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1800;
  bandpass.Q.value = 0.8;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(velocity * 0.8, t);
  rampDownTo(noiseGain.gain, 0.0001, t + noiseDur);
  noise.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(destination);
  noise.start(t);

  const tone = ctx.createOscillator();
  tone.type = "triangle";
  tone.frequency.value = 180;
  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(velocity * 0.5, t);
  rampDownTo(toneGain.gain, 0.0001, t + 0.08);
  tone.connect(toneGain);
  toneGain.connect(destination);
  tone.start(t);
  tone.stop(t + 0.1);
}

function synthHat(
  ctx: BaseAudioContext,
  destination: AudioNode,
  t: number,
  velocity: number,
  open: boolean,
  rng: () => number
): void {
  const dur = open ? 0.28 : 0.06;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, dur, rng);
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 7000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(velocity * 0.5, t);
  rampDownTo(gain.gain, 0.0001, t + dur);
  noise.connect(highpass);
  highpass.connect(gain);
  gain.connect(destination);
  noise.start(t);
}

export function synthDrums(ctx: BaseAudioContext, destination: AudioNode, events: DrumHitEvent[], bpm: number, rng: () => number): void {
  for (const e of events) {
    const t = beatsToSec(e.startBeat, bpm);
    if (e.type === "kick") synthKick(ctx, destination, t, e.velocity);
    else if (e.type === "snare") synthSnare(ctx, destination, t, e.velocity, rng);
    else synthHat(ctx, destination, t, e.velocity, e.type === "openhat", rng);
  }
}

export function synthBass(ctx: BaseAudioContext, destination: AudioNode, events: BassNoteEvent[], bpm: number): void {
  for (const e of events) {
    const t = beatsToSec(e.startBeat, bpm);
    const lengthSec = beatsToSec(e.lengthBeats, bpm);
    const releaseSec = Math.min(0.08, lengthSec * 0.3);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = midiToFrequency(e.midi);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    filter.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(e.velocity * 0.9, t + 0.01);
    gain.gain.setValueAtTime(e.velocity * 0.9, t + Math.max(0.01, lengthSec - releaseSec));
    rampDownTo(gain.gain, 0.0001, t + lengthSec);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    osc.start(t);
    osc.stop(t + lengthSec + 0.02);
  }
}

export function synthChords(ctx: BaseAudioContext, destination: AudioNode, chords: ChordEvent[], bpm: number): void {
  for (const chord of chords) {
    const t = beatsToSec(chord.startBeat, bpm);
    const lengthSec = beatsToSec(chord.lengthBeats, bpm);
    const attack = 0.15;
    const release = 0.3;

    const chordGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 3000;
    chordGain.connect(filter);
    filter.connect(destination);

    for (const midi of chord.notesMidi) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = midiToFrequency(midi);

      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(0, t);
      voiceGain.gain.linearRampToValueAtTime(0.18, t + attack);
      voiceGain.gain.setValueAtTime(0.18, t + Math.max(attack, lengthSec - release));
      rampDownTo(voiceGain.gain, 0.0001, t + lengthSec);

      osc.connect(voiceGain);
      voiceGain.connect(chordGain);
      osc.start(t);
      osc.stop(t + lengthSec + 0.05);
    }
  }
}

function synthMelody(ctx: BaseAudioContext, destination: AudioNode, notes: MelodyNoteEvent[], bpm: number): void {
  for (const n of notes) {
    const t = beatsToSec(n.startBeat, bpm);
    const lengthSec = beatsToSec(n.lengthBeats, bpm);
    const decaySec = Math.min(lengthSec, 0.35);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiToFrequency(n.midi);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(n.velocity * 0.7, t);
    rampDownTo(gain.gain, 0.0001, t + decaySec);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(t);
    osc.stop(t + decaySec + 0.05);
  }
}

export interface SynthesizedBeat {
  drums: AudioBuffer;
  bass: AudioBuffer;
  chords: AudioBuffer;
  melody: AudioBuffer;
}

export async function renderStem(
  durationSec: number,
  sampleRate: number,
  render: (ctx: OfflineAudioContext, destination: AudioNode) => void
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(durationSec * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  render(ctx, master);
  return ctx.startRendering();
}

export async function synthesizeBeat(beat: GeneratedBeat, sampleRate = 44100): Promise<SynthesizedBeat> {
  const durationSec = totalDurationSec(beat);
  const seed = hashBeat(beat);

  const [drums, bass, chords, melody] = await Promise.all([
    renderStem(durationSec, sampleRate, (ctx, dest) => synthDrums(ctx, dest, beat.drums, beat.bpm, createRng(seed))),
    renderStem(durationSec, sampleRate, (ctx, dest) => synthBass(ctx, dest, beat.bass, beat.bpm)),
    renderStem(durationSec, sampleRate, (ctx, dest) => synthChords(ctx, dest, beat.chords, beat.bpm)),
    renderStem(durationSec, sampleRate, (ctx, dest) => synthMelody(ctx, dest, beat.melody, beat.bpm)),
  ]);

  return { drums, bass, chords, melody };
}

export interface SynthesizedReconstruction {
  drums: AudioBuffer;
  bass: AudioBuffer;
  chords: AudioBuffer;
}

/**
 * Renders Phase 12's reconstructed events (reconstructBeat.ts) using the
 * exact same instrument synths as generation — no melody stem, since
 * reconstruction has no melody events to render (see reconstructBeat.ts's
 * header comment for why).
 */
export async function synthesizeReconstruction(
  bpm: number,
  drums: DrumHitEvent[],
  bass: BassNoteEvent[],
  chords: ChordEvent[],
  durationSec: number,
  sampleRate = 44100,
  seed = 0
): Promise<SynthesizedReconstruction> {
  const total = durationSec + TAIL_SEC;
  const [drumsBuf, bassBuf, chordsBuf] = await Promise.all([
    renderStem(total, sampleRate, (ctx, dest) => synthDrums(ctx, dest, drums, bpm, createRng(seed))),
    renderStem(total, sampleRate, (ctx, dest) => synthBass(ctx, dest, bass, bpm)),
    renderStem(total, sampleRate, (ctx, dest) => synthChords(ctx, dest, chords, bpm)),
  ]);
  return { drums: drumsBuf, bass: bassBuf, chords: chordsBuf };
}
