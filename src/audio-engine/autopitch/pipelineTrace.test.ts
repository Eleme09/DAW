import { describe, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderAutoPitch } from "./workletHarness";
import { resolveAutoPitch } from "./resolveAutoPitch";
import { createAutoPitchSettings } from "@/types/autoPitch";
import { readWavMono, writeFloatWav } from "./auditIo";

/**
 * Render + full trace of what the AutoPitch worklet DID, for the experiments
 * in scripts/autopitch-audit/experiments (which component causes an artifact:
 * note decision, grain scheduling, epochs, dry/tuned crossfade...). The
 * processor source is instrumented on the fly (only in this test); the
 * audio it produces is unchanged. Skipped unless AUTOPITCH_TRACE_INPUT is set:
 *
 *   AUTOPITCH_TRACE_INPUT=voz.wav AUTOPITCH_TRACE_OUT=out AUTOPITCH_TRACE_TAG=base \
 *   [AUTOPITCH_WORKLET=variant.js] [AUTOPITCH_TRACE_PARAMS='{"transitionMs":2}'] \
 *   npx vitest run src/audio-engine/autopitch/pipelineTrace.test.ts
 *
 * Writes <tag>.wav (float stereo), <tag>_trace.json (analysis frames, grains,
 * epochs) and <tag>_mix.f32 (per output sample: share of the tuned signal,
 * then the grain window sum).
 */

const INPUT = process.env.AUTOPITCH_TRACE_INPUT;
const OUT = process.env.AUTOPITCH_TRACE_OUT ?? ".";
const TAG = process.env.AUTOPITCH_TRACE_TAG ?? "trace";
const KEY = Number(process.env.AUTOPITCH_TRACE_KEY ?? "9");

function instrument(src: string): string {
  const inject = (anchor: string, code: string, before = false) => {
    const at = src.indexOf(anchor);
    if (at < 0) throw new Error(`instrumentation anchor not found: ${anchor}`);
    src = before ? src.slice(0, at) + code + src.slice(at) : src.slice(0, at + anchor.length) + code + src.slice(at + anchor.length);
  };
  inject(
    "  process(inputs, outputs, parameters) {",
    "\n    if (!this.__tr) this.__tr = { an: [], gr: [], ep: [], mix: new Float32Array(Math.ceil(sampleRate * 200) * 2) };"
  );
  inject("    this.nextMark[s] = mark + hop;", "\n    this.__tr.gr.push(s, mark, e, per, hop, typeof r === 'number' ? r : ratio, now, k);");
  inject("      this.epochCount++;", "\n      this.__tr.ep.push(e, this.voiced ? 1 : 0);");
  inject(
    "      const lead = (dry + (tuned - dry) * this.voicedGain * cover) * p.leadGain;",
    "\n      if (2 * n + 1 < this.__tr.mix.length) { this.__tr.mix[2 * n] = this.voicedGain * cover; this.__tr.mix[2 * n + 1] = wsum; }"
  );
  inject(
    'registerProcessor("autopitch-processor", AutoPitchProcessor);',
    `
{
  const yin0 = AutoPitchProcessor.prototype.yin;
  AutoPitchProcessor.prototype.yin = function () { const r = yin0.call(this); this.__lastDet = { hz: r.hz, confidence: r.confidence, rms: r.rms }; return r; };
  const an0 = AutoPitchProcessor.prototype.analyze;
  AutoPitchProcessor.prototype.analyze = function () {
    an0.call(this);
    const d = this.__lastDet || { hz: 0, confidence: 0, rms: 0 };
    this.__tr.an.push(this.n, d.hz, d.confidence, d.rms, this.voiced ? 1 : 0, this.detMidi === null ? -1 : this.detMidi, this.targetNote === null ? -1 : this.targetNote, this.correction, this.histT1, this.period);
  };
}
`,
    true
  );
  return src;
}

describe.skipIf(!INPUT)("AutoPitch trace render (experiments)", () => {
  it("renders and traces", () => {
    mkdirSync(OUT, { recursive: true });
    const srcPath = process.env.AUTOPITCH_WORKLET ?? join(process.cwd(), "public/worklets/autopitch-processor.js");
    const instrumented = join(OUT, `${TAG}_instrumented.js`);
    writeFileSync(instrumented, instrument(readFileSync(srcPath, "utf8")));
    const prev = process.env.AUTOPITCH_WORKLET;
    process.env.AUTOPITCH_WORKLET = instrumented;
    try {
      const { data, sampleRate } = readWavMono(INPUT!);
      const over = JSON.parse(process.env.AUTOPITCH_TRACE_PARAMS ?? "{}") as Record<string, number>;
      const params = { ...resolveAutoPitch({ ...createAutoPitchSettings(KEY, "major"), presetId: "classic", level: 1 }).worklet, ...over };
      let node: Record<string, unknown> | null = null;
      const out = renderAutoPitch(data, params, sampleRate, (n) => {
        node = n;
      });
      writeFloatWav(join(OUT, `${TAG}.wav`), out.left, out.right, sampleRate);
      const tr = (node as unknown as { __tr: { an: number[]; gr: number[]; ep: number[]; mix: Float32Array } }).__tr;
      const delay = (node as unknown as { delay: Float64Array }).delay[0];
      writeFileSync(
        join(OUT, `${TAG}_trace.json`),
        JSON.stringify({
          sampleRate,
          delay,
          params,
          analysisFields: ["n", "hz", "confidence", "rms", "voiced", "detMidi", "targetNote", "correction", "frameCentre", "period"],
          analyses: tr.an,
          grainFields: ["stream", "mark", "epoch", "per", "hop", "ratio", "now", "k"],
          grains: tr.gr,
          epochFields: ["pos", "voiced"],
          epochs: tr.ep,
        })
      );
      writeFileSync(join(OUT, `${TAG}_mix.f32`), Buffer.from(tr.mix.buffer, 0, data.length * 8));
    } finally {
      if (prev === undefined) delete process.env.AUTOPITCH_WORKLET;
      else process.env.AUTOPITCH_WORKLET = prev;
    }
  }, 900_000);
});
