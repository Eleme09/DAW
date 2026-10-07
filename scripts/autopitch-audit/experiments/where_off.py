#!/usr/bin/env python3
"""
Where does the tuned output miss the note? Splits the voiced output frames by
situation and reports how many sit within 10 / 25 cents of a note of the key:

  - held:     the engine's target note stays the same 60 ms before and after
  - change:   within 60 ms of a target-note change
  - onset:    first 60 ms after the engine starts a voiced stretch
  - and the input's own motion in each frame (cents/10 ms, from Praat on the
    input) to tell slides from steady singing.

Also "ideal": the note of the key nearest to what was SUNG at that instant
(Praat on the input, no lag, no hysteresis) - how often the engine's target
disagrees with it, i.e. decision lag / wrong-note time.

Usage: python where_off.py voice.wav out.wav trace.json [key=9]
(trace from src/audio-engine/autopitch/pipelineTrace.test.ts)
"""
import json
import sys

import numpy as np
import parselmouth
from scipy.io import wavfile

voice, out, trace_path = sys.argv[1:4]
key = int(sys.argv[4]) if len(sys.argv) > 4 else 9
SCALE = np.array([0, 2, 4, 5, 7, 9, 11])


def load(p):
    sr, y = wavfile.read(p)
    y = y.astype(np.float64)
    y = y.mean(axis=1) if y.ndim > 1 else y
    return sr, (y / 32768 if np.abs(y).max() > 2 else y)


def track(y, sr, step=0.005):
    p = parselmouth.Sound(y, sampling_frequency=sr).to_pitch_ac(time_step=step, pitch_floor=70, pitch_ceiling=900, voicing_threshold=0.5)
    f = p.selected_array["frequency"]
    return p.xs(), np.where(f > 0, 69 + 12 * np.log2(np.maximum(f, 1) / 440), np.nan)


def scale_dist(m):
    pcs = (key + SCALE) % 12
    d = ((m[:, None] - pcs[None, :]) + 6) % 12 - 6
    return np.min(np.abs(d), axis=1) * 100


def nearest_note(m):
    pcs = (key + SCALE) % 12
    cand = np.round(m)[:, None] + np.arange(-2, 3)[None, :]
    ok = np.isin(cand % 12, pcs)
    d = np.where(ok, np.abs(cand - m[:, None]), 99)
    return cand[np.arange(len(m)), np.argmin(d, axis=1)]


sr, x = load(voice)
_, y = load(out)
tr = json.load(open(trace_path))
F = tr["analysisFields"]
an = np.array(tr["analyses"], dtype=np.float64).reshape(-1, len(F))
c = {k: i for i, k in enumerate(F)}
D = tr["delay"] / sr
ft = an[:, c["frameCentre"]] / sr
voiced = an[:, c["voiced"]] > 0
tgt = np.where(voiced, an[:, c["targetNote"]], np.nan)

T, mo = track(y, sr)
Ti, mi = track(x, sr)
tin = T - D  # output frame -> input instant
end = ft[-1]
sel = (tin > 0.1) & (tin < end) & ~np.isnan(mo)
tin, mo, T = tin[sel], mo[sel], T[sel]


def at(arr, t):
    i = np.clip(np.searchsorted(ft, t), 1, len(ft) - 1)
    j = np.where(np.abs(ft[i - 1] - t) < np.abs(ft[i] - t), i - 1, i)
    return arr[j]


g = at(tgt, tin)
ok = ~np.isnan(g)
held = ok.copy()
for dt in np.arange(-0.06, 0.0601, 0.01):
    gg = at(tgt, tin + dt)
    held &= gg == g
# onset: some frame in the previous 60 ms was unvoiced for the engine
was_unv = np.zeros(len(tin), bool)
for dt in np.arange(0.005, 0.0601, 0.005):
    was_unv |= np.isnan(at(tgt, tin - dt))
onset = ok & was_unv
change = ok & ~held & ~onset
held = held & ~onset

# what was sung, and how fast it moved
sung = np.interp(tin, Ti, np.where(np.isnan(mi), -1, mi))
sung[sung < 0] = np.nan
slope = np.abs(np.interp(tin + 0.005, Ti, np.nan_to_num(mi)) - np.interp(tin - 0.005, Ti, np.nan_to_num(mi))) * 100  # cents / 10 ms
steady_in = slope < 10

err = np.abs(mo - g) * 100
oct_err = err > 600
sd = scale_dist(mo)


def row(name, m):
    n = int(m.sum())
    if n == 0:
        return f"{name:28s}    0"
    e = err[m & ~oct_err]
    return (f"{name:28s} {n:5d} ({n / ok.sum() * 100:4.1f} %)  vs target <10c {np.mean(e < 10) * 100:5.1f} %  <25c {np.mean(e < 25) * 100:5.1f} %"
            f"  med {np.median(e):5.1f} c  octave {np.mean(oct_err[m]) * 100:4.1f} %  scale<10c {np.mean(sd[m] < 10) * 100:5.1f} %")


print(row("all voiced+target", ok))
print(row("held note", held))
print(row("  held, input steady", held & steady_in))
print(row("  held, input moving", held & ~steady_in))
print(row("note change +-60 ms", change))
print(row("onset first 60 ms", onset))
ideal = nearest_note(np.where(np.isnan(sung), 0, sung))
agree = ok & ~np.isnan(sung)
print(f"target == nearest sung note: {np.mean(g[agree] == ideal[agree]) * 100:.1f} % of {agree.sum()} frames"
      f" (held {np.mean((g == ideal)[agree & held]) * 100:.1f} %, change {np.mean((g == ideal)[agree & change]) * 100:.1f} %, onset {np.mean((g == ideal)[agree & onset]) * 100:.1f} %)")

# time profile: share within 10 cents by time since the engine's voicing onset,
# and by time from the nearest target change (negative = before it)
since_on = np.full(len(tin), np.nan)
for dt in np.arange(0.06, 0.0, -0.005):
    since_on[ok & np.isnan(at(tgt, tin - dt))] = dt
print("onset profile (ms since voicing -> % <10c / median c):",
      "  ".join(f"{int(a * 1000)}-{int((a + 0.01) * 1000)}: {np.mean(err[(since_on > a) & (since_on <= a + 0.01)] < 10) * 100:.0f}%/{np.median(err[(since_on > a) & (since_on <= a + 0.01)]):.0f}c"
              for a in np.arange(0, 0.06, 0.01) if np.any((since_on > a) & (since_on <= a + 0.01))))
chg_t = ft[1:][(tgt[1:] != tgt[:-1]) & ~np.isnan(tgt[1:]) & ~np.isnan(tgt[:-1])]
rel = tin - chg_t[np.clip(np.searchsorted(chg_t, tin), 0, len(chg_t) - 1)]
rel2 = tin - chg_t[np.clip(np.searchsorted(chg_t, tin) - 1, 0, len(chg_t) - 1)]
rel = np.where(np.abs(rel2) < np.abs(rel), rel2, rel)
cz = ok & (np.abs(rel) <= 0.06) & ~onset
print("change profile (ms from target change -> % <10c):",
      "  ".join(f"{int(a * 1000)}: {np.mean(err[cz & (rel > a) & (rel <= a + 0.01)] < 10) * 100:.0f}%" for a in np.arange(-0.06, 0.06, 0.01)))
