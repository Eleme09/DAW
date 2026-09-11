import { createEffectInstance, type EffectInstance, type EffectType } from "@/types/effects";
import type { AssistantAction } from "@/types/assistant";

/**
 * Turns an effect-shaping AssistantAction into a track's next insert
 * chain. Track-field actions (volume/pan/mute/solo) aren't handled here —
 * those apply directly via the store's updateTrack, same as a manual
 * fader move. Pure and unit-tested, independent of the store, so the
 * "what does this action actually do to the chain" logic is verifiable
 * without a live project.
 *
 * Repeated commands update the existing effect of that type in place
 * (find it, replace its params) rather than stacking duplicates — the
 * one exception is EQ, which is additive by nature: `addEqBand` always
 * appends a new band to the track's (single) EQ effect, creating one if
 * none exists yet, the same way a human would keep shaping the same EQ
 * rather than inserting a fresh EQ per adjustment.
 */
export function applyEffectAction(inserts: EffectInstance[], action: AssistantAction): EffectInstance[] {
  switch (action.kind) {
    case "addEqBand":
      return addEqBand(inserts, action);
    case "setCompressor":
      return upsertByType(inserts, "compressor", (existing) => ({
        thresholdDb: action.thresholdDb,
        ratio: action.ratio,
        attackMs: action.attackMs,
        releaseMs: action.releaseMs,
        kneeDb: existing?.type === "compressor" ? existing.params.kneeDb : 6,
        makeupDb: action.makeupDb,
      }));
    case "setReverb":
      return upsertByType(inserts, "reverb", () => ({
        mix: action.mix,
        decaySec: action.decaySec,
        sizeType: action.sizeType,
      }));
    case "setDelay":
      return upsertByType(inserts, "delay", (existing) => ({
        timeMs: action.timeMs,
        feedback: action.feedback,
        mix: action.mix,
        filterFreq: existing?.type === "delay" ? existing.params.filterFreq : 4000,
      }));
    case "setSaturation":
      return upsertByType(inserts, "saturation", () => ({
        driveDb: action.driveDb,
        mix: action.mix,
        tone: action.tone,
      }));
    default:
      // Track-field actions (setTrackVolume/Pan/Mute/Solo) don't touch the insert chain.
      return inserts;
  }
}

function addEqBand(
  inserts: EffectInstance[],
  action: Extract<AssistantAction, { kind: "addEqBand" }>
): EffectInstance[] {
  const band = { id: crypto.randomUUID(), type: action.eqType, freq: action.freq, gainDb: action.gainDb, q: action.q, enabled: true };
  const existing = inserts.find((e): e is Extract<EffectInstance, { type: "eq" }> => e.type === "eq");
  if (existing) {
    const next: EffectInstance = { ...existing, params: { bands: [...existing.params.bands, band] } };
    return inserts.map((e) => (e.id === existing.id ? next : e));
  }
  const eq = createEffectInstance("eq");
  if (eq.type === "eq") eq.params.bands = [band];
  return [...inserts, eq];
}

function upsertByType<T extends EffectType>(
  inserts: EffectInstance[],
  type: T,
  buildParams: (existing: Extract<EffectInstance, { type: T }> | undefined) => Extract<EffectInstance, { type: T }>["params"]
): EffectInstance[] {
  const existing = inserts.find((e): e is Extract<EffectInstance, { type: T }> => e.type === type);
  const id = existing?.id ?? crypto.randomUUID();
  const next = { id, type, bypassed: existing?.bypassed ?? false, params: buildParams(existing) } as EffectInstance;
  return existing ? inserts.map((e) => (e.id === id ? next : e)) : [...inserts, next];
}
