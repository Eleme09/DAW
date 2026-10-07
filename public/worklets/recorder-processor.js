/**
 * Captures raw input audio for a take. No encoding, no compression, no
 * mixing — see AUDIO_ENGINE.md's real-time/offline split. All WAV encoding
 * happens offline in wavEncoder.ts once recording stops.
 *
 * Samples are gathered in batches of BATCH frames and handed to the main
 * thread whole (their memory is transferred, not copied): posting every
 * 128-frame block meant ~375 messages and two new arrays a second, garbage
 * on both threads for the whole take. "stop" sends what is left, answers
 * "done" and lets the node go (process() returns false from then on).
 */
const BATCH = 4096; // ~85-93 ms

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = null; // one Float32Array(BATCH) per channel
    this.fill = 0;
    this.stopped = false;
    this.port.onmessage = (event) => {
      if (event.data !== "stop" || this.stopped) return;
      this.flush();
      this.stopped = true;
      this.buf = null;
      this.port.postMessage("done");
    };
  }

  /** Sends the frames gathered so far (moving the full batch's memory). */
  flush() {
    if (!this.buf || this.fill === 0) return;
    if (this.fill === BATCH) {
      const out = this.buf;
      this.port.postMessage(out, out.map((b) => b.buffer));
      this.buf = out.map(() => new Float32Array(BATCH));
    } else {
      this.port.postMessage(this.buf.map((b) => b.slice(0, this.fill)));
    }
    this.fill = 0;
  }

  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0];
    if (!input || input.length === 0 || input[0].length === 0) return true;
    if (!this.buf || this.buf.length !== input.length) {
      this.flush();
      this.buf = input.map(() => new Float32Array(BATCH));
    }
    const len = input[0].length;
    let from = 0;
    while (from < len) {
      const take = Math.min(len - from, BATCH - this.fill);
      for (let ch = 0; ch < input.length; ch++) {
        const src = input[ch];
        const dst = this.buf[ch];
        for (let i = 0; i < take; i++) dst[this.fill + i] = src[from + i];
      }
      this.fill += take;
      from += take;
      if (this.fill === BATCH) this.flush();
    }
    return true;
  }
}

registerProcessor("recorder-processor", RecorderProcessor);
