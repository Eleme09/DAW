#!/usr/bin/env python3
"""
E5 - validate the engine's pitch marks (epochs) against reference glottal
closure instants on the real voice.

References:
  ZFF  - zero-frequency filtering (Murty & Yegnanarayana 2008): GCIs are the
         positive-going zero crossings of the trend-removed zero-frequency
         resonator output (both polarities computed, the consistent one used).
  PRAAT - To PointProcess (periodic, cc): one mark per cycle at a consistent
         waveform feature (not a GCI, but the marks Praat's PSOLA uses).
For PSOLA a CONSTANT offset between marks and GCIs is harmless; what hurts is
an offset that changes from cycle to cycle and wrong periods (missed or extra
marks). Both are reported, overall and per F0 band, attacks, glissandos and an
approximate vowel class (F1).
Optionally restricted with the per-frame flags of detector_vs_references.py
(4th argument): stats are then split by "detector right" / "detector wrong".
Usage: python e5_epochs_vs_gci.py voice.wav trace.json out.json [detector.json]
"""
import json
import sys

import numpy as np
import parselmouth
from parselmouth.praat import call
from scipy.io import wavfile

voice, trace_path, out_path = sys.argv[1:4]
detf = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None
sr, x = wavfile.read(voice)
x = (x.astype(np.float64) / 32768.0) if x.dtype == np.int16 else x.astype(np.float64)
if x.ndim > 1:
    x = x.mean(axis=1)
tr = json.load(open(trace_path))
ep = np.array(tr["epochs"], dtype=np.float64).reshape(-1, 2)
epos = ep[:, 0]
evoiced = ep[:, 1] > 0
if detf is not None:
    ft = np.array(detf["frame_t"])
    wrongf = np.array(detf["wrong"]) > 0
    checkf = np.array(detf["checkable"]) > 0
    idx = np.clip(np.searchsorted(ft, epos / 44100.0), 0, len(ft) - 1)
    ep_wrong = wrongf[idx]
    ep_check = checkf[idx]
else:
    ep_wrong = np.zeros(len(epos), bool)
    ep_check = np.ones(len(epos), bool)

snd = parselmouth.Sound(x, sampling_frequency=sr)
pitch = snd.to_pitch_ac(time_step=0.005, pitch_floor=75.0, pitch_ceiling=600.0)
pt = pitch.xs()
pf = pitch.selected_array["frequency"]


def f0_at(samples):
    idx = np.clip(np.round((samples / sr - pt[0]) / 0.005).astype(int), 0, len(pf) - 1)
    return pf[idx]


# ---- ZFF
def zff(sig, avg_period):
    d = np.diff(sig, prepend=sig[0])
    y = d.copy()
    for _ in range(4):  # two cascaded zero-frequency resonators = 4 integrations
        y = np.cumsum(y)
    w = int(round(1.5 * avg_period)) | 1
    k = np.ones(w) / w
    for _ in range(3):
        y = y - np.convolve(y, k, mode="same")
    return y


med_f0 = np.median(pf[pf > 0])
z = zff(x, sr / med_f0)
cands = {}
for pol in (1, -1):
    s = pol * z
    zc = np.where((s[:-1] < 0) & (s[1:] >= 0))[0]
    frac = -s[zc] / (s[zc + 1] - s[zc])
    cands[pol] = zc + frac
# keep GCIs in Praat-voiced regions
for pol in cands:
    g = cands[pol]
    cands[pol] = g[f0_at(g) > 0]

pp = call([snd, pitch], "To PointProcess (cc)")
n = call(pp, "Get number of points")
praat = np.array([call(pp, "Get time from index", i + 1) for i in range(n)]) * sr

form = snd.to_formant_burg(time_step=0.01, max_number_of_formants=5, maximum_formant=5000.0)


def compare(ref, name):
    ref = np.sort(ref)
    rows = []
    for i, e in enumerate(epos):
        if not evoiced[i]:
            continue
        f = f0_at(np.array([e]))[0]
        if f <= 0:
            continue
        j = np.searchsorted(ref, e)
        if j <= 0 or j >= len(ref):
            continue
        r = ref[j] if abs(ref[j] - e) < abs(ref[j - 1] - e) else ref[j - 1]
        P = sr / f
        if abs(r - e) > P:  # no reference mark within a period: unmatched
            rows.append((e, np.nan, P, f))
            continue
        rows.append((e, e - r, P, f))
    a = np.array(rows)
    off = a[:, 1]
    P = a[:, 2]
    f = a[:, 3]
    ok = ~np.isnan(off)
    # cycle-to-cycle change of the offset (consecutive epochs, both matched)
    doff = np.abs(np.diff(off))
    consec = ok[1:] & ok[:-1] & (np.diff(a[:, 0]) < 1.6 * P[1:])
    doff = doff[consec]
    # wrong periods: our spacing vs the local period
    sp = np.diff(epos[evoiced])
    Ploc = sr / np.maximum(f0_at(epos[evoiced][1:]), 1)
    valid = f0_at(epos[evoiced][1:]) > 0
    ratio = sp[valid] / Ploc[valid]
    # attacks: first 50 ms of a voiced run of epochs
    starts = []
    prev_v = False
    for i, e in enumerate(epos):
        if evoiced[i] and not prev_v:
            starts.append(e)
        prev_v = evoiced[i]
    starts = np.array(starts)
    attack = np.array([np.any((e - starts >= 0) & (e - starts < 0.05 * sr)) for e in a[:, 0]])
    # glissando: |dF0/dt| > 8 semitones/s at the epoch
    m = 12 * np.log2(np.maximum(pf, 1) / 440)
    dm = np.gradient(m, 0.005)
    gl_frames = (pf > 0) & (np.abs(dm) > 8)
    gl = gl_frames[np.clip(np.round((a[:, 0] / sr - pt[0]) / 0.005).astype(int), 0, len(pf) - 1)]
    # vowel class (approximate) from F1
    f1 = np.array([form.get_value_at_time(1, e / sr) for e in a[:, 0]])
    vclass = np.where(f1 < 450, "F1<450 (i/u)", np.where(f1 < 650, "F1 450-650 (e/o)", "F1>650 (a)"))

    def stats(mask):
        o = off[mask & ok]
        PP = P[mask & ok]
        if len(o) < 5:
            return None
        return {
            "n": int(len(o)),
            "unmatched_pct": round(100 * float(np.mean(~ok[mask])), 2),
            "abs_off_samples_med": round(float(np.median(np.abs(o))), 2),
            "abs_off_samples_p95": round(float(np.percentile(np.abs(o), 95)), 2),
            "abs_off_ms_med": round(float(1000 * np.median(np.abs(o)) / sr), 3),
            "abs_off_ms_p95": round(float(1000 * np.percentile(np.abs(o), 95) / sr), 3),
            "abs_off_period_pct_med": round(float(100 * np.median(np.abs(o) / PP)), 2),
            "abs_off_period_pct_p95": round(float(100 * np.percentile(np.abs(o) / PP, 95)), 2),
            "signed_off_period_pct_med": round(float(100 * np.median(o / PP)), 2),
        }

    res = {"reference": name, "all": stats(np.ones(len(a), bool))}
    ai = np.array([np.searchsorted(epos, e) for e in a[:, 0]])
    res["detector_right"] = stats(ep_check[ai] & ~ep_wrong[ai])
    res["detector_wrong"] = stats(ep_wrong[ai])
    ci = ai[1:][consec]
    good_c = ep_check[ci] & ~ep_wrong[ci]
    res["cycle_to_cycle_offset_change_detector_right"] = {
        "med": round(float(np.median(doff[good_c])), 2),
        "p95": round(float(np.percentile(doff[good_c], 95)), 2),
        "pct_over_2_samples": round(float(100 * np.mean(doff[good_c] > 2)), 2),
        "pct_over_10pct_period": round(float(100 * np.mean(doff[good_c] > 0.1 * P[1:][consec][good_c])), 2),
    }
    res["cycle_to_cycle_offset_change_samples"] = {
        "med": round(float(np.median(doff)), 2),
        "p95": round(float(np.percentile(doff, 95)), 2),
        "pct_over_2_samples": round(float(100 * np.mean(doff > 2)), 2),
        "pct_over_10pct_period": round(float(100 * np.mean(doff > 0.1 * P[1:][consec])), 2),
    }
    vv = np.where(evoiced)[0][1:]
    right_sp = (ep_check[vv] & ~ep_wrong[vv])[valid]
    wrong_sp = ep_wrong[vv][valid]
    res["period_errors_detector_right"] = {
        "spacings": int(right_sp.sum()),
        "pct_within_5pct": round(float(100 * np.mean(np.abs(ratio[right_sp] - 1) < 0.05)), 2),
        "pct_missed": round(float(100 * np.mean(ratio[right_sp] > 1.6)), 2),
        "pct_extra": round(float(100 * np.mean(ratio[right_sp] < 0.6)), 2),
    }
    res["period_errors_detector_wrong"] = {
        "spacings": int(wrong_sp.sum()),
        "pct_within_5pct": round(float(100 * np.mean(np.abs(ratio[wrong_sp] - 1) < 0.05)), 2) if wrong_sp.any() else None,
        "pct_extra": round(float(100 * np.mean(ratio[wrong_sp] < 0.6)), 2) if wrong_sp.any() else None,
    }
    res["period_errors"] = {
        "spacings": int(len(ratio)),
        "pct_within_5pct": round(float(100 * np.mean(np.abs(ratio - 1) < 0.05)), 2),
        "pct_double_or_more (missed mark)": round(float(100 * np.mean(ratio > 1.6)), 2),
        "pct_half_or_less (extra mark)": round(float(100 * np.mean(ratio < 0.6)), 2),
    }
    bands = {"F0<150": f < 150, "150-200": (f >= 150) & (f < 200), "200-250": (f >= 200) & (f < 250), ">=250": f >= 250}
    res["by_f0"] = {k: stats(v) for k, v in bands.items()}
    res["attacks_first_50ms"] = stats(attack)
    res["not_attacks"] = stats(~attack)
    res["glissando"] = stats(gl)
    res["steady"] = stats(~gl)
    res["by_vowel_F1"] = {k: stats(vclass == k) for k in np.unique(vclass)}
    # where on the cycle: signed offset as a fraction of the period, histogram
    h, edges = np.histogram((off[ok] / P[ok]), bins=np.linspace(-0.5, 0.5, 11))
    res["signed_offset_fraction_hist"] = {f"{edges[i]:+.1f}..{edges[i+1]:+.1f}": int(h[i]) for i in range(len(h))}
    return res


out = {"zff_pos": compare(cands[1], "ZFF (+)"), "zff_neg": compare(cands[-1], "ZFF (-)"), "praat_cc": compare(praat, "Praat periodic cc")}
# which ZFF polarity is the consistent one: smaller cycle-to-cycle offset change
pick = "zff_pos" if out["zff_pos"]["cycle_to_cycle_offset_change_samples"]["med"] <= out["zff_neg"]["cycle_to_cycle_offset_change_samples"]["med"] else "zff_neg"
out["zff_polarity_used"] = pick
# reference vs reference: how consistent are ZFF and Praat with each other
out["praat_vs_zff"] = None
json.dump(out, open(out_path, "w"), indent=1)
for k in (pick, "praat_cc"):
    r = out[k]
    print(k, json.dumps({"all": r["all"], "c2c": r["cycle_to_cycle_offset_change_samples"], "period": r["period_errors"]}))
