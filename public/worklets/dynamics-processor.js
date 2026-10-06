/**
 * Compressor / limiter for the effect chain (Gravedad, Estratos, Horizonte,
 * Sibila and the output protection), replacing DynamicsCompressorNode.
 *
 * Why not the native node: when its threshold, ratio or knee change it
 * recomputes a hidden "auto makeup" gain and applies it at once, every
 * 128-sample block - turning a knob while the music plays stepped the level
 * ~1.4 dB every 3 ms (measured), heard as crackles and odd peaks. Safari's
 * version is not guaranteed to behave the same either. Here every parameter
 * glides per sample, there is no hidden gain, and the reduction is reported
 * to the UI meters.
 *
 * Feed-forward, log-domain design (Giannoulis, Massberg & Reiss 2012):
 * stereo-linked peak level -> soft-knee gain computer in dB -> branching
 * attack/release smoother -> makeup. Mode "limit": input drive, look-ahead
 * (the gain is already down when the peak arrives) and a hard ceiling.
 */

const LN10_20 = Math.LN10 / 20; // dB -> ln(gain)
const DB_PER_LN = 20 / Math.LN10; // ln(gain) -> dB
const PARAM_GLIDE_SEC = 0.015;
const REPORT_EVERY = 2048; // samples between meter reports (~21 Hz)

class DynamicsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = (name, defaultValue, minValue, maxValue) => ({ name, defaultValue, minValue, maxValue, automationRate: "k-rate" });
    return [
      k("threshold", -24, -100, 0),
      k("ratio", 4, 1, 100),
      k("knee", 6, 0, 40),
      k("attack", 0.01, 0.00005, 1),
      k("release", 0.12, 0.005, 3),
      k("makeup", 0, -40, 40),
      k("drive", 0, 0, 36),
      k("ceiling", -0.3, -24, 0),
    ];
  }

  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.limit = o.mode === "limit";
    this.look = this.limit ? Math.max(1, Math.round(((o.lookaheadMs ?? 5) / 1000) * sampleRate)) : 0;
    this.glide = 1 - Math.exp(-1 / (PARAM_GLIDE_SEC * sampleRate));
    this.s = null; // smoothed params, set from the first block (no glide-in)
    this.gr = 0; // smoothed gain reduction, dB (<= 0)
    // look-ahead: delayed audio + a sliding minimum of the gain each sample needs
    // the audio comes out exactly `look` samples late; the window of needed
    // gains covers that sample and every one after it up to now
    const size = Math.max(1, this.look);
    this.buf = [new Float32Array(size), new Float32Array(size)];
    this.pos = 0;
    this.qVal = new Float32Array(size + 2);
    this.qIdx = new Float64Array(size + 2);
    this.qHead = 0;
    this.qTail = 0;
    this.n = 0;
    this.reportMin = 0;
    this.reportCount = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const chans = output.length;
    if (chans === 0) return true;
    const len = output[0].length;
    const inL = input && input.length > 0 ? input[0] : null;
    const inR = input && input.length > 1 ? input[1] : inL;
    const outL = output[0];
    const outR = chans > 1 ? output[1] : null;

    const p = (name) => parameters[name][0];
    const target = {
      thr: p("threshold"),
      slope: 1 - 1 / Math.max(1, p("ratio")),
      knee: p("knee"),
      makeup: p("makeup"),
      drive: p("drive"),
      ceil: p("ceiling"),
      att: p("attack"),
      rel: p("release"),
    };
    if (!this.s) this.s = { ...target };
    const s = this.s;
    const a = this.glide;
    const attCoef = Math.exp(-1 / (Math.max(0.00005, target.att) * sampleRate));
    const relCoef = Math.exp(-1 / (Math.max(0.005, target.rel) * sampleRate));

    for (let i = 0; i < len; i++) {
      s.thr += (target.thr - s.thr) * a;
      s.slope += (target.slope - s.slope) * a;
      s.knee += (target.knee - s.knee) * a;
      s.makeup += (target.makeup - s.makeup) * a;
      s.drive += (target.drive - s.drive) * a;
      s.ceil += (target.ceil - s.ceil) * a;

      let l = inL ? inL[i] : 0;
      let r = inR ? inR[i] : 0;

      if (this.limit) {
        const g = Math.exp(s.drive * LN10_20);
        l *= g;
        r *= g;
        const peak = Math.max(l < 0 ? -l : l, r < 0 ? -r : r);
        const ceilLin = Math.exp(s.ceil * LN10_20);
        // the gain this sample needs (dB, <= 0)
        const need = peak > ceilLin ? (Math.log(ceilLin / peak) * DB_PER_LN) : 0;
        // sliding minimum over the look-ahead window (monotonic deque)
        const n = this.n++;
        while (this.qTail > this.qHead && this.qVal[(this.qTail - 1) % this.qVal.length] >= need) this.qTail--;
        this.qVal[this.qTail % this.qVal.length] = need;
        this.qIdx[this.qTail % this.qVal.length] = n;
        this.qTail++;
        while (this.qIdx[this.qHead % this.qVal.length] < n - this.look) this.qHead++;
        const want = this.qVal[this.qHead % this.qVal.length];
        // attack fast enough to be down within the look-ahead, release as set
        if (want < this.gr) this.gr = want + (this.gr - want) * attCoef;
        else this.gr = want + (this.gr - want) * relCoef;
        // delay the audio by the look-ahead
        const bl = this.buf[0];
        const br = this.buf[1];
        const dl = bl[this.pos];
        const dr = br[this.pos];
        bl[this.pos] = l;
        br[this.pos] = r;
        this.pos = this.pos + 1 >= bl.length ? 0 : this.pos + 1;
        const gl = Math.exp(this.gr * LN10_20);
        let yl = dl * gl;
        let yr = dr * gl;
        // the ceiling is a promise: whatever slipped past the envelope is clipped
        if (yl > ceilLin) yl = ceilLin;
        else if (yl < -ceilLin) yl = -ceilLin;
        if (yr > ceilLin) yr = ceilLin;
        else if (yr < -ceilLin) yr = -ceilLin;
        outL[i] = yl;
        if (outR) outR[i] = yr;
      } else {
        const peak = Math.max(l < 0 ? -l : l, r < 0 ? -r : r);
        const x = peak > 1e-6 ? Math.log(peak) * DB_PER_LN : -120;
        const over = x - s.thr;
        const w = s.knee;
        let want;
        if (2 * over <= -w) want = 0;
        else if (w > 0 && 2 * over < w) {
          const k = over + w / 2;
          want = (-s.slope * k * k) / (2 * w);
        } else want = -s.slope * over;
        if (want < this.gr) this.gr = want + (this.gr - want) * attCoef;
        else this.gr = want + (this.gr - want) * relCoef;
        const g = Math.exp((this.gr + s.makeup) * LN10_20);
        outL[i] = l * g;
        if (outR) outR[i] = r * g;
      }
      if (this.gr < this.reportMin) this.reportMin = this.gr;
    }

    this.reportCount += len;
    if (this.reportCount >= REPORT_EVERY) {
      this.port.postMessage(this.reportMin);
      this.reportCount = 0;
      this.reportMin = 0;
    }
    return true;
  }
}

registerProcessor("dynamics-processor", DynamicsProcessor);
