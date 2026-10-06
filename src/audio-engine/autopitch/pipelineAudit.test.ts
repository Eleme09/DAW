import { describe, it } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderAutoPitch } from "./workletHarness";
import { resolveAutoPitch } from "./resolveAutoPitch";
import { createAutoPitchSettings } from "@/types/autoPitch";
import { readWavMono, writeFloatWav } from "./auditIo";

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

describe.skipIf(!INPUT)("AutoPitch pipeline audit renders (real recording)", () => {
  it("renders detect / min / full", () => {
    const { data, sampleRate } = readWavMono(INPUT!);
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
