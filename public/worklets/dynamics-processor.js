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
    // smoothed params, set from the first block (no glide-in)
    this.ready = false;
    this.sThr = 0;
    this.sSlope = 0;
    this.sKnee = 0;
    this.sMakeup = 0;
    this.sDrive = 0;
    this.sCeil = 0;
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
    this.silentRun = 0; // input samples in a row that were exactly 0
    this.reportMin = 0;
    this.reportCount = 0;
    // CPU meter for Ajustes > Rendimiento (off unless the page asks)
    this.meter = null;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === "prof") this.meter = e.data.on ? { ms: 0, blocks: 0, over2: 0, over4: 0, max: 0, since: currentTime } : null;
    };
  }

  /** process() with its running time added up (Date.now(), 1 ms steps: a
   * sum over thousands of blocks is unbiased), reported once per second of
   * audio. Only while the meter is on. */
  process(inputs, outputs, parameters) {
    const m = this.meter;
    if (!m) return this.run(inputs, outputs, parameters);
    const t0 = Date.now();
    const keep = this.run(inputs, outputs, parameters);
    const dt = Date.now() - t0;
    m.ms += dt;
    m.blocks++;
    if (dt >= 2) m.over2++;
    if (dt >= 4) m.over4++;
    if (dt > m.max) m.max = dt;
    if (currentTime - m.since >= 1) {
      this.port.postMessage({ prof: { ms: m.ms, blocks: m.blocks, over2: m.over2, over4: m.over4, max: m.max, sec: currentTime - m.since } });
      m.ms = 0;
      m.blocks = 0;
      m.over2 = 0;
      m.over4 = 0;
      m.max = 0;
      m.since = currentTime;
    }
    return keep;
  }

  /** Sends the gain reduction to the UI meters every REPORT_EVERY samples. */
  report(len) {
    this.reportCount += len;
    if (this.reportCount >= REPORT_EVERY) {
      this.port.postMessage(this.reportMin);
      this.reportCount = 0;
      this.reportMin = 0;
    }
  }

  // Runs on the audio thread for every 128 samples of every compressor,
  // de-esser, limiter and band in the session: nothing is allocated here
  // (garbage collection on the audio thread is heard as dropouts), a silent
  // input costs almost nothing (a track with nothing playing used to cost
  // as much as a singing one), and while no knob moves the parameters are
  // not re-derived per sample.
  run(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const chans = output.length;
    if (chans === 0) return true;
    const len = output[0].length;
    const inL = input && input.length > 0 ? input[0] : null;
    const inR = input && input.length > 1 ? input[1] : inL;
    const outL = output[0];
    const outR = chans > 1 ? output[1] : null;

    const tThr = parameters.threshold[0];
    const tSlope = 1 - 1 / Math.max(1, parameters.ratio[0]);
    const tKnee = parameters.knee[0];
    const tMakeup = parameters.makeup[0];
    const tDrive = parameters.drive[0];
    const tCeil = parameters.ceiling[0];
    if (!this.ready) {
      this.ready = true;
      this.sThr = tThr;
      this.sSlope = tSlope;
      this.sKnee = tKnee;
      this.sMakeup = tMakeup;
      this.sDrive = tDrive;
      this.sCeil = tCeil;
    }
    const a = this.glide;
    const attCoef = Math.exp(-1 / (Math.max(0.00005, parameters.attack[0]) * sampleRate));
    const relCoef = Math.exp(-1 / (Math.max(0.005, parameters.release[0]) * sampleRate));

    // Silence in, and nothing still in the look-ahead line: the output is
    // silence too. Advance the state exactly as the sample loop would (the
    // reduction only releases, the parameters keep gliding) and stop there.
    let silent = true;
    if (inL) {
      for (let i = 0; i < len; i++) {
        if (inL[i] !== 0) {
          silent = false;
          break;
        }
      }
      if (silent && inR !== inL) {
        for (let i = 0; i < len; i++) {
          if (inR[i] !== 0) {
            silent = false;
            break;
          }
        }
      }
    }
    if (silent && this.silentRun >= this.look) {
      this.silentRun += len;
      outL.fill(0);
      if (outR) outR.fill(0);
      const keep = Math.pow(1 - a, len);
      this.sThr = tThr + (this.sThr - tThr) * keep;
      this.sSlope = tSlope + (this.sSlope - tSlope) * keep;
      this.sKnee = tKnee + (this.sKnee - tKnee) * keep;
      this.sMakeup = tMakeup + (this.sMakeup - tMakeup) * keep;
      this.sDrive = tDrive + (this.sDrive - tDrive) * keep;
      this.sCeil = tCeil + (this.sCeil - tCeil) * keep;
      if (this.gr * relCoef < this.reportMin) this.reportMin = this.gr * relCoef;
      this.gr *= Math.pow(relCoef, len);
      if (this.gr > -1e-7) this.gr = 0;
      if (this.limit) {
        // the window now holds only silent samples: one "no reduction" entry
        this.n += len;
        this.qHead = 0;
        this.qTail = 1;
        this.qVal[0] = 0;
        this.qIdx[0] = this.n - 1;
        this.pos = (this.pos + len) % this.buf[0].length;
      }
      this.report(len);
      return true;
    }
    this.silentRun = silent ? this.silentRun + len : 0;

    // Parameters still gliding towards a knob move: per sample, as before.
    // Settled: snap them and derive the gains once for the whole block.
    const eps = 1e-6;
    let gliding =
      Math.abs(tThr - this.sThr) > eps ||
      Math.abs(tSlope - this.sSlope) > eps ||
      Math.abs(tKnee - this.sKnee) > eps ||
      Math.abs(tMakeup - this.sMakeup) > eps ||
      Math.abs(tDrive - this.sDrive) > eps ||
      Math.abs(tCeil - this.sCeil) > eps;
    if (!gliding) {
      this.sThr = tThr;
      this.sSlope = tSlope;
      this.sKnee = tKnee;
      this.sMakeup = tMakeup;
      this.sDrive = tDrive;
      this.sCeil = tCeil;
    }
    let sThr = this.sThr;
    let sSlope = this.sSlope;
    let sKnee = this.sKnee;
    let sMakeup = this.sMakeup;
    let sDrive = this.sDrive;
    let sCeil = this.sCeil;
    let driveLin = Math.exp(sDrive * LN10_20);
    let ceilLin = Math.exp(sCeil * LN10_20);
    let makeupLin = Math.exp(sMakeup * LN10_20);
    // below this peak level the gain computer asks for no reduction at all
    let kneeLin = Math.exp((sThr - sKnee / 2) * LN10_20);
    let gr = this.gr;
    let reportMin = this.reportMin;

    for (let i = 0; i < len; i++) {
      if (gliding) {
        sThr += (tThr - sThr) * a;
        sSlope += (tSlope - sSlope) * a;
        sKnee += (tKnee - sKnee) * a;
        sMakeup += (tMakeup - sMakeup) * a;
        sDrive += (tDrive - sDrive) * a;
        sCeil += (tCeil - sCeil) * a;
        driveLin = Math.exp(sDrive * LN10_20);
        ceilLin = Math.exp(sCeil * LN10_20);
        makeupLin = Math.exp(sMakeup * LN10_20);
        kneeLin = Math.exp((sThr - sKnee / 2) * LN10_20);
      }

      let l = inL ? inL[i] : 0;
      let r = inR ? inR[i] : 0;

      if (this.limit) {
        l *= driveLin;
        r *= driveLin;
        const peak = Math.max(l < 0 ? -l : l, r < 0 ? -r : r);
        // the gain this sample needs (dB, <= 0)
        const need = peak > ceilLin ? Math.log(ceilLin / peak) * DB_PER_LN : 0;
        // sliding minimum over the look-ahead window (monotonic deque)
        const qLen = this.qVal.length;
        const n = this.n++;
        while (this.qTail > this.qHead && this.qVal[(this.qTail - 1) % qLen] >= need) this.qTail--;
        this.qVal[this.qTail % qLen] = need;
        this.qIdx[this.qTail % qLen] = n;
        this.qTail++;
        while (this.qIdx[this.qHead % qLen] < n - this.look) this.qHead++;
        const want = this.qVal[this.qHead % qLen];
        // attack fast enough to be down within the look-ahead, release as set
        if (want < gr) gr = want + (gr - want) * attCoef;
        else {
          gr = want + (gr - want) * relCoef;
          if (want === 0 && gr > -1e-7) gr = 0;
        }
        // delay the audio by the look-ahead
        const bl = this.buf[0];
        const br = this.buf[1];
        const pos = this.pos;
        const dl = bl[pos];
        const dr = br[pos];
        bl[pos] = l;
        br[pos] = r;
        this.pos = pos + 1 >= bl.length ? 0 : pos + 1;
        const gl = gr === 0 ? 1 : Math.exp(gr * LN10_20);
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
        let want = 0;
        if (peak >= kneeLin) {
          const x = peak > 1e-6 ? Math.log(peak) * DB_PER_LN : -120;
          const over = x - sThr;
          const w = sKnee;
          if (2 * over <= -w) want = 0;
          else if (w > 0 && 2 * over < w) {
            const k = over + w / 2;
            want = (-sSlope * k * k) / (2 * w);
          } else want = -sSlope * over;
        }
        if (want < gr) gr = want + (gr - want) * attCoef;
        else {
          gr = want + (gr - want) * relCoef;
          if (want === 0 && gr > -1e-7) gr = 0;
        }
        const g = gr === 0 ? makeupLin : Math.exp((gr + sMakeup) * LN10_20);
        outL[i] = l * g;
        if (outR) outR[i] = r * g;
      }
      if (gr < reportMin) reportMin = gr;
    }

    this.gr = gr;
    this.reportMin = reportMin;
    if (gliding) {
      this.sThr = sThr;
      this.sSlope = sSlope;
      this.sKnee = sKnee;
      this.sMakeup = sMakeup;
      this.sDrive = sDrive;
      this.sCeil = sCeil;
    }
    this.report(len);
    return true;
  }
}

registerProcessor("dynamics-processor", DynamicsProcessor);
