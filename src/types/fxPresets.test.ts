import { describe, expect, it } from "vitest";
import { FACTORY_FX_PRESETS } from "@/lib/fx/factoryPresets";
import { instantiateChain, reuseInsertIds, serializeChain } from "./fxPresets";

const preset = (id: string) => {
  const p = FACTORY_FX_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
};

describe("reuseInsertIds (applying a preset over a chain)", () => {
  it("keeps the processors two presets share, in order, and builds the rest fresh", () => {
    const a = instantiateChain(preset("factory.eco-negra").effects); // eq comp eq deesser delay limiter
    const b = instantiateChain(preset("factory.sala-grande").effects); // eq comp eq deesser reverb limiter
    const out = reuseInsertIds(a, b);
    expect(out.map((e) => e.type)).toEqual(b.map((e) => e.type));
    // eq, compressor, eq, de-esser and limiter keep their old ids...
    expect(out[0].id).toBe(a[0].id);
    expect(out[1].id).toBe(a[1].id);
    expect(out[2].id).toBe(a[2].id);
    expect(out[3].id).toBe(a[3].id);
    expect(out[5].id).toBe(a[5].id);
    // ...the reverb is new (never reusable) and ids stay unique
    expect(a.map((e) => e.id)).not.toContain(out[4].id);
    expect(new Set(out.map((e) => e.id)).size).toBe(out.length);
  });

  it("changes nothing about what the chain sounds like: same types, settings and bypass", () => {
    const a = instantiateChain(preset("factory.trap-limpia").effects);
    const b = instantiateChain(preset("factory.adlib-astro").effects);
    const out = reuseInsertIds(a, b);
    expect(serializeChain(out)).toBe(serializeChain(b));
  });

  it("an EQ is reused only with the same number of bands, and then keeps its band ids", () => {
    const a = instantiateChain(preset("factory.control").effects);
    const b = instantiateChain(preset("factory.control").effects);
    const same = reuseInsertIds(a, b);
    const eqA = a[0];
    const eqOut = same[0];
    if (eqA.type !== "eq" || eqOut.type !== "eq") throw new Error("eq first");
    expect(eqOut.id).toBe(eqA.id);
    expect(eqOut.params.bands.map((x) => x.id)).toEqual(eqA.params.bands.map((x) => x.id));
    // a different band count: a fresh EQ (the engine swaps it smoothly)
    if (eqA.type !== "eq") throw new Error("eq first");
    const fewer = { ...eqA, params: { bands: eqA.params.bands.slice(0, 2) } };
    const out = reuseInsertIds([fewer, ...a.slice(1)], b);
    expect(out[0].id).not.toBe(fewer.id);
    expect(out[1].id).toBe(a[1].id); // the compressor still is
  });

  it("two compressors in the new chain take at most the compressors the old one had", () => {
    const old = instantiateChain(preset("factory.eco-negra").effects); // one compressor
    const next = instantiateChain(preset("factory.control").effects); // two compressors
    const out = reuseInsertIds(old, next);
    const compressorIds = out.filter((e) => e.type === "compressor").map((e) => e.id);
    expect(compressorIds).toHaveLength(2);
    expect(new Set(compressorIds).size).toBe(2);
    expect(compressorIds.filter((id) => old.some((e) => e.id === id))).toHaveLength(1);
  });

  it("with nothing before, or only effects that are never reused, everything is fresh", () => {
    const next = instantiateChain(preset("factory.sala-grande").effects);
    expect(reuseInsertIds([], next).map((e) => e.id)).toEqual(next.map((e) => e.id));
    const old = instantiateChain(preset("factory.lo-fi").effects);
    const out = reuseInsertIds(old.filter((e) => e.type === "reverb" || e.type === "chorus"), next);
    expect(out.map((e) => e.id)).toEqual(next.map((e) => e.id));
  });
});
