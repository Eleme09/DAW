import type { MasteringSettings } from "@/types/project";
import type { EffectChainDeps } from "../effects/EffectChain";
import { DYNAMICS_WORKLET_URL, createOutputGuard } from "../effects/dynamics";
import { MasteringStage } from "./MasteringStage";
import { perfJob } from "@/lib/diagnostics/perfLog";

/**
 * Runs an already-rendered mix through the mastering stage alone (and the
 * output guard, as export does). Measuring the master this way renders the
 * session once instead of once per try - the tracks' Núcleo and Fx are the
 * slow part, the master chain is cheap.
 */
export async function renderMastering(mix: AudioBuffer, settings: MasteringSettings, sampleRate = mix.sampleRate): Promise<AudioBuffer> {
  const done = perfJob("render Masterizar");
  try {
    return await render(mix, settings, sampleRate);
  } finally {
    done();
  }
}

async function render(mix: AudioBuffer, settings: MasteringSettings, sampleRate: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil((mix.length * sampleRate) / mix.sampleRate), sampleRate);
  await ctx.audioWorklet.addModule(DYNAMICS_WORKLET_URL);
  const deps: EffectChainDeps = {
    isNoiseGateWorkletLoaded: () => false,
    ensureNoiseGateWorklet: () => Promise.resolve(),
    isPitchCorrectionWorkletLoaded: () => false,
    ensurePitchCorrectionWorklet: () => Promise.resolve(),
    isAutoPitchWorkletLoaded: () => false,
    ensureAutoPitchWorklet: () => Promise.resolve(),
    isDynamicsWorkletLoaded: () => true,
    ensureDynamicsWorklet: () => Promise.resolve(),
  };
  const src = ctx.createBufferSource();
  src.buffer = mix;
  const stage = new MasteringStage(ctx, deps);
  const guard = createOutputGuard(ctx);
  src.connect(stage.input);
  stage.output.connect(guard.node);
  guard.node.connect(ctx.destination);
  stage.set(settings);
  src.start();
  return ctx.startRendering();
}
