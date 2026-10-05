/**
 * Runs public/worklets/autopitch-processor.js in Node (tests only): the real
 * file, evaluated in a sandbox that stands in for AudioWorkletGlobalScope.
 * This is what lets the tuner be MEASURED (pitch, latency, harmonies)
 * instead of trusted.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import type { AutoPitchWorkletParams } from "./resolveAutoPitch";

interface ProcessorLike {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

interface ProcessorClass {
  new (): ProcessorLike;
  parameterDescriptors: { name: string; defaultValue: number }[];
}

export interface RenderResult {
  left: Float32Array;
  right: Float32Array;
}

export interface WorkletHelpers {
  nearestNote(midi: number, key: number, pcs: number[]): number;
  diatonicShift(note: number, steps: number, key: number, pcs: number[]): number;
  allowedPcs(scaleIndex: number, mask: number): number[];
  harmonyPcs(scaleIndex: number, mask: number): number[];
}

function load(sampleRate: number): { Processor: ProcessorClass; helpers: WorkletHelpers } {
  const source = readFileSync(join(process.cwd(), "public/worklets/autopitch-processor.js"), "utf8");
  let Processor: ProcessorClass | null = null;
  const exportsHolder: { helpers?: WorkletHelpers } = {};
  const sandbox = {
    sampleRate,
    Math,
    Float32Array,
    Float64Array,
    Uint8Array,
    AudioWorkletProcessor: class {
      port = { postMessage() {}, onmessage: null };
    },
    registerProcessor: (_name: string, cls: ProcessorClass) => {
      Processor = cls;
    },
    __autopitchExports: exportsHolder,
  };
  (sandbox as unknown as { globalThis: unknown }).globalThis = sandbox;
  runInNewContext(source, sandbox);
  if (!Processor || !exportsHolder.helpers) throw new Error("autopitch-processor.js did not register");
  return { Processor, helpers: exportsHolder.helpers };
}

export function loadAutoPitchHelpers(): WorkletHelpers {
  return load(44100).helpers;
}

/** Renders `input` (mono) through a fresh processor with `params`. */
export function renderAutoPitch(
  input: Float32Array,
  params: Partial<AutoPitchWorkletParams>,
  sampleRate = 44100,
  /** Test hook: called after every 128-sample block with the live processor and the block's left output. */
  inspect?: (node: Record<string, unknown>, startSample: number, outL: Float32Array) => void
): RenderResult {
  const { Processor } = load(sampleRate);
  const node = new Processor();
  const parameters: Record<string, Float32Array> = {};
  for (const d of Processor.parameterDescriptors) {
    const value = (params as Record<string, number | undefined>)[d.name];
    parameters[d.name] = new Float32Array([value ?? d.defaultValue]);
  }
  const left = new Float32Array(input.length);
  const right = new Float32Array(input.length);
  const block = 128;
  for (let start = 0; start < input.length; start += block) {
    const len = Math.min(block, input.length - start);
    const inBlock = new Float32Array(block);
    inBlock.set(input.subarray(start, start + len));
    const outL = new Float32Array(block);
    const outR = new Float32Array(block);
    node.process([[inBlock]], [[outL, outR]], parameters);
    inspect?.(node as unknown as Record<string, unknown>, start, outL);
    left.set(outL.subarray(0, len), start);
    right.set(outR.subarray(0, len), start);
  }
  return { left, right };
}
