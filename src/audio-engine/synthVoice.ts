import { midiToFrequency } from "./pitch/noteUtils";
import type { Instrument, Note } from "@/types/project";

/**
 * Schedules one synth/sampler voice: a shared ADSR amplitude envelope over
 * either an oscillator (synth) or a pitch-shifted sample playback
 * (sampler). Engine-agnostic (BaseAudioContext) so the live engine and the
 * offline bounce renderer share this one implementation instead of two
 * copies that could drift apart - a bounced export should always match
 * what was actually heard during playback.
 *
 * Returns the created source node (so a caller that needs to track/stop it
 * can), or null if a sampler voice has no assigned sample to play.
 */
export function scheduleVoice(
  ctx: BaseAudioContext,
  instrument: Instrument,
  note: Note,
  destination: AudioNode,
  when: number,
  getBuffer: (sampleId: string) => AudioBuffer | undefined
): AudioScheduledSourceNode | null {
  const peak = Math.max(0.0001, Math.min(1, note.velocity));
  const attack = Math.max(0.001, instrument.attack);
  const decay = Math.max(0, instrument.decay);
  const sustainLevel = peak * Math.max(0, Math.min(1, instrument.sustain));
  const release = Math.max(0.001, instrument.release);

  const attackEnd = when + attack;
  const decayEnd = attackEnd + decay;
  const noteOff = Math.max(decayEnd, when + note.duration);
  const releaseEnd = noteOff + release;

  const envelope = ctx.createGain();
  envelope.connect(destination);
  envelope.gain.setValueAtTime(0, when);
  envelope.gain.linearRampToValueAtTime(peak, attackEnd);
  envelope.gain.linearRampToValueAtTime(sustainLevel, decayEnd);
  envelope.gain.setValueAtTime(sustainLevel, noteOff);
  envelope.gain.linearRampToValueAtTime(0, releaseEnd);

  if (instrument.type === "synth") {
    const osc = ctx.createOscillator();
    osc.type = instrument.waveform;
    osc.frequency.value = midiToFrequency(note.pitch);
    osc.connect(envelope);
    osc.start(when);
    osc.stop(releaseEnd + 0.05);
    return osc;
  }

  const buffer = instrument.sampleId ? getBuffer(instrument.sampleId) : undefined;
  if (!buffer) {
    envelope.disconnect();
    return null;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = Math.pow(2, (note.pitch - instrument.rootNote) / 12);
  source.connect(envelope);
  source.start(when);
  source.stop(releaseEnd + 0.05);
  return source;
}
