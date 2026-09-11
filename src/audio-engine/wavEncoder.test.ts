import { describe, expect, it } from "vitest";
import { encodeWav } from "./wavEncoder";

async function readHeader(blob: Blob) {
  const buf = await blob.arrayBuffer();
  const view = new DataView(buf);
  const readStr = (offset: number, len: number) =>
    String.fromCharCode(...new Uint8Array(buf, offset, len));
  return {
    riff: readStr(0, 4),
    wave: readStr(8, 4),
    fmt: readStr(12, 4),
    numChannels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    dataSize: view.getUint32(40, true),
    view,
  };
}

describe("encodeWav", () => {
  it("writes a valid RIFF/WAVE header", async () => {
    const channel = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const blob = encodeWav([channel], 44100);
    const header = await readHeader(blob);
    expect(header.riff).toBe("RIFF");
    expect(header.wave).toBe("WAVE");
    expect(header.fmt).toBe("fmt ");
    expect(header.numChannels).toBe(1);
    expect(header.sampleRate).toBe(44100);
    expect(header.bitsPerSample).toBe(16);
    expect(header.dataSize).toBe(channel.length * 2);
  });

  it("interleaves multi-channel data", async () => {
    const left = new Float32Array([1, -1]);
    const right = new Float32Array([0.5, -0.5]);
    const blob = encodeWav([left, right], 48000);
    const header = await readHeader(blob);
    expect(header.numChannels).toBe(2);
    // frame 0: L=1 -> 0x7fff, R=0.5 -> 0x3fff-ish
    expect(header.view.getInt16(44, true)).toBe(0x7fff);
  });

  it("clamps out-of-range samples instead of wrapping", async () => {
    const channel = new Float32Array([2, -2]);
    const blob = encodeWav([channel], 44100);
    const header = await readHeader(blob);
    expect(header.view.getInt16(44, true)).toBe(0x7fff);
    expect(header.view.getInt16(46, true)).toBe(-0x8000);
  });
});
