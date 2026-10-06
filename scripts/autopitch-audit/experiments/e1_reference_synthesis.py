#!/usr/bin/env python3
"""
E1 - separate the note DECISION from the SYNTHESIS.

Reads the trace of an AutoPitch render (pipelineTrace.test.ts): for every
analysis frame the detected pitch, the target note and the correction. Writes
that trajectory to CSV, then re-synthesises the ORIGINAL voice with the SAME
intended pitch (detected + correction, i.e. the target note for Classic) using
two independent reference methods:
  - Praat Manipulation, overlap-add (TD-PSOLA)            -> <out>/ref_praat_psola.wav
  - WORLD vocoder (Harvest/CheapTrick/D4C), F0 replaced   -> <out>/ref_world.wav
Where the engine was unvoiced the reference keeps the voice's own pitch
(nothing is corrected there either). Usage:
  python e1_reference_synthesis.py voice.wav base_trace.json out_dir
"""
import json
import os
import sys

import numpy as np
import parselmouth
from parselmouth.praat import call
from scipy.io import wavfile

voice, trace_path, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
sr, x = wavfile.read(voice)
x = (x.astype(np.float64) / 32768.0) if x.dtype == np.int16 else x.astype(np.float64)
if x.ndim > 1:
    x = x.mean(axis=1)
tr = json.load(open(trace_path))
F = tr["analysisFields"]
an = np.array(tr["analyses"], dtype=np.float64).reshape(-1, len(F))
col = {k: i for i, k in enumerate(F)}
t = an[:, col["frameCentre"]] / sr
voiced = an[:, col["voiced"]] > 0
det = an[:, col["detMidi"]]
tgt = an[:, col["targetNote"]]
corr = an[:, col["correction"]]
intended = np.where(voiced & (det > 0), det + corr, np.nan)  # MIDI the engine wanted at that input instant

with open(os.path.join(out, "trajectory.csv"), "w") as fh:
    fh.write("t_s,voiced,detected_midi,target_note,correction_cents,intended_midi,intended_hz\n")
    for i in range(len(t)):
        ih = 440 * 2 ** ((intended[i] - 69) / 12) if intended[i] == intended[i] else float("nan")
        fh.write(f"{t[i]:.5f},{int(voiced[i])},{det[i]:.4f},{int(tgt[i])},{100 * corr[i]:.2f},{intended[i]:.4f},{ih:.3f}\n")
changes = [(t[i], int(tgt[i - 1]), int(tgt[i])) for i in range(1, len(t)) if voiced[i] and voiced[i - 1] and tgt[i] != tgt[i - 1] and tgt[i] >= 0 and tgt[i - 1] >= 0]
with open(os.path.join(out, "note_changes.csv"), "w") as fh:
    fh.write("t_s,from_note,to_note\n")
    for a, b, c in changes:
        fh.write(f"{a:.5f},{b},{c}\n")


def intended_at(times):
    """Intended MIDI at arbitrary times (nearest frame within 6 ms), NaN if the engine was unvoiced."""
    idx = np.clip(np.searchsorted(t, times), 1, len(t) - 1)
    left = idx - 1
    pick = np.where(np.abs(t[left] - times) < np.abs(t[idx] - times), left, idx)
    v = intended[pick]
    v[np.abs(t[pick] - times) > 0.006] = np.nan
    return v


# ---- Praat TD-PSOLA (Manipulation / overlap-add)
snd = parselmouth.Sound(x, sampling_frequency=sr)
manip = call(snd, "To Manipulation", 0.01, 75, 600)
orig_pt = call(manip, "Extract pitch tier")
dur = snd.duration
pt = call("Create PitchTier", "intended", 0, dur)
grid = np.arange(0.0, dur, 0.005)
want = intended_at(grid)
n_target = n_orig = 0
for tt, m in zip(grid, want):
    if m == m:
        call(pt, "Add point", float(tt), float(440 * 2 ** ((m - 69) / 12)))
        n_target += 1
    else:
        # keep the voice's own pitch where the engine did not correct
        npts = call(orig_pt, "Get number of points")
        if npts:
            v = call(orig_pt, "Get value at time", float(tt))
            if v == v and v > 0:
                call(pt, "Add point", float(tt), float(v))
                n_orig += 1
call([manip, pt], "Replace pitch tier")
res = call(manip, "Get resynthesis (overlap-add)")
y = res.values[0]
wavfile.write(os.path.join(out, "ref_praat_psola.wav"), sr, np.stack([y, y], 1).astype(np.float32))

# ---- WORLD vocoder with the F0 replaced
try:
    import pyworld as pw

    f0, tp = pw.harvest(x, sr, f0_floor=70.0, f0_ceil=800.0, frame_period=5.0)
    sp = pw.cheaptrick(x, f0, tp, sr)
    ap = pw.d4c(x, f0, tp, sr)
    w = intended_at(tp)
    f0n = f0.copy()
    sel = (f0 > 0) & (w == w)
    f0n[sel] = 440 * 2 ** ((w[sel] - 69) / 12)
    yw = pw.synthesize(f0n, sp, ap, sr, frame_period=5.0)[: len(x)]
    wavfile.write(os.path.join(out, "ref_world.wav"), sr, np.stack([yw, yw], 1).astype(np.float32))
    world_note = f"WORLD: {sel.sum()} of {int((f0 > 0).sum())} voiced 5 ms frames set to the engine's intended pitch"
except Exception as exc:  # pragma: no cover
    world_note = f"WORLD unavailable: {exc}"

print(json.dumps({
    "frames": int(len(t)),
    "engine_voiced_frames": int(voiced.sum()),
    "note_changes": len(changes),
    "praat_points_target": n_target,
    "praat_points_original": n_orig,
    "world": world_note,
}))
