import { bounceProject, type BounceOptions } from "../bounce";
import { mixToMono } from "../audioBufferUtils";
import { computeIntegratedLufs } from "../bs1770";
import { analyzeDynamics } from "./dynamicsAnalysis";
import { computeAveragePowerSpectrum, VOCAL_BANDS } from "./spectralAnalysis";
import { analyzeVocalChannel } from "./vocalAnalysis";
import { detectGainStaging, detectMasking } from "./mixDiagnostics";
import { buildGainStagingSuggestions, buildMaskingSuggestions } from "./mixSuggestions";
import type { MixAnalysisResult, TrackBandProfile } from "@/types/mixAnalysis";
import type { Project } from "@/types/project";

/**
 * Session-wide "AI Mix Assistant" diagnostics (Phase 10). This is the
 * OfflineAudioContext-dependent glue: it renders the project (via
 * bounce.ts) once for the full mix and once more per track (soloed, to
 * measure that track's own contribution), then hands the resulting
 * numbers to the pure logic in mixDiagnostics.ts/mixSuggestions.ts. Not
 * unit-tested for the same reason bounce.ts isn't — it needs a real
 * OfflineAudioContext; verified via Playwright instead. The actual
 * detection/suggestion logic this calls into IS unit-tested, directly,
 * with synthetic profiles.
 *
 * Cost note, stated plainly rather than discovered the hard way: this
 * renders the project N+1 times (once per track, once for the full mix),
 * so run time scales with track count and project length. Fine for a
 * personal-project track count; would need a smarter approach (e.g.
 * analyzing pre-mix buffers directly instead of re-rendering) if this
 * DAW ever needed to handle large multitrack sessions.
 */

const FRAME_SIZE = 2048; // matches spectralAnalysis.ts's own default

function computeBandShares(mono: Float32Array, sampleRate: number): Record<string, number> {
  const powerSpectrum = computeAveragePowerSpectrum(mono, FRAME_SIZE);
  const binHz = sampleRate / FRAME_SIZE;
  let total = 0;
  for (let i = 0; i < powerSpectrum.length; i++) total += powerSpectrum[i];

  const shares: Record<string, number> = {};
  for (const band of VOCAL_BANDS) {
    const startBin = Math.max(0, Math.floor(band.minHz / binHz));
    const endBin = Math.min(powerSpectrum.length, Math.ceil(band.maxHz / binHz));
    let bandPower = 0;
    for (let i = startBin; i < Math.max(startBin + 1, endBin); i++) bandPower += powerSpectrum[i] ?? 0;
    shares[band.name] = total > 0 ? bandPower / total : 0;
  }
  return shares;
}

export async function analyzeMix(
  project: Project,
  getBuffer: (sampleId: string) => AudioBuffer | undefined,
  options: BounceOptions = {}
): Promise<MixAnalysisResult> {
  const tracksWithClips = project.tracks.filter((t) => t.clips.length > 0 || t.midiClips.length > 0);

  const fullMix = await bounceProject(project, getBuffer, options);
  const fullMixMono = mixToMono(fullMix);
  const mixRead = analyzeVocalChannel(fullMixMono, fullMix.sampleRate);

  const profiles: TrackBandProfile[] = [];
  for (const track of tracksWithClips) {
    const soloProject: Project = {
      ...project,
      tracks: project.tracks.map((t) => ({ ...t, solo: t.id === track.id })),
    };
    const rendered = await bounceProject(soloProject, getBuffer, options);
    const mono = mixToMono(rendered);
    const dynamics = analyzeDynamics(mono, rendered.sampleRate);
    const isSilent = !Number.isFinite(dynamics.rmsDb) || dynamics.rmsDb < -80;
    profiles.push({
      trackId: track.id,
      trackName: track.name,
      rmsDb: dynamics.rmsDb,
      bandShares: isSilent ? null : computeBandShares(mono, rendered.sampleRate),
    });
  }

  const masking = detectMasking(profiles);
  const gainStaging = detectGainStaging(profiles);

  const limitations = [...mixRead.limitations];
  if (tracksWithClips.length < 2) {
    limitations.push(
      `El chequeo de enmascaramiento y niveles de ganancia necesita al menos dos pistas con audio — se encontraron ${tracksWithClips.length}.`
    );
  }
  limitations.push(
    "Los umbrales de severidad de barro/aspereza/sibilancia/graves se calibraron para una grabación " +
      "vocal en solitario (Fase 4), no para una mezcla completa multi-instrumento — trata esta lectura " +
      "como una guía aproximada sobre la señal sumada, no un estándar específico de mezcla."
  );

  return {
    mix: {
      mud: mixRead.mud,
      harshness: mixRead.harshness,
      sibilance: mixRead.sibilance,
      lowEnd: mixRead.lowEnd,
      dynamicRangeDb: mixRead.metrics.dynamicRangeDb,
      peakDb: mixRead.metrics.peakDb,
      rmsDb: mixRead.metrics.rmsDb,
      integratedLufs: computeIntegratedLufs(fullMixMono, fullMix.sampleRate),
    },
    tracks: profiles,
    masking,
    gainStaging,
    suggestions: [...buildMaskingSuggestions(masking), ...buildGainStagingSuggestions(gainStaging)],
    limitations,
  };
}
