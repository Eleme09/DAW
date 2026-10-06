#!/usr/bin/env python3
"""
Engine pitch decisions vs two independent references (Praat autocorrelation
and WORLD Harvest). A frame where both references agree with each other and
not with the engine is counted as an ENGINE error, then typed:
  harmonic   - engine/ref ~ 2, 3, 4 (locked on a harmonic: reads too high)
  subharmonic- engine/ref ~ 1/2, 1/3
  held       - engine within a fifth of the voice but > 1.8 st off (a stale
               held reading, a glide not followed)
  other
and located: attack (first 50 ms of an engine voiced run) or mid-note.
Writes a JSON with per-frame flags the other experiments reuse.
Usage: python detector_vs_references.py voice.wav trace.json out.json
"""
import json
import sys

import numpy as np
import parselmouth
import pyworld as pw
from scipy.io import wavfile

voice, trace_path, out_path = sys.argv[1:4]
sr, x = wavfile.read(voice)
x = (x.astype(np.float64) / 32768.0) if x.dtype == np.int16 else x.astype(np.float64)
if x.ndim > 1:
    x = x.mean(axis=1)
tr = json.load(open(trace_path))
F = tr["analysisFields"]
an = np.array(tr["analyses"], dtype=np.float64).reshape(-1, len(F))
c = {k: i for i, k in enumerate(F)}
t = an[:, c["frameCentre"]] / sr
voiced = (an[:, c["voiced"]] > 0) & (an[:, c["detMidi"]] > 0)
fe = 440 * 2 ** ((an[:, c["detMidi"]] - 69) / 12)

snd = parselmouth.Sound(x, sampling_frequency=sr)
p = snd.to_pitch_ac(time_step=0.005, pitch_floor=75.0, pitch_ceiling=600.0)
pt, pf = p.xs(), p.selected_array["frequency"]
fh, th = pw.harvest(x, sr, f0_floor=70.0, f0_ceil=800.0, frame_period=5.0)


def at(tt, times, vals):
    return vals[np.clip(np.round((tt - times[0]) / (times[1] - times[0])).astype(int), 0, len(vals) - 1)]


fp = at(t, pt, pf)
fhh = at(t, th, fh)
with np.errstate(divide="ignore", invalid="ignore"):
    ok = voiced & (fp > 0) & (fhh > 0)
    refs_agree = np.abs(np.log2(fp / fhh)) < 0.15
    ref = np.sqrt(fp * fhh)
    r = fe / ref
    eng_ok = np.abs(np.log2(r)) < 0.15
wrong = ok & refs_agree & ~eng_ok
# onsets of engine voiced runs
onset = np.zeros(len(t), bool)
start = None
for i in range(len(t)):
    if voiced[i] and (i == 0 or not voiced[i - 1]):
        start = t[i]
    if voiced[i] and start is not None and t[i] - start < 0.05:
        onset[i] = True


def kind(ratio):
    for k in (2, 3, 4, 5):
        if abs(np.log2(ratio / k)) < 0.08:
            return "harmonic"
    for k in (2, 3):
        if abs(np.log2(ratio * k)) < 0.08:
            return "subharmonic"
    if abs(np.log2(ratio)) < np.log2(1.5):
        return "held"
    return "other"


types = np.array([kind(v) if w else "" for v, w in zip(r, wrong)])
hop = float(np.median(np.diff(t)))
res = {
    "voiced_frames_with_both_refs": int(ok.sum()),
    "refs_agree_frames": int((ok & refs_agree).sum()),
    "engine_wrong_frames": int(wrong.sum()),
    "engine_wrong_pct_of_checkable": round(100 * float(wrong.sum() / max((ok & refs_agree).sum(), 1)), 2),
    "engine_wrong_seconds": round(float(wrong.sum() * hop), 3),
    "by_type": {k: int(((types == k)).sum()) for k in ("harmonic", "subharmonic", "held", "other")},
    "at_attack_first_50ms": int((wrong & onset).sum()),
    "mid_note": int((wrong & ~onset).sum()),
    "attack_frames_total": int((ok & refs_agree & onset).sum()),
    "attack_error_rate_pct": round(100 * float((wrong & onset).sum() / max((ok & refs_agree & onset).sum(), 1)), 2),
    "mid_note_error_rate_pct": round(100 * float((wrong & ~onset).sum() / max((ok & refs_agree & ~onset).sum(), 1)), 2),
}
runs = []
cur = []
for i in range(len(t)):
    if wrong[i]:
        cur.append(i)
    elif cur:
        runs.append(cur)
        cur = []
if cur:
    runs.append(cur)
lens = np.array([len(u) * hop * 1000 for u in runs]) if runs else np.array([0.0])
res["runs"] = {"count": len(runs), "ms_median": round(float(np.median(lens)), 1), "ms_p90": round(float(np.percentile(lens, 90)), 1), "ms_max": round(float(lens.max()), 1)}
res["longest_runs"] = [
    {"t": round(float(t[u[0]]), 3), "ms": round(len(u) * hop * 1000, 1), "type": types[u[len(u) // 2]], "engine_hz": round(float(fe[u[len(u) // 2]]), 1), "ref_hz": round(float(ref[u[len(u) // 2]]), 1)}
    for u in sorted(runs, key=len, reverse=True)[:12]
]
json.dump({"summary": res, "frame_t": t.tolist(), "wrong": wrong.astype(int).tolist(), "checkable": (ok & refs_agree).astype(int).tolist(), "onset": onset.astype(int).tolist(), "ref_hz": np.nan_to_num(ref).tolist()}, open(out_path, "w"))
print(json.dumps(res, indent=1))
