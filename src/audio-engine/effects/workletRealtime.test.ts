/**
 * The real worklet files of the dynamics (compressor / de-esser / limiter /
 * multiband / mastering / output guard), the noise gate and the take
 * recorder, run in Node in a sandbox standing in for AudioWorkletGlobalScope.
 *
 * What is pinned here is what keeps a long session from choking the phone's
 * audio thread: a silent track costs almost nothing yet sounds exactly as if
 * every sample had been computed, and the recorder hands every sample of a
 * take over in order, batched, without dropping the tail at "stop".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

const SR = 48000;
const BLOCK = 128;

interface Processor {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
  port: { onmessage: ((e: { data: unknown }) => void) | null };
}
interface ProcessorClass {
  new (options?: { processorOptions?: Record<string, unknown> }): Processor;
  parameterDescriptors?: { name: string; defaultValue: number }[];
}

function load(file: string) {
  let Cls: ProcessorClass | null = null;
  const posted: unknown[] = [];
  const sandbox = {
    sampleRate: SR,
    /** The audio clock (seconds), moved by the test like the engine does. */
    currentTime: 0,
    Math,
    Float32Array,
    Float64Array,
    AudioWorkletProcessor: class {
      port = { postMessage: (m: unknown) => posted.push(m), onmessage: null };
    },
    registerProcessor: (_n: string, c: ProcessorClass) => {
      Cls = c;
    },
  };
  (sandbox as unknown as { globalThis: unknown }).globalThis = sandbox;
  runInNewContext(readFileSync(join(process.cwd(), "public/worklets", file), "utf8"), sandbox);
  if (!Cls) throw new Error(`${file} did not register`);
  return { Cls: Cls as ProcessorClass, posted, sandbox };
}

interface ProfReport {
  prof: { ms: number; blocks: number; over2: number; over4: number; max: number; sec: number };
}
const isProf = (m: unknown): m is ProfReport => typeof m === "object" && m !== null && "prof" in m;

function params(Cls: ProcessorClass, values: Record<string, number>) {
  const p: Record<string, Float32Array> = {};
  for (const d of Cls.parameterDescriptors ?? []) p[d.name] = new Float32Array([values[d.name] ?? d.defaultValue]);
  return p;
}

/** A sung-ish signal: 220 Hz with harmonics and a slow swell, `sec` long. */
function voice(sec: number, amp: number): Float32Array {
  const x = new Float32Array(Math.round(sec * SR));
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const env = amp * (0.6 + 0.4 * Math.sin(2 * Math.PI * 1.3 * t));
    x[i] = env * (Math.sin(2 * Math.PI * 220 * t) + 0.5 * Math.sin(2 * Math.PI * 440 * t) + 0.25 * Math.sin(2 * Math.PI * 660 * t));
  }
  return x;
}

/** voice, a gap filled with `gapValue`, voice again */
function phrase(gapValue: number): Float32Array {
  const a = voice(1.5, 0.5);
  const gap = new Float32Array(Math.round(0.8 * SR)).fill(gapValue);
  const b = voice(1, 0.7);
  const x = new Float32Array(a.length + gap.length + b.length);
  x.set(a, 0);
  x.set(gap, a.length);
  x.set(b, a.length + gap.length);
  return x;
}

function runDynamics(x: Float32Array, options: Record<string, unknown>, values: Record<string, number>) {
  const { Cls, posted } = load("dynamics-processor.js");
  const node = new Cls({ processorOptions: options });
  const p = params(Cls, values);
  const outL = new Float32Array(x.length);
  const outR = new Float32Array(x.length);
  const inB = new Float32Array(BLOCK);
  const oL = new Float32Array(BLOCK);
  const oR = new Float32Array(BLOCK);
  for (let s = 0; s + BLOCK <= x.length; s += BLOCK) {
    inB.set(x.subarray(s, s + BLOCK));
    node.process([[inB, inB]], [[oL, oR]], p);
    outL.set(oL, s);
    outR.set(oR, s);
  }
  return { outL, outR, reports: posted as number[] };
}

const COMP = { threshold: -24, ratio: 4, knee: 6, attack: 0.005, release: 0.12, makeup: 4 };
const LIMIT = { drive: 9, ceiling: -1, attack: 0.001, release: 0.06 };

describe("dynamics worklet on a silent track", () => {
  for (const [name, options, values] of [
    ["compressor", {}, COMP],
    ["limiter", { mode: "limit", lookaheadMs: 5 }, LIMIT],
  ] as const) {
    it(`${name}: skipping true silence sounds the same as computing it`, () => {
      // exact zeros take the shortcut; 1e-30 is inaudibly different but
      // forces every sample through the full gain computer
      const fast = runDynamics(phrase(0), options, values);
      const full = runDynamics(phrase(1e-30), options, values);
      let maxDiff = 0;
      for (let i = 0; i < fast.outL.length; i++) maxDiff = Math.max(maxDiff, Math.abs(fast.outL[i] - full.outL[i]));
      expect(maxDiff).toBeLessThan(1e-5); // < -100 dBFS
      expect(fast.reports.length).toBe(full.reports.length);
      for (let i = 0; i < fast.reports.length; i++) expect(fast.reports[i]).toBeCloseTo(full.reports[i], 3);
    });

    it(`${name}: silence in, silence out, and the voice after it is processed`, () => {
      const { outL } = runDynamics(phrase(0), options, values);
      const gapFrom = Math.round(1.5 * SR) + SR * 0.05; // past the look-ahead tail
      const gapTo = Math.round(2.3 * SR);
      for (let i = gapFrom; i < gapTo; i++) expect(outL[i]).toBe(0);
      let after = 0;
      for (let i = gapTo + SR * 0.1; i < outL.length; i++) after = Math.max(after, Math.abs(outL[i]));
      expect(after).toBeGreaterThan(0.1);
    });
  }

  it("the limiter's ceiling holds, gaps or not", () => {
    const { outL, outR } = runDynamics(phrase(0), { mode: "limit", lookaheadMs: 5 }, LIMIT);
    const ceil = Math.pow(10, -1 / 20);
    for (let i = 0; i < outL.length; i++) {
      expect(Math.abs(outL[i])).toBeLessThanOrEqual(ceil + 1e-6);
      expect(Math.abs(outR[i])).toBeLessThanOrEqual(ceil + 1e-6);
    }
  });
});

describe("noise gate on a silent track", () => {
  it("skipping true silence sounds the same as computing it", () => {
    const run = (gap: number) => {
      const { Cls } = load("noise-gate-processor.js");
      const node = new Cls();
      const p = params(Cls, { thresholdDb: -40 });
      const x = phrase(gap);
      const out = new Float32Array(x.length);
      const inB = new Float32Array(BLOCK);
      const o = new Float32Array(BLOCK);
      for (let s = 0; s + BLOCK <= x.length; s += BLOCK) {
        inB.set(x.subarray(s, s + BLOCK));
        node.process([[inB]], [[o]], p);
        out.set(o, s);
      }
      return out;
    };
    const fast = run(0);
    const full = run(1e-30);
    let maxDiff = 0;
    for (let i = 0; i < fast.length; i++) maxDiff = Math.max(maxDiff, Math.abs(fast[i] - full[i]));
    expect(maxDiff).toBeLessThan(1e-6);
  });
});

describe("on-device CPU meter (Ajustes > Rendimiento)", () => {
  /** 3 s of voice through a processor, the audio clock advancing per block. */
  function runMetered(file: string, options: Record<string, unknown>, values: Record<string, number>, meterOn: boolean) {
    const { Cls, posted, sandbox } = load(file);
    const node = new Cls({ processorOptions: options });
    if (meterOn) node.port.onmessage?.({ data: { type: "prof", on: true } });
    const p = params(Cls, values);
    const x = voice(3, 0.5);
    const inB = new Float32Array(BLOCK);
    const oL = new Float32Array(BLOCK);
    const oR = new Float32Array(BLOCK);
    let n = 0;
    for (let s = 0; s + BLOCK <= x.length; s += BLOCK) {
      sandbox.currentTime = (n++ * BLOCK) / SR;
      inB.set(x.subarray(s, s + BLOCK));
      node.process([[inB, inB]], [[oL, oR]], p);
    }
    return posted.filter(isProf);
  }

  for (const [file, options, values] of [
    ["dynamics-processor.js", {}, COMP],
    ["noise-gate-processor.js", {}, { thresholdDb: -40 }],
  ] as const) {
    it(`${file}: silent by default, reports once per second of audio when asked`, () => {
      expect(runMetered(file, options, values, false)).toHaveLength(0);
      const reports = runMetered(file, options, values, true);
      expect(reports.length).toBeGreaterThanOrEqual(2); // 3 s of audio
      for (const { prof } of reports) {
        expect(prof.sec).toBeGreaterThanOrEqual(1);
        expect(prof.blocks).toBeGreaterThan((SR / BLOCK) * 0.95);
        expect(prof.blocks).toBeLessThan((SR / BLOCK) * 1.1);
        expect(prof.ms).toBeGreaterThanOrEqual(0);
        expect(prof.over2).toBeLessThanOrEqual(prof.blocks);
      }
    });

    it(`${file}: the meter does not change the audio`, () => {
      const render = (meterOn: boolean) => {
        const { Cls, sandbox } = load(file);
        const node = new Cls({ processorOptions: options });
        if (meterOn) node.port.onmessage?.({ data: { type: "prof", on: true } });
        const p = params(Cls, values);
        const x = voice(1, 0.5);
        const out = new Float32Array(x.length);
        const inB = new Float32Array(BLOCK);
        const oL = new Float32Array(BLOCK);
        const oR = new Float32Array(BLOCK);
        for (let s = 0, n = 0; s + BLOCK <= x.length; s += BLOCK, n++) {
          sandbox.currentTime = (n * BLOCK) / SR;
          inB.set(x.subarray(s, s + BLOCK));
          node.process([[inB, inB]], [[oL, oR]], p);
          out.set(oL, s);
        }
        return out;
      };
      expect(render(true)).toEqual(render(false));
    });
  }

  it("switching the meter off stops the reports", () => {
    const { Cls, posted, sandbox } = load("dynamics-processor.js");
    const node = new Cls({ processorOptions: {} });
    const p = params(Cls, COMP);
    const inB = voice(0.01, 0.5).subarray(0, BLOCK);
    const oL = new Float32Array(BLOCK);
    const oR = new Float32Array(BLOCK);
    node.port.onmessage?.({ data: { type: "prof", on: true } });
    for (let n = 0; n < (SR / BLOCK) * 2.5; n++) {
      sandbox.currentTime = (n * BLOCK) / SR;
      node.process([[inB, inB]], [[oL, oR]], p);
    }
    const during = posted.filter(isProf).length;
    expect(during).toBeGreaterThan(0);
    node.port.onmessage?.({ data: { type: "prof", on: false } });
    for (let n = 0; n < (SR / BLOCK) * 2.5; n++) {
      sandbox.currentTime = 3 + (n * BLOCK) / SR;
      node.process([[inB, inB]], [[oL, oR]], p);
    }
    expect(posted.filter(isProf).length).toBe(during);
  });
});

describe("take recorder", () => {
  it("hands every sample over, in order, and the tail at stop", () => {
    const { Cls, posted } = load("recorder-processor.js");
    const node = new Cls();
    const total = 4096 * 3 + 777 * BLOCK + 5; // not a multiple of the batch
    const x = new Float32Array(total);
    for (let i = 0; i < total; i++) x[i] = Math.sin(i * 0.01) * 0.5;
    let s = 0;
    while (s < total) {
      const len = Math.min(BLOCK, total - s);
      expect(node.process([[x.slice(s, s + len)]], [], {})).toBe(true);
      s += len;
    }
    node.port.onmessage?.({ data: "stop" });
    expect(posted[posted.length - 1]).toBe("done");
    const batches = posted.slice(0, -1) as Float32Array[][];
    expect(batches.length).toBeLessThan(total / BLOCK / 10); // batched, not one message per block
    const got = new Float32Array(total);
    let o = 0;
    for (const b of batches) {
      got.set(b[0], o);
      o += b[0].length;
    }
    expect(o).toBe(total);
    expect(got).toEqual(x);
    // stopped: lets the node go
    expect(node.process([[new Float32Array(BLOCK)]], [], {})).toBe(false);
  });
});
