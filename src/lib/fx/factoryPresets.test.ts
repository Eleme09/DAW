import { describe, expect, it } from "vitest";
import { FACTORY_FX_PRESETS } from "./factoryPresets";
import { FX_CATALOG } from "./catalog";
import { FX_PRESET_CATEGORIES, instantiateChain, serializeChain } from "@/types/fxPresets";
import { TEMPO_DIVISIONS } from "@/audio-engine/effects/tempoGrid";
import { syncDelaysToTempo } from "@/state/projectStore";
import { BUTTERWORTH_Q_DB, compressorLatencySec } from "@/audio-engine/effects/latency";

describe("factory Fx presets", () => {
  it("have unique ids, short descriptions, known categories and offered effects", () => {
    const ids = new Set(FACTORY_FX_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(FACTORY_FX_PRESETS.length);
    const cats = new Set(FX_PRESET_CATEGORIES.map((c) => c.id));
    for (const p of FACTORY_FX_PRESETS) {
      expect(p.factory).toBe(true);
      expect(p.description.length).toBeLessThanOrEqual(50);
      expect(cats.has(p.category as never)).toBe(true);
      expect(p.effects.length).toBeGreaterThan(0);
      for (const e of p.effects) expect(e.type === "pitchCorrection" || e.type in FX_CATALOG).toBe(true);
    }
  });

  it("only use delay sync labels the tempo grid knows", () => {
    const labels = new Set(TEMPO_DIVISIONS.map((d) => d.label));
    for (const p of FACTORY_FX_PRESETS)
      for (const e of p.effects) if (e.type === "delay" && e.params.sync) expect(labels.has(e.params.sync)).toBe(true);
  });
});

describe("chain templates", () => {
  it("instantiate with fresh ids but serialize the same", () => {
    const tpl = FACTORY_FX_PRESETS.find((p) => p.effects.some((e) => e.type === "eq"))!;
    const a = instantiateChain(tpl.effects);
    const b = instantiateChain(tpl.effects);
    expect(a[0].id).not.toBe(b[0].id);
    const eqA = a.find((e) => e.type === "eq")!;
    const eqT = tpl.effects.find((e) => e.type === "eq")!;
    if (eqA.type === "eq" && eqT.type === "eq") expect(eqA.params.bands[0].id).not.toBe(eqT.params.bands[0].id);
    expect(serializeChain(a)).toBe(serializeChain(b));
    expect(serializeChain(a)).toBe(serializeChain(tpl.effects));
  });

  it("rewrite synced delay times for the tempo and leave free ones alone", () => {
    const chain = instantiateChain([
      { id: "x", type: "delay", bypassed: false, params: { timeMs: 1, feedback: 0.3, mix: 0.2, filterFreq: 5000, sync: "1/4" } },
      { id: "y", type: "delay", bypassed: false, params: { timeMs: 123, feedback: 0.3, mix: 0.2, filterFreq: 5000, sync: null } },
    ]);
    const out = syncDelaysToTempo(chain, 120);
    expect(out[0].type === "delay" && out[0].params.timeMs).toBeCloseTo(500);
    expect(out[1]).toBe(chain[1]);
    expect(syncDelaysToTempo(out, 120)).toBe(out);
  });
});

describe("crossover/latency constants", () => {
  it("match the measured Chromium compressor look-ahead and dB-valued Butterworth Q", () => {
    expect(Math.round(compressorLatencySec(44100) * 44100)).toBe(264);
    expect(Math.round(compressorLatencySec(48000) * 48000)).toBe(288);
    expect(BUTTERWORTH_Q_DB).toBeCloseTo(-3.0103, 3);
  });
});
