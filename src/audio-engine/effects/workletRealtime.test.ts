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
  return { Cls: Cls as ProcessorClass, posted };
}

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
