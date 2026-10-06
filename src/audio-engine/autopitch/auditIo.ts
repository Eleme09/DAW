import { readFileSync, writeFileSync } from "node:fs";

/** Test/audit helpers: WAV in (any PCM/float, downmixed to mono - the
 * worklet's input is mono) and 32-bit float stereo WAV out. */

export function readWavMono(path: string): { data: Float32Array; sampleRate: number } {
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
    out[i] = s / channels;
  }
  return { data: out, sampleRate };
}

export function writeFloatWav(path: string, left: Float32Array, right: Float32Array, sampleRate: number): void {
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
