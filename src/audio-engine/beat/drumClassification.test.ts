import { describe, expect, it } from "vitest";
import { classifyOnsetWindow } from "./drumClassification";
import { lowpassFilter } from "./filters";

const SAMPLE_RATE = 44100;

function makeKick(seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const env = Math.exp(-i / (n * 0.3));
    data[i] = Math.sin((2 * Math.PI * 60 * i) / sampleRate) * env;
  }
  return data;
}

function whiteNoise(seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return data;
}

function makeHihat(seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const noise = whiteNoise(seconds, sampleRate);
  const low = lowpassFilter(noise, sampleRate, 4000);
  const highPassed = new Float32Array(noise.length);
  for (let i = 0; i < noise.length; i++) highPassed[i] = noise[i] - low[i];
  return highPassed;
}

function makeSnare(seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const noise = whiteNoise(seconds, sampleRate);
  const upper = lowpassFilter(noise, sampleRate, 6000);
  const lower = lowpassFilter(noise, sampleRate, 400);
  const banded = new Float32Array(noise.length);
  for (let i = 0; i < noise.length; i++) banded[i] = upper[i] - lower[i];
  // Add a little low-mid body, like a snare's fundamental.
  for (let i = 0; i < noise.length; i++) {
    banded[i] += Math.sin((2 * Math.PI * 200 * i) / sampleRate) * 0.3;
  }
  return banded;
}

describe("classifyOnsetWindow", () => {
  it("classifies a low decaying sine burst as a kick", () => {
    const kick = makeKick(0.1).subarray(2000); // skip the filter-free onset's transient click
    const { type } = classifyOnsetWindow(kick, SAMPLE_RATE);
    expect(type).toBe("kick");
  });

  it("classifies high-passed noise as a hihat", () => {
    const hihat = makeHihat(0.1).subarray(2000);
    const { type } = classifyOnsetWindow(hihat, SAMPLE_RATE);
    expect(type).toBe("hihat");
  });

  it("classifies band-limited mid noise as a snare", () => {
    const snare = makeSnare(0.1).subarray(2000);
    const { type } = classifyOnsetWindow(snare, SAMPLE_RATE);
    expect(type).toBe("snare");
  });

  it("a kick and a hihat are classified differently", () => {
    const kick = classifyOnsetWindow(makeKick(0.1).subarray(2000), SAMPLE_RATE);
    const hihat = classifyOnsetWindow(makeHihat(0.1).subarray(2000), SAMPLE_RATE);
    expect(kick.type).not.toBe(hihat.type);
  });
});
