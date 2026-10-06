#!/usr/bin/env python3
"""
Builds experiment variants of the AutoPitch worklet from the baseline source by
exact text substitution (each one fails loudly if its anchor is missing), so
every variant differs from the baseline in ONE mechanism:
  wait1 / wait2   - a new target note (and the first note of a phrase) is only
                    applied after it has been proposed 1 / 2 more analyses
  look1 / look2   - lookahead: decisions use readings from 1 / 2 later frames
                    (centred median of 3 / 5 readings); detection, epochs and
                    synthesis are delayed together, latency +2*N*HOP
  look1s          - look1 with only +1 HOP of extra latency (the decision
                    arrives one hop late, so one hop should be enough)
  hjl1s           - hj + look1s
  hjd1 / hjd2     - hj with the lead latency D + 1 / + 2 HOP and NO lookahead
                    (does the attack gain of look1 come from the decision or
                    from the extra synthesis margin?)
  hjl1            - hj + look1 (+2 HOP)
  jhold           - conservative alternative to jfix: while a big jump is
                    pending (reading replaced by the held pitch) the outlier
                    hold is left alone instead of being reset, so confirm and
                    hold no longer undo each other: a wrong lock releases, and a
                    new jump lands, after ~6 consistent readings (~35 ms)
  jhl1 / hjhl1    - jhold + look1 (+2 HOP) / hguard + jhold + look1
  look1n          - look1 with a neutral rule when only 2 of the 3 readings
                    are usable: keep the centre reading (look1 takes the LOWER
                    one, which picked a sub-octave at a re-onset, 26.3 s)
  harm            - (first try, kept for the record) hguard + a big jump
                    confirmed by 2 of the last 3 readings. Did NOT unstick the
                    long locks: the real cause is jfix's
  hguard          - detector: when a much deeper YIN dip sits at an integer
                    multiple of the picked lag, take it (harmonic lock)
  jfix            - a big jump that the octave-jump confirmation has just
                    confirmed is not held back again by the outlier hold. In
                    the baseline the two alternate (confirm, hold, the hold
                    resets, confirm...) and a wrong lock sticks for 600 ms
  hj              - hguard + jfix
  reg             - synthesis: under hard tune (followGain g) the next mark is
                    placed one 3-period AVERAGE input period / ratio instead of
                    the single next period / ratio, i.e. spacing
                    pref * (after/pref)^(1-g) / r: at g = 1 the output period
                    is the target period every cycle (no inherited cycle-to-
                    cycle float), at g = 0 (amount 0, slow retune) unchanged
  fadeXX          - dry/tuned crossfade time constant XX ms (baseline 8)
Usage: python make_variants.py baseline.js out_dir
"""
import os
import sys

base_path, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
BASE = open(base_path).read()


def sub(src, old, new, count=1):
    if src.count(old) < 1:
        raise SystemExit(f"anchor not found: {old[:90]!r}")
    return src.replace(old, new, count)


def wait(src, n):
    src = sub(src, "    this.targetNote = null;\n", f"    this.targetNote = null;\n    this.onsetWait = 0;\n    this.pendingNext = null;\n    this.pendingCount = 0;\n")
    src = sub(src, """    if (this.targetNote === null) {
      this.targetNote = nearest;""", f"""    if (this.targetNote === null && this.onsetWait < {n}) {{
      this.onsetWait++;
      this.followGain = 0;
      this.correction = 0;
      this.pushHistory();
      return;
    }}
    if (this.targetNote === null) {{
      this.targetNote = nearest;""")
    src = sub(src, """      if (next !== null) {
        this.targetNote = next;""", f"""      if (next !== null) {{
        if (next !== this.pendingNext) {{
          this.pendingNext = next;
          this.pendingCount = 0;
        }}
        this.pendingCount++;
        if (this.pendingCount <= {n}) next = null;
      }} else {{
        this.pendingNext = null;
        this.pendingCount = 0;
      }}
      if (next !== null) {{
        this.pendingNext = null;
        this.pendingCount = 0;
        this.targetNote = next;""")
    # reset the onset wait when the phrase ends
    src = sub(src, """      if (!this.voiced) {
        this.prev1 = null;""", """      if (!this.voiced) {
        this.onsetWait = 0;
        this.prev1 = null;""")
    return src


def look(src, n, extra=2, neutral=False):
    hop = "HOP"
    src = sub(src, "    const leadD = Math.round(sr * (lowLatency ? 0.014 : 0.026));", f"    const leadD = Math.round(sr * (lowLatency ? 0.014 : 0.026)) + {extra} * {n} * {hop};")
    # measurement now, decision N frames later on a centred median
    src = sub(src, """  analyze() {
    const p = this.p;
    const ref = p.referenceHz;
    const dt = HOP / this.sr;
    const det = this.yin();""", f"""  analyze() {{
    const m = this.yin();
    if (!this.lookFifo) this.lookFifo = [];
    this.lookFifo.push({{ hz: m.hz, confidence: m.confidence, rms: m.rms, n: this.n }});
    if (this.lookFifo.length > 2 * {n} + 1) this.lookFifo.shift();
    if (this.lookFifo.length < {n} + 1) return;
    const item = this.lookFifo[this.lookFifo.length - 1 - {n}];
    const good = this.lookFifo.filter((f) => f.rms >= GATE_RMS && f.confidence >= MIN_CONFIDENCE && f.hz > 0 && f.hz < Infinity).map((f) => Math.log(f.hz)).sort((a, b) => a - b);
    let hz = item.hz;
    if (good.length >= {n} + 1 && item.hz > 0) hz = Math.exp(good[(good.length - 1) >> 1]);{"" if not neutral else chr(10) + "    if (good.length === 2 && item.rms >= GATE_RMS && item.confidence >= MIN_CONFIDENCE) hz = item.hz;"}
    this.decide({{ hz, confidence: item.confidence, rms: item.rms }}, item.n);
  }}

  decide(det, nFrame) {{
    const p = this.p;
    const ref = p.referenceHz;
    const dt = HOP / this.sr;""")
    src = sub(src, "      this.voicedAt = this.n;", "      this.voicedAt = nFrame;")
    src = sub(src, "      this.pushHistory();\n      return;", "      this.pushHistory(nFrame);\n      return;")
    src = sub(src, "    this.outMidi = d + this.correction;\n    this.pushHistory();", "    this.outMidi = d + this.correction;\n    this.pushHistory(nFrame);")
    src = sub(src, """  pushHistory() {
    // centre of the frame just analysed, in input samples
    const center = this.n - (this.frameLen * DECIM) / 2;""", """  pushHistory(nFrame) {
    // centre of the frame just analysed, in input samples
    const center = (nFrame === undefined ? this.n : nFrame) - (this.frameLen * DECIM) / 2;""")
    src = sub(src, "      this.trackEpochs(n);", f"      this.trackEpochs(n - {n} * HOP);")
    return src


def hguard(src):
    return sub(src, """    // Subharmonic guard: the first dip under the threshold can be a multiple of""", """    // Harmonic lock guard: with a strong 3rd/2nd harmonic the first dip under
    // the threshold can be a FRACTION of the true period while the true
    // period's dip is far deeper (real vocal, 10.9 s: d = 0.135 at 649 Hz vs
    // 0.004 at 221 Hz). Take the multiple when it is much better.
    {
      const d0 = d[tauEstimate];
      let bestM = tauEstimate;
      let bestMd = d0;
      for (let mult = 2; mult <= 5; mult++) {
        const c = tauEstimate * mult;
        const lo = Math.max(minTau, Math.floor(c * 0.97));
        const hi = Math.min(maxTau, Math.ceil(c * 1.03));
        for (let t = lo; t <= hi; t++) {
          if (d[t] < bestMd && d[t] <= 0.5 * d0 && d[t] < 0.15 && d[t] <= d[t - 1] && d[t] <= d[t + 1]) {
            bestMd = d[t];
            bestM = t;
          }
        }
      }
      tauEstimate = bestM;
    }
    // Subharmonic guard: the first dip under the threshold can be a multiple of""")


def jfix(src):
    src = sub(src, """      let raw = hzToMidi(det.hz, ref);
      // octave-jump confirmation""", """      let raw = hzToMidi(det.hz, ref);
      let jumpConfirmed = false;
      // octave-jump confirmation""")
    src = sub(src, """          this.pendingJump = null;
          this.medianCount = 0;""", """          this.pendingJump = null;
          this.medianCount = 0;
          jumpConfirmed = true;""")
    src = sub(src, """      if (steady && Math.abs(raw - this.prev1) > 0.5""", """      // (a jump the octave confirmation above has just confirmed is not held
      // again: the two used to alternate and a wrong lock stuck for 600 ms)
      if (!jumpConfirmed && steady && Math.abs(raw - this.prev1) > 0.5""")
    return src


def jhold(src):
    src = sub(src, """      let raw = hzToMidi(det.hz, ref);
      // octave-jump confirmation""", """      let raw = hzToMidi(det.hz, ref);
      let jumpPending = false;
      // octave-jump confirmation""")
    src = sub(src, """          this.pendingJump = raw;
          raw = this.detMidi;""", """          this.pendingJump = raw;
          raw = this.detMidi;
          jumpPending = true;""")
    src = sub(src, """      } else {
        this.suspect = null;
        this.suspectHops = 0;
        this.holdHops = 0;
      }""", """      } else if (!jumpPending) {
        this.suspect = null;
        this.suspectHops = 0;
        this.holdHops = 0;
      }""")
    return src


def harm(src):
    src = hguard(src)
    src = sub(src, """      if (this.detMidi !== null && wasVoiced && Math.abs(raw - this.detMidi) > 7) {
        if (this.pendingJump !== null && Math.abs(raw - this.pendingJump) < 1) {
          this.pendingJump = null;
          this.medianCount = 0;
        } else {
          this.pendingJump = raw;
          raw = this.detMidi;
        }
      } else {
        this.pendingJump = null;
      }""", """      // (confirmed by 2 of the last 3 readings, not 2 in a row: a wrong lock
      // with readings alternating wrong/right used to stick for 600 ms)
      if (!this.jumpHist) this.jumpHist = [];
      const isJump = this.detMidi !== null && wasVoiced && Math.abs(raw - this.detMidi) > 7;
      if (isJump) {
        let agree = 0;
        for (const r of this.jumpHist) if (r !== null && Math.abs(r - raw) < 1) agree++;
        this.jumpHist.push(raw);
        if (agree >= 1) {
          this.jumpHist = [];
        } else {
          raw = this.detMidi;
        }
      } else {
        this.jumpHist.push(null);
      }
      if (this.jumpHist.length > 2) this.jumpHist.shift();""")
    return src


def reg(src):
    src = sub(src, """    let r = ratio;
    const g = Math.min(this.histG0, this.histG1);
    if (g > 0 && this.epochCount > 4 && this.epochVoiced[k] && this.epochVoiced[(k - 3) & 511]) {
      const latest = (this.epochCount - 1) & 511;
      const pref = k !== latest""", """    let r = ratio;
    let span = after;
    const g = Math.min(this.histG0, this.histG1);
    if (g > 0 && this.epochCount > 4 && this.epochVoiced[k] && this.epochVoiced[(k - 3) & 511]) {
      const latest = (this.epochCount - 1) & 511;
      const pref = k !== latest""")
    src = sub(src, """        if (Math.abs(diff) < 0.5) r = ratio * Math.pow(2, (g * diff) / 12);
      }
    }
    let hop = Math.max(8, after / r);""", """        if (Math.abs(diff) < 0.5) {
          r = ratio * Math.pow(2, (g * diff) / 12);
          span = pref * Math.pow(after / pref, 1 - g);
        }
      }
    }
    let hop = Math.max(8, span / r);""")
    return src


def dplus(src, hops):
    return sub(src, "    const leadD = Math.round(sr * (lowLatency ? 0.014 : 0.026));", f"    const leadD = Math.round(sr * (lowLatency ? 0.014 : 0.026)) + {hops} * HOP;")


def fade(src, ms):
    return sub(src, "    const gateA = 1 - Math.exp(-1 / (0.008 * sr));", f"    const gateA = 1 - Math.exp(-1 / ({ms / 1000} * sr));")


variants = {
    "wait1": wait(BASE, 1),
    "wait2": wait(BASE, 2),
    "look1": look(BASE, 1),
    "look2": look(BASE, 2),
    "harm": harm(BASE),
    "hguard": hguard(BASE),
    "jfix": jfix(BASE),
    "hj": jfix(hguard(BASE)),
    "reg": reg(BASE),
    "look1s": look(BASE, 1, 1),
    "hjl1s": look(jfix(hguard(BASE)), 1, 1),
    "hjd1": dplus(jfix(hguard(BASE)), 1),
    "hjd2": dplus(jfix(hguard(BASE)), 2),
    "hjl1": look(jfix(hguard(BASE)), 1, 2),
    "jh": jhold(BASE),
    "look1n": look(BASE, 1, 2, True),
    "jhl1": look(jhold(BASE), 1, 2),
    "hjhl1": look(jhold(hguard(BASE)), 1, 2),
    "fade4": fade(BASE, 4),
    "fade12": fade(BASE, 12),
    "fade16": fade(BASE, 16),
}
for name, src in variants.items():
    open(os.path.join(out, f"{name}.js"), "w").write(src)
    print(name, len(src))
