#!/usr/bin/env python3
"""
E2 - where do the output discontinuities come from?

Same detector as analyze.py (|second difference| > 8x its 5 ms local mean,
|x| > 1e-3, events merged within 2 ms), run on the engine OUTPUT. Each event
is located against the engine trace and given the FIRST matching category:
  inherited  - the input has the same kind of event at the input sample this
               output sample was read from (grain mapping, or t - D when dry)
  detector   - inside a frame where the engine pitch is wrong (Praat+Harvest)
  note       - within 5 ms of a target-note change
  dry->tuned / tuned->dry - during a crossfade (tuned share 0.02..0.98)
  voicing    - within 5 ms of a voiced/unvoiced flip
  attack     - first 50 ms of a voiced stretch
  epoch      - within 1 ms of a grain that repeats or skips an input epoch
  grain_edge - within 0.25 ms of a grain window edge
  other
Multi-label counts (an event can sit in several) are reported as well.
Usage: python e2_discontinuities.py voice.wav run.wav run_trace.json run_mix.f32 detector.json out.json
"""
import json
import sys

import numpy as np
from scipy.io import wavfile

voice, run_wav, trace_path, mix_path, det_path, out_path = sys.argv[1:7]
win = (float(sys.argv[7]), float(sys.argv[8])) if len(sys.argv) > 8 else None
sr, x = wavfile.read(voice)
x = (x.astype(np.float64) / 32768.0) if x.dtype == np.int16 else x.astype(np.float64)
if x.ndim > 1:
    x = x.mean(axis=1)
_, y = wavfile.read(run_wav)
y = y[:, 0].astype(np.float64) if y.ndim > 1 else y.astype(np.float64)
tr = json.load(open(trace_path))
D = int(tr["delay"])
mix = np.fromfile(mix_path, dtype=np.float32).reshape(-1, 2)
g = mix[:, 0]
det = json.load(open(det_path))


def spikes(s):
    d2 = np.abs(s[2:] - 2 * s[1:-1] + s[:-2])
    k = max(1, int(0.005 * sr))
    loc = np.convolve(d2, np.ones(k) / k, mode="same") + 1e-9
    idx = np.where((d2 > 8 * loc) & (np.abs(s[1:-1]) > 1e-3))[0]
    if len(idx):
        idx = idx[np.concatenate([[True], np.diff(idx) > int(0.002 * sr)])]
    return idx + 1, (d2 / loc), d2


ys, yratio, yd2 = spikes(y)
xs, _, _ = spikes(x)
xs_sorted = np.sort(xs)
if win:
    ys = ys[(ys >= (win[0] * sr + D)) & (ys < (win[1] * sr + D))]

an = np.array(tr["analyses"], dtype=np.float64).reshape(-1, len(tr["analysisFields"]))
c = {k: i for i, k in enumerate(tr["analysisFields"])}
fc = an[:, c["frameCentre"]]
voiced = an[:, c["voiced"]] > 0
tgt = an[:, c["targetNote"]]
gr = np.array(tr["grains"], dtype=np.float64).reshape(-1, len(tr["grainFields"]))
gc = {k: i for i, k in enumerate(tr["grainFields"])}
lead = gr[gr[:, gc["stream"]] == 0]
mark = lead[:, gc["mark"]]
epoch = lead[:, gc["epoch"]]
per = lead[:, gc["per"]]
hop = lead[:, gc["hop"]]
hmax = np.floor(D / 2) - 2
hout = np.minimum(np.maximum(per, 0.7 * hop), hmax)
order = np.argsort(mark)
mark, epoch, per, hop, hout = mark[order], epoch[order], per[order], hop[order], hout[order]
# repeated / skipped epochs between consecutive grains
dep = np.diff(epoch)
rep = np.concatenate([[False], np.abs(dep) < 1])
skp = np.concatenate([[False], dep > 1.5 * per[1:]])
epoch_evt = mark[rep | skp]
edges = np.sort(np.concatenate([mark - hout, mark + hout]))
# note changes / voicing flips: input frame time -> output time (+D)
chg = fc[1:][(tgt[1:] != tgt[:-1]) & voiced[1:] & voiced[:-1] & (tgt[1:] >= 0) & (tgt[:-1] >= 0)] + D
flips = fc[1:][voiced[1:] != voiced[:-1]] + D
starts = fc[1:][voiced[1:] & ~voiced[:-1]] + D
ft = np.array(det["frame_t"]) * sr + D
wrong = np.array(det["wrong"]) > 0


def near(arr, v, w):
    if len(arr) == 0:
        return False
    i = np.searchsorted(arr, v)
    best = min(abs(arr[j] - v) for j in (i - 1, i) if 0 <= j < len(arr))
    return best <= w


def in_wrong(v):
    i = np.clip(np.searchsorted(ft, v), 0, len(ft) - 1)
    return bool(wrong[i]) or bool(wrong[max(0, i - 1)])


def dominant_input_pos(j):
    if g[j] < 0.5 if j < len(g) else True:
        return j - D
    i = np.searchsorted(mark, j)
    cand = [k for k in (i - 1, i) if 0 <= k < len(mark)]
    k = min(cand, key=lambda q: abs(mark[q] - j))
    return epoch[k] + (j - mark[k])


cats = ["inherited", "detector", "note", "dry->tuned", "tuned->dry", "voicing", "attack", "epoch", "grain_edge", "other"]
first = {k: [] for k in cats}
multi = {k: 0 for k in cats}
for j in ys:
    labels = []
    p = dominant_input_pos(j)
    if near(xs_sorted, p, 2):
        labels.append("inherited")
    if in_wrong(j):
        labels.append("detector")
    if near(chg, j, 0.005 * sr):
        labels.append("note")
    if j < len(g):
        seg = g[max(0, j - int(0.002 * sr)): j + int(0.002 * sr)]
        if np.any((seg > 0.02) & (seg < 0.98)):
            labels.append("dry->tuned" if seg[-1] >= seg[0] else "tuned->dry")
    if near(flips, j, 0.005 * sr):
        labels.append("voicing")
    i = np.searchsorted(starts, j)
    if i > 0 and j - starts[i - 1] < 0.05 * sr:
        labels.append("attack")
    if near(epoch_evt, j, 0.001 * sr):
        labels.append("epoch")
    if near(edges, j, 0.00025 * sr):
        labels.append("grain_edge")
    if not labels:
        labels = ["other"]
    for l in labels:
        multi[l] += 1
    first[labels[0]].append(j)

dur = (win[1] - win[0]) if win else len(y) / sr
total = len(ys)
res = {"window_s": win, "duration_s": round(dur, 2), "output_events": total, "per_s": round(total / dur, 3), "input_events_per_s": round(len(xs) / (len(x) / sr), 3), "categories_first_match": {}, "categories_multilabel": {}}
for k in cats:
    ev = np.array(first[k], dtype=int)
    amp = yratio[ev - 1] if len(ev) else np.array([])
    absd = yd2[ev - 1] if len(ev) else np.array([])
    res["categories_first_match"][k] = {
        "count": int(len(ev)),
        "pct": round(100 * len(ev) / max(total, 1), 1),
        "per_s": round(len(ev) / dur, 3),
        "strength_x_local_med": round(float(np.median(amp)), 1) if len(amp) else None,
        "abs_d2_med": round(float(np.median(absd)), 5) if len(absd) else None,
    }
    res["categories_multilabel"][k] = {"count": multi[k], "per_s": round(multi[k] / dur, 3)}
# distribution over time (10 s bins)
bins = np.arange(0, len(y) / sr + 10, 10)
h, _ = np.histogram((ys - D) / sr, bins=bins)
res["per_10s_bin"] = {f"{int(bins[i])}-{int(bins[i+1])}s": int(h[i]) for i in range(len(h)) if h[i]}
# chance level for the proximity categories: random output samples in fully
# tuned stretches (share > 0.98) that sit within the same windows
rng = np.random.default_rng(1)
lo = int(win[0] * sr + D) if win else D
hi = int(win[1] * sr + D) if win else len(y) - 1
cand = rng.integers(lo, min(hi, len(g) - 1), 200000)
cand = cand[g[cand] > 0.98][:20000]
res["chance_in_tuned_stretches_pct"] = {
    "grain_edge_0.25ms": round(100 * float(np.mean([near(edges, v, 0.00025 * sr) for v in cand])), 1),
    "epoch_1ms": round(100 * float(np.mean([near(epoch_evt, v, 0.001 * sr) for v in cand])), 1),
    "note_5ms": round(100 * float(np.mean([near(chg, v, 0.005 * sr) for v in cand])), 1),
}
tuned_events = [j for j in ys if j < len(g) and g[j] > 0.98]
res["events_in_tuned_stretches"] = {
    "count": len(tuned_events),
    "near_grain_edge_pct": round(100 * float(np.mean([near(edges, v, 0.00025 * sr) for v in tuned_events])), 1) if tuned_events else None,
    "inherited_pct": round(100 * float(np.mean([near(xs_sorted, dominant_input_pos(v), 2) for v in tuned_events])), 1) if tuned_events else None,
}
json.dump(res, open(out_path, "w"), indent=1)
print(json.dumps(res, indent=1, ensure_ascii=False))
