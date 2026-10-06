import { describe, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderAutoPitch } from "./workletHarness";
import { resolveAutoPitch } from "./resolveAutoPitch";
import { createAutoPitchSettings } from "@/types/autoPitch";

/**
 * Stage-by-stage render of a REAL recording through the AutoPitch worklet,
 * for the A/B audit in scripts/autopitch-audit (user request: find where the
 * voice gets degraded, objectively). Skipped unless pointed at a file:
 *
 *   AUTOPITCH_AUDIT_INPUT=voice.wav AUTOPITCH_AUDIT_OUT=out/ \
 *   AUTOPITCH_AUDIT_TAG=new npx vitest run src/audio-engine/autopitch/pipelineAudit.test.ts
 *
 * (AUTOPITCH_WORKLET=<old processor .js> renders the same stages with another
 * version of the engine.) Stages, all Classic in the given key:
 *   detect - amount 0: detection and the grain engine run, nothing is corrected
 *   min    - amount 0.1: a 10 % correction (a few cents) - minimal pitch shift
 *   full   - Classic at 100 %, what the user hears
 * Each is written as a 32-bit float stereo WAV, exactly what the worklet
 * output (no level matching, latency included).
 */

const INPUT = process.env.AUTOPITCH_AUDIT_INPUT;
const OUT = process.env.AUTOPITCH_AUDIT_OUT ?? ".";
const TAG = process.env.AUTOPITCH_AUDIT_TAG ?? "new";
const KEY = Number(process.env.AUTOPITCH_AUDIT_KEY ?? "9"); // 9 = A (La)

function readWav(path: string): { data: Float32Array; sampleRate: number } {
  const b = readFileSync(path);
  let o = 12;
  let channels = 1;
  let format = 1;
  let bits = 16;
  let sampleRate = 44100;
  let data: Buffer | null = null;
  while (o + 8 <= b.length) {
    const id = b.toString("ascii", o, o + 4);
    const size = b.readUInt32LE(o + 4);
    if (id === "fmt ") {
      format = b.readUInt16LE(o + 8);
      channels = b.readUInt16LE(o + 10);
      sampleRate = b.readUInt32LE(o + 12);
      bits = b.readUInt16LE(o + 22);
    }
    if (id === "data") data = b.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size & 1);
  }
  if (!data) throw new Error(`${path}: no data chunk`);
  const bytes = bits / 8;
  const frames = Math.floor(data.length / bytes / channels);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) {
      const at = (i * channels + c) * bytes;
      if (format === 3) s += data.readFloatLE(at);
      else if (bits === 16) s += data.readInt16LE(at) / 32768;
      else if (bits === 24) s += data.readIntLE(at, 3) / 8388608;
      else s += data.readInt32LE(at) / 2147483648;
    }
    out[i] = s / channels; // the worklet's input is mono (the node downmixes)
  }
  return { data: out, sampleRate };
}

function writeFloatWav(path: string, left: Float32Array, right: Float32Array, sampleRate: number): void {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 8);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + n * 8, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 8, 28);
  buf.writeUInt16LE(8, 32);
  buf.writeUInt16LE(32, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) {
    buf.writeFloatLE(left[i], 44 + i * 8);
    buf.writeFloatLE(right[i], 48 + i * 8);
  }
  writeFileSync(path, buf);
}

describe.skipIf(!INPUT)("AutoPitch pipeline audit renders (real recording)", () => {
  it("renders detect / min / full", () => {
    const { data, sampleRate } = readWav(INPUT!);
    mkdirSync(OUT, { recursive: true });
    const classic = resolveAutoPitch({ ...createAutoPitchSettings(KEY, "major"), presetId: "classic", level: 1 }).worklet;
    const stages: [string, Partial<typeof classic>][] = [
      ["detect", { amount: 0 }],
      ["min", { amount: 0.1 }],
      ["full", {}],
    ];
    for (const [name, over] of stages) {
      const out = renderAutoPitch(data, { ...classic, ...over }, sampleRate);
      writeFloatWav(join(OUT, `${TAG}_${name}.wav`), out.left, out.right, sampleRate);
    }
  }, 900_000);
});
