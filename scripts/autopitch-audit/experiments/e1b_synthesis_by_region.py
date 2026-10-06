#!/usr/bin/env python3
"""
E1b - synthesis quality with the SAME decisions, split by whether the engine's
decision was right (pitch agrees with Praat + Harvest) or wrong.
For each render (aligned to input time) and each 10 ms frame of an engine
voiced stretch: output pitch (Praat), distance to the INTENDED pitch (the
engine's own decision), frame-to-frame pitch change, harmonicity (HNR),
unvoiced/low-strength frames. Usage:
  python e1b_synthesis_by_region.py voice.wav trace.json detector.json label:path:delay_samples ...
"""
import json
import sys

import numpy as np
import parselmouth
from scipy.io import wavfile

voice, trace_path, det_path = sys.argv[1:4]
renders = [a.split(":") for a in sys.argv[4:]]
sr, x = wavfile.read(voice)
tr = json.load(open(trace_path))
det = json.load(open(det_path))
an = np.array(tr["analyses"], dtype=np.float64).reshape(-1, len(tr["analysisFields"]))
c = {k: i for i, k in enumerate(tr["analysisFields"])}
ft = an[:, c["frameCentre"]] / sr
voiced = (an[:, c["voiced"]] > 0) & (an[:, c["detMidi"]] > 0)
intended = an[:, c["detMidi"]] + an[:, c["correction"]]
dt = np.array(det["frame_t"])
wrong = np.array(det["wrong"]) > 0
check = np.array(det["checkable"]) > 0
grid = np.arange(0.05, len(x) / sr - 0.05, 0.01)
i = np.clip(np.searchsorted(ft, grid), 0, len(ft) - 1)
gv = voiced[i]
gint = intended[i]
j = np.clip(np.searchsorted(dt, grid), 0, len(dt) - 1)
right = gv & check[j] & ~wrong[j]
bad = gv & wrong[j]
out = {}
for label, path, delay in renders:
    srr, y = wavfile.read(path)
    y = y[:, 0].astype(np.float64) if y.ndim > 1 else y.astype(np.float64)
    d = int(delay)
    y = y[d:] if d >= 0 else np.concatenate([np.zeros(-d), y])
    snd = parselmouth.Sound(y, sampling_frequency=sr)
    p = snd.to_pitch_ac(time_step=0.01, pitch_floor=75.0, pitch_ceiling=900.0)
    pf = p.selected_array["frequency"]
    ps = p.selected_array["strength"]
    pt = p.xs()
    k = np.clip(np.round((grid - pt[0]) / 0.01).astype(int), 0, len(pf) - 1)
    f = pf[k]
    s = ps[k]
    h = snd.to_harmonicity_cc(time_step=0.01, minimum_pitch=75.0)
    hv = h.values[0]
    hk = np.clip(np.round((grid - h.xs()[0]) / 0.01).astype(int), 0, len(hv) - 1)
    hnr = hv[hk]
    res = {}
    for name, m in (("decision_right", right), ("decision_wrong", bad)):
        vm = m & (f > 0)
        err = np.abs(1200 * np.log2(f[vm] / (440 * 2 ** ((gint[vm] - 69) / 12))))
        mid = 69 + 12 * np.log2(np.where(f > 0, f, 1) / 440)
        cons = vm[1:] & vm[:-1] & m[1:] & m[:-1]
        step = np.abs(np.diff(mid))[cons] * 100
        res[name] = {
            "frames": int(m.sum()),
            "unvoiced_or_weak_pct": round(100 * float(np.mean((f[m] <= 0) | (s[m] < 0.45))), 2),
            "dist_to_intended_cents_med": round(float(np.median(err)), 2) if len(err) else None,
            "within_10c_of_intended_pct": round(100 * float(np.mean(err <= 10)), 2) if len(err) else None,
            "octave_off_pct": round(100 * float(np.mean(err > 600)), 2) if len(err) else None,
            "frame_to_frame_change_cents_med": round(float(np.median(step)), 2) if len(step) else None,
            "frame_to_frame_change_cents_p95": round(float(np.percentile(step, 95)), 2) if len(step) else None,
            "hnr_db_med": round(float(np.median(hnr[m][hnr[m] > -100])), 2) if np.any(hnr[m] > -100) else None,
        }
    out[label] = res
print(json.dumps(out, indent=1))
