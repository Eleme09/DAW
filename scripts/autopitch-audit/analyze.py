#!/usr/bin/env python3
"""
A/B audit of the AutoPitch pipeline on a real recording.

Compares every stage against the ORIGINAL file with objective measurements -
nothing here is "it looks fine on a spectrogram". For each stage it reports
level/format facts, spectral descriptors, pitch accuracy/stability (Praat) and
measures aimed at the usual pitch-shifting artifacts, then flags what changed
abnormally and writes level-matched excerpts for a listening test.

Usage (see README.md next to this file):
  python analyze.py --original voice.wav --stage "EXPORT:app_export.wav" \
      --stage "MIN (nuevo):new_min.wav" ... --key 9 --scale major \
      --out report_dir [--reference "BandLab:bandlab.wav:4.2:5.52"] \
      [--window 5.6 23.7]

Needs: numpy, scipy, praat-parselmouth, pyloudnorm.
"""
import argparse
import json
import os

import numpy as np
import parselmouth
import pyloudnorm
from parselmouth.praat import call
from scipy.io import wavfile
from scipy.signal import butter, correlate, hilbert, resample_poly, sosfiltfilt, stft

MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]


# ----------------------------------------------------------------- loading

def load(path):
    sr, x = wavfile.read(path)
    kind = str(x.dtype)
    if x.dtype == np.int16:
        x = x.astype(np.float64) / 32768.0
        bits = 16
    elif x.dtype == np.int32:
        x = x.astype(np.float64) / 2147483648.0
        bits = 32
    elif x.dtype == np.float32 or x.dtype == np.float64:
        x = x.astype(np.float64)
        bits = 32 if kind == "float32" else 64
    else:
        raise ValueError(f"{path}: unsupported sample type {kind}")
    if x.ndim == 1:
        x = x[:, None]
    return {"path": path, "sr": sr, "x": x, "bits": bits, "kind": kind}


def mono(a):
    return a["x"].mean(axis=1)


# ---------------------------------------------------------------- alignment

def env(sig, sr, hop_ms=1.0):
    h = max(1, int(sr * hop_ms / 1000))
    n = len(sig) // h
    return np.sqrt((sig[: n * h].reshape(n, h) ** 2).mean(axis=1) + 1e-12), h


def estimate_delay(ref, sig, sr, max_ms=300):
    """Delay (samples) of `sig` relative to `ref`: envelope cross-correlation
    (1 ms), refined on the waveform when that correlation is meaningful."""
    er, h = env(ref, sr)
    es, _ = env(sig, sr)
    n = min(len(er), len(es))
    er, es = er[:n] - er[:n].mean(), es[:n] - es[:n].mean()
    m = int(max_ms)
    c = [np.dot(er[max(0, -k): n - max(0, k)], es[max(0, k): n - max(0, -k)]) for k in range(-m, m + 1)]
    lag = (int(np.argmax(c)) - m) * h
    # waveform refinement (+-3 ms) on a 20 s stretch
    seg = slice(int(2 * sr), int(min(len(ref), len(sig)) - 2 * sr))
    a = ref[seg]
    best, best_lag = -np.inf, lag
    w = int(0.003 * sr)
    for k in range(lag - w, lag + w + 1):
        lo = seg.start + k
        b = sig[lo: lo + len(a)]
        if len(b) < len(a):
            continue
        v = np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12)
        if v > best:
            best, best_lag = v, k
    return (best_lag if best > 0.5 else lag), float(best)


def aligned(ref_len, sig, delay):
    out = np.zeros(ref_len)
    src = sig[delay:] if delay >= 0 else np.concatenate([np.zeros(-delay), sig])
    k = min(ref_len, len(src))
    out[:k] = src[:k]
    return out


# ------------------------------------------------------------- level/format

def db(v):
    return 20 * np.log10(max(v, 1e-12))


def true_peak(x):
    up = resample_poly(x, 4, 1, axis=0)
    return float(np.abs(up).max())


def level_metrics(a):
    x = a["x"]
    sr = a["sr"]
    peak = float(np.abs(x).max())
    rms = float(np.sqrt((x ** 2).mean()))
    clip = int((np.abs(x) >= 0.999).sum())
    # runs of >= 3 identical samples at the extremes = flat-topped clipping
    flat = 0
    for c in range(x.shape[1]):
        s = x[:, c]
        hi = np.abs(s) >= 0.98 * peak
        same = np.concatenate([[False], np.abs(np.diff(s)) < 1e-9]) & hi
        flat += int(np.sum(same[2:] & same[1:-1]))
    meter = pyloudnorm.Meter(sr)
    try:
        lufs = float(meter.integrated_loudness(x if x.shape[1] > 1 else x[:, 0]))
    except Exception:
        lufs = float("nan")
    corr = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]) if x.shape[1] > 1 else None
    return {
        "sample_rate": sr,
        "bits": a["bits"],
        "channels": int(x.shape[1]),
        "duration_s": round(len(x) / sr, 3),
        "peak_dbfs": round(db(peak), 2),
        "true_peak_dbtp": round(db(true_peak(x)), 2),
        "rms_dbfs": round(db(rms), 2),
        "lufs": round(lufs, 2),
        "crest_db": round(db(peak) - db(rms), 2),
        "clipped_samples": clip,
        "flat_top_samples": flat,
        "dc_offset": float(np.round(x.mean(), 6)),
        "stereo_corr": None if corr is None else round(corr, 4),
    }


# ----------------------------------------------------------------- spectral

BANDS = [(50, 150), (150, 300), (300, 600), (600, 1200), (1200, 2400), (2400, 4800), (4800, 9600), (9600, 16000), (16000, 20000)]


def spectral_metrics(x, sr, active):
    """`active`: boolean per 512-sample frame (from the ORIGINAL), so every
    stage is measured on the same frames."""
    f, _, Z = stft(x, sr, nperseg=2048, noverlap=2048 - 512, boundary=None, padded=False)
    P = np.abs(Z) ** 2
    k = min(P.shape[1], len(active))
    P = P[:, :k][:, active[:k]]
    mag = np.sqrt(P)
    ltas = P.mean(axis=1)
    band_db = [float(10 * np.log10(ltas[(f >= lo) & (f < hi)].sum() + 1e-20)) for lo, hi in BANDS]
    centroid = float(np.mean((f[:, None] * P).sum(0) / (P.sum(0) + 1e-20)))
    flat = float(np.mean(np.exp(np.mean(np.log(P + 1e-20), axis=0)) / (P.mean(axis=0) + 1e-20)))
    nm = mag / (np.linalg.norm(mag, axis=0, keepdims=True) + 1e-12)
    flux = float(np.mean(np.sqrt((np.clip(np.diff(nm, axis=1), 0, None) ** 2).sum(0))))
    zc = np.abs(np.diff(np.signbit(x).astype(np.int8)))
    zcr = float(zc.mean() * sr / 2)
    return {"band_db": band_db, "centroid_hz": round(centroid, 1), "flatness": round(flat, 5), "flux": round(flux, 5), "zcr_hz": round(zcr, 1), "ltas": ltas, "f": f}


def comb_index(ltas_ref, ltas, f):
    """Periodic ripple in the long-term spectrum RATIO stage/original - what
    a comb filter (two copies of the signal a few ms apart) leaves. Amplitude
    (dB) of the strongest cosine in the ratio with a period between 0.25 and
    15 ms of delay; 0 for identical spectra."""
    m = (f >= 200) & (f <= 8000)
    r = 10 * np.log10((ltas[m] + 1e-20) / (ltas_ref[m] + 1e-20))
    r = r - np.polyval(np.polyfit(f[m], r, 3), f[m])
    n = len(r)
    c = np.abs(np.fft.rfft(r * np.hanning(n)))
    df = f[1] - f[0]
    q = np.arange(len(c)) / (n * df)  # seconds
    sel = (q >= 0.00025) & (q <= 0.015)
    return float(4 * c[sel].max() / n)  # Hann-windowed cosine of amplitude A -> |C| = A*n/4


# -------------------------------------------------------------- Praat/pitch

def praat(x, sr):
    snd = parselmouth.Sound(x, sampling_frequency=sr)
    pitch = snd.to_pitch_ac(time_step=0.01, pitch_floor=75.0, pitch_ceiling=600.0)
    arr = pitch.selected_array
    t = pitch.xs()
    f0 = arr["frequency"]
    strength = arr["strength"]
    pp = call([snd, pitch], "To PointProcess (cc)")
    jitter = call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
    shimmer = call([snd, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    harm = snd.to_harmonicity_cc(time_step=0.01, minimum_pitch=75.0)
    hv = harm.values[0]
    hnr = float(np.mean(hv[hv > -100])) if np.any(hv > -100) else float("nan")
    npts = call(pp, "Get number of points")
    pulses = np.array([call(pp, "Get time from index", i + 1) for i in range(npts)])
    form = snd.to_formant_burg(time_step=0.02, max_number_of_formants=5, maximum_formant=5000.0)
    return {"t": t, "f0": f0, "strength": strength, "jitter": jitter, "shimmer": shimmer, "hnr": hnr, "pulses": pulses, "formant": form}


def cents(a, b):
    return 1200 * np.log2(a / b)


def scale_error(f0, key, pcs):
    m = 69 + 12 * np.log2(f0 / 440.0)
    best = np.full_like(m, np.inf)
    for c in range(-2, 3):
        base = np.round(m) + c
        ok = np.isin(((base - key) % 12).astype(int), pcs)
        d = np.where(ok, np.abs(m - base), np.inf)
        best = np.minimum(best, d)
    return best * 100  # cents


def pitch_metrics(p, ref_p, delay_s, key, pcs):
    t, f0, st = p["t"], p["f0"], p["strength"]
    rt, rf0 = ref_p["t"], ref_p["f0"]
    # stage frame for each original frame (stage time = original time + delay)
    idx = np.clip(np.round((rt + delay_s - t[0]) / 0.01).astype(int), 0, len(t) - 1)
    sf0 = f0[idx]
    sst = st[idx]
    ref_v = rf0 > 0
    both = ref_v & (sf0 > 0)
    voiced_s = ref_v.sum() * 0.01
    out = {
        "voiced_frac": round(float((f0 > 0).mean()), 4),
        "low_conf_pct": round(float(100 * np.mean((sst[ref_v] < 0.45) | (sf0[ref_v] <= 0))), 2),
        "f0_vs_original_cents_med": round(float(np.median(np.abs(cents(sf0[both], rf0[both])))), 2) if both.any() else None,
        "f0_vs_original_cents_p95": round(float(np.percentile(np.abs(cents(sf0[both], rf0[both])), 95)), 2) if both.any() else None,
    }
    se = scale_error(f0[f0 > 0], key, pcs)
    out["scale_err_cents_med"] = round(float(np.median(se)), 2)
    out["scale_err_cents_p90"] = round(float(np.percentile(se, 90)), 2)
    out["within_10c_pct"] = round(float(100 * np.mean(se <= 10)), 2)
    # stability: jumps > 100 cents between consecutive 10 ms frames, and
    # flip-backs (jump and back to within 30 cents of where it was in 150 ms)
    v = f0 > 0
    mids = 69 + 12 * np.log2(np.where(v, f0, 1) / 440.0)
    jumps = 0
    flips = 0
    for i in range(1, len(f0)):
        if v[i] and v[i - 1] and abs(mids[i] - mids[i - 1]) > 1.0:
            jumps += 1
            for j in range(i + 1, min(len(f0), i + 15)):
                if v[j] and abs(mids[j] - mids[i - 1]) < 0.3:
                    flips += 1
                    break
    vs = max(v.sum() * 0.01, 1e-9)
    out["pitch_breaks_per_s"] = round(jumps / vs, 3)
    out["flip_backs_per_s"] = round(flips / vs, 3)
    # artificial F0 modulation: 8-30 Hz component of the cents contour inside
    # voiced runs of >= 300 ms (natural vibrato lives at 4-7 Hz)
    sos = butter(2, [8, 30], "bandpass", fs=100, output="sos")
    acc = []
    run = []
    for i in range(len(f0) + 1):
        if i < len(f0) and v[i]:
            run.append(mids[i] * 100)
        else:
            if len(run) >= 30:
                y = sosfiltfilt(sos, np.array(run) - np.mean(run))
                acc.append(y[5:-5])
            run = []
    out["f0_mod_8_30hz_cents_rms"] = round(float(np.sqrt(np.mean(np.concatenate(acc) ** 2))), 2) if acc else None
    out["jitter_local_pct"] = round(100 * p["jitter"], 3)
    out["shimmer_local_pct"] = round(100 * p["shimmer"], 3)
    out["hnr_db"] = round(p["hnr"], 2)
    # glottal-cycle glitches: a period that differs > 25 % from BOTH
    # neighbours (a repeated, dropped or broken cycle)
    pp = p["pulses"]
    per = np.diff(pp)
    ok = (per > 1 / 650) & (per < 1 / 70)
    g = 0
    for i in range(1, len(per) - 1):
        if ok[i - 1] and ok[i] and ok[i + 1]:
            a, b, c = per[i - 1], per[i], per[i + 1]
            if abs(b / a - 1) > 0.25 and abs(b / c - 1) > 0.25:
                g += 1
    out["cycle_glitches_per_s"] = round(g / vs, 3)
    out["_voiced_s"] = voiced_s
    return out


def formant_shift(p, ref_p, delay_s):
    rt, rf0 = ref_p["t"], ref_p["f0"]
    res = {1: [], 2: [], 3: []}
    for i in range(0, len(rt), 2):
        if rf0[i] <= 0:
            continue
        for n in (1, 2, 3):
            a = ref_p["formant"].get_value_at_time(n, rt[i])
            b = p["formant"].get_value_at_time(n, rt[i] + delay_s)
            if a == a and b == b and a > 0 and b > 0:
                res[n].append(100 * (b / a - 1))
    return {f"F{n}_shift_pct_med": round(float(np.median(v)), 2) if v else None for n, v in res.items()} | {
        f"F{n}_abs_shift_pct_med": round(float(np.median(np.abs(v))), 2) if v else None for n, v in res.items()
    }


# ---------------------------------------------------------------- artifacts

def discontinuities(x, sr):
    """Clicks/steps: |second difference| more than 8x its 5 ms local mean."""
    d2 = np.abs(x[2:] - 2 * x[1:-1] + x[:-2])
    k = max(1, int(0.005 * sr))
    loc = np.convolve(d2, np.ones(k) / k, mode="same") + 1e-9
    spikes = np.where((d2 > 8 * loc) & (np.abs(x[1:-1]) > 1e-3))[0]
    if len(spikes):
        keep = np.concatenate([[True], np.diff(spikes) > int(0.002 * sr)])
        spikes = spikes[keep]
    at_block = np.mean(np.isin((spikes + 1) % 128, [0, 1, 127])) if len(spikes) else 0.0
    return {"spikes_per_s": round(len(spikes) / (len(x) / sr), 3), "spikes_at_128_block_edge_pct": round(100 * float(at_block), 1)}


def am_index(x, sr, voiced_mask_10ms):
    """Granular/warbling: modulation of the 1-4 kHz envelope at 15-80 Hz
    relative to 0.5-15 Hz, inside voiced stretches (dB)."""
    sos = butter(4, [1000, 4000], "bandpass", fs=sr, output="sos")
    e = np.abs(hilbert(sosfiltfilt(sos, x)))
    h = int(sr / 500)  # 2 ms
    n = len(e) // h
    e = e[: n * h].reshape(n, h).mean(1)
    vm = np.repeat(voiced_mask_10ms, 5)[:n]
    n = min(n, len(vm))
    hi_e, lo_e = 0.0, 0.0
    run = []
    for i in range(n + 1):
        if i < n and vm[i]:
            run.append(e[i])
        else:
            if len(run) >= 256:
                r = np.log(np.array(run) + 1e-9)
                r -= r.mean()
                S = np.abs(np.fft.rfft(r * np.hanning(len(r)))) ** 2
                fq = np.fft.rfftfreq(len(r), 1 / 500)
                hi_e += S[(fq >= 15) & (fq < 80)].sum()
                lo_e += S[(fq >= 0.5) & (fq < 15)].sum()
            run = []
    return round(float(10 * np.log10((hi_e + 1e-20) / (lo_e + 1e-20))), 2)


def transients(ref, x, sr, delay):
    """Onsets of the original (spectral flux peaks); 10-90 % rise time of the
    broadband envelope around each, original vs stage (ms)."""
    f, t, Z = stft(ref, sr, nperseg=1024, noverlap=1024 - 256, boundary=None, padded=False)
    M = np.log1p(np.abs(Z) * 100)
    fl = np.clip(np.diff(M, axis=1), 0, None).sum(0)
    thr = np.median(fl) + 3 * np.std(fl)
    on = [i for i in range(1, len(fl) - 1) if fl[i] > thr and fl[i] >= fl[i - 1] and fl[i] > fl[i + 1]]
    er, h = env(ref, sr)
    es, _ = env(aligned(len(ref), x, delay), sr)

    def rise(e, c):
        seg = e[max(0, c - 40): c + 40]
        if len(seg) < 10:
            return None
        lo, hi = seg.min(), seg.max()
        if hi <= lo * 1.5:
            return None
        k = int(np.argmax(seg))
        pre = seg[: k + 1]
        a = np.where(pre >= lo + 0.1 * (hi - lo))[0]
        b = np.where(pre >= lo + 0.9 * (hi - lo))[0]
        return float(b[0] - a[0]) if len(a) and len(b) else None

    diffs = []
    for i in on:
        c = int(((i + 1) * 256) / h)
        a, b = rise(er, c), rise(es, c)
        if a is not None and b is not None:
            diffs.append(b - a)
    return {"onsets": len(on), "rise_time_change_ms_med": round(float(np.median(diffs)), 2) if diffs else None}


def harmonic_contrast(x, sr, p, delay_s, ref_p):
    """Peak-to-valley of the harmonics (dB) per band, on voiced frames, with
    the stage's own F0 (Praat): energy created between the harmonics (noise,
    smearing) lowers it."""
    N = 4096
    win = np.hanning(N)
    rt, rf0 = ref_p["t"], ref_p["f0"]
    t, f0 = p["t"], p["f0"]
    bands = [(300, 1500), (1500, 3000), (3000, 5000)]
    res = [[] for _ in bands]
    for i in range(0, len(rt), 3):
        if rf0[i] <= 0:
            continue
        ts = rt[i] + delay_s
        k = int(round((ts - t[0]) / 0.01))
        if k < 0 or k >= len(f0) or f0[k] <= 0:
            continue
        c = int(ts * sr)
        if c - N // 2 < 0 or c + N // 2 > len(x):
            continue
        X = np.abs(np.fft.rfft(x[c - N // 2: c + N // 2] * win))
        L = 20 * np.log10(X + 1e-9)
        bw = sr / N
        F = f0[k]
        for bi, (lo, hi) in enumerate(bands):
            pk, vl = [], []
            hnum = int(np.ceil(lo / F))
            while hnum * F < hi:
                a = int((hnum * F - 0.15 * F) / bw)
                b = int((hnum * F + 0.15 * F) / bw) + 1
                m0 = int(((hnum + 0.5) * F - 0.15 * F) / bw)
                m1 = int(((hnum + 0.5) * F + 0.15 * F) / bw) + 1
                pk.append(L[a:b].max())
                vl.append(L[m0:m1].mean())
                hnum += 1
            if pk:
                res[bi].append(np.mean(pk) - np.mean(vl))
    return [round(float(np.median(r)), 2) if r else None for r in res]


# -------------------------------------------------------------------- main

def analyze_stage(label, a, ref, ref_p, active, ref_spec, key, pcs, win, full_ref=None):
    sr = a["sr"]
    xm = mono(a)
    delay, wcorr = estimate_delay(mono(ref), xm, sr)
    if win:
        s0, s1 = int(win[0] * sr), int(win[1] * sr)
    else:
        s0, s1 = 0, len(mono(ref))
    xa = aligned(len(mono(ref)), xm, delay)[s0:s1]
    r = mono(ref)[s0:s1]
    lv = level_metrics({"x": a["x"][max(0, s0 + delay): max(0, s1 + delay)], "sr": sr, "bits": a["bits"]})
    lv["sample_rate"], lv["duration_s"] = sr, round(len(a["x"]) / sr, 3)
    g = float(np.dot(r, xa) / (np.dot(r, r) + 1e-20))
    null = 10 * np.log10(np.sum((g * r) ** 2) / (np.sum((xa - g * r) ** 2) + 1e-30))
    sp = spectral_metrics(xa, sr, active)
    p = praat(xa, sr)
    pm = pitch_metrics(p, ref_p, 0.0, key, pcs)
    out = {"label": label, "file": os.path.basename(a["path"]), "delay_ms": round(1000 * delay / sr, 2), "waveform_corr": round(wcorr, 4)}
    out |= lv
    out["level_change_db"] = round(float(db(np.sqrt((xa ** 2).mean())) - db(np.sqrt((r ** 2).mean()))), 2)
    out["null_snr_db"] = round(float(null), 2)
    out |= {k: v for k, v in sp.items() if k not in ("ltas", "f")}
    out["band_diff_db"] = [round(b - c, 2) for b, c in zip(sp["band_db"], ref_spec["band_db"])]
    out["comb_index_db"] = round(comb_index(ref_spec["ltas"], sp["ltas"], sp["f"]), 2)
    out |= {k: v for k, v in pm.items() if not k.startswith("_")}
    out |= formant_shift(p, ref_p, 0.0)
    out |= discontinuities(xa, sr)
    vm = ref_p["f0"] > 0
    out["am_index_db"] = am_index(xa, sr, vm)
    out |= transients(r, xa, sr, 0)
    out["harmonic_contrast_db"] = harmonic_contrast(xa, sr, p, 0.0, ref_p)
    return out


FLAGS = [
    # (metric, test(stage, original) -> bool, description)
    ("level_change_db", lambda s, o: abs(s) > 1.0, "nivel cambia > 1 dB"),
    ("true_peak_dbtp", lambda s, o: s > -0.1, "true peak > -0.1 dBTP"),
    ("clipped_samples", lambda s, o: s > o, "muestras recortadas"),
    ("dc_offset", lambda s, o: abs(s - o) > 0.001, "DC offset"),
    ("comb_index_db", lambda s, o: s - o > 0.5, "rizado periódico en el espectro (filtro peine)"),
    ("hnr_db", lambda s, o: o - s > 1.0, "HNR cae > 1 dB (más ruido/aspereza)"),
    ("jitter_local_pct", lambda s, o: s - o > 0.3, "jitter sube > 0.3 pp"),
    ("shimmer_local_pct", lambda s, o: s - o > 1.0, "shimmer sube > 1 pp"),
    ("low_conf_pct", lambda s, o: s - o > 3, "más cuadros de baja confianza"),
    ("pitch_breaks_per_s", lambda s, o: s - o > 0.5, "más saltos de tono > 1 st"),
    ("flip_backs_per_s", lambda s, o: s - o > 0.2, "tono que salta y vuelve (quebrado)"),
    ("f0_mod_8_30hz_cents_rms", lambda s, o: s - o > 3, "modulación artificial de F0 (8-30 Hz)"),
    ("cycle_glitches_per_s", lambda s, o: s - o > 0.5, "ciclos glotales rotos/repetidos"),
    ("am_index_db", lambda s, o: s - o > 1.0, "modulación de amplitud granular (warble)"),
    ("spikes_per_s", lambda s, o: s - o > 1.0, "discontinuidades (clics) entre ventanas/buffers"),
    ("rise_time_change_ms_med", lambda s, o: abs(s) > 2.0, "transitorios suavizados/emborronados"),
]


def flag_stage(s, o):
    out = []
    for key, test, desc in FLAGS:
        a, b = s.get(key), o.get(key)
        if a is None or b is None:
            continue
        try:
            if test(a, b):
                out.append(f"{desc} ({key}: {b} → {a})")
        except TypeError:
            pass
    for i, (lo, hi) in enumerate(BANDS[:-1]):
        d = s["band_diff_db"][i]
        if abs(d) > 1.5:
            out.append(f"energía {lo}-{hi} Hz {d:+.1f} dB")
    hc_o, hc_s = o["harmonic_contrast_db"], s["harmonic_contrast_db"]
    for name, a, b in zip(("0.3-1.5k", "1.5-3k", "3-5k"), hc_s, hc_o):
        if a is not None and b is not None and b - a > 1.5:
            out.append(f"pérdida de armónicos {name} ({b} → {a} dB)")
    for n in (1, 2, 3):
        v = s.get(f"F{n}_abs_shift_pct_med")
        if v is not None and v > 3:
            out.append(f"formante F{n} desplazado {v}% (mediana)")
    return out


def write_excerpt(path, x, sr, gain):
    y = np.clip(x * gain, -1, 1)
    wavfile.write(path, sr, (y * 32767).astype(np.int16))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--original", required=True)
    ap.add_argument("--stage", action="append", default=[], help="LABEL:path.wav")
    ap.add_argument("--reference", default=None, help="LABEL:path.wav:start_in_ref_s:start_in_original_s (e.g. BandLab screen recording)")
    ap.add_argument("--key", type=int, default=9)
    ap.add_argument("--scale", default="major")
    ap.add_argument("--window", nargs=2, type=float, default=None)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    pcs = MAJOR if args.scale == "major" else MINOR
    ref = load(args.original)
    sr = ref["sr"]
    win = args.window
    r = mono(ref)
    s0, s1 = (int(win[0] * sr), int(win[1] * sr)) if win else (0, len(r))
    rw = r[s0:s1]
    # frames that count: original louder than -40 dBFS (512-sample hop)
    nfr = (len(rw) - 2048) // 512 + 1
    active = np.array([np.sqrt(np.mean(rw[i * 512: i * 512 + 2048] ** 2)) > 0.01 for i in range(nfr)])
    ref_spec = spectral_metrics(rw, sr, active)
    ref_p = praat(rw, sr)
    orig = analyze_stage("ORIGINAL", ref, ref, ref_p, active, ref_spec, args.key, pcs, win)
    rows = [orig]
    excerpts = [("00_ORIGINAL", rw, 1.0)]
    ref_lufs = orig["lufs"]
    for i, spec in enumerate(args.stage):
        label, path = spec.split(":", 1)
        a = load(path)
        if a["sr"] != sr:
            raise SystemExit(f"{path}: {a['sr']} Hz vs original {sr} Hz")
        row = analyze_stage(label, a, ref, ref_p, active, ref_spec, args.key, pcs, win)
        row["flags"] = flag_stage(row, orig)
        rows.append(row)
        delay = int(round(row["delay_ms"] * sr / 1000))
        xa = aligned(len(r), mono(a), delay)[s0:s1]
        excerpts.append((f"{i + 1:02d}_{label}", xa, 10 ** ((ref_lufs - row["lufs"]) / 20) if row["lufs"] == row["lufs"] else 1.0))
    if args.reference:
        label, path, rs, os_ = args.reference.split(":")
        a = load(path)
        rx = mono(a)
        if a["sr"] != sr:
            rx = resample_poly(rx, sr, a["sr"])
        # place the reference on the original's timeline
        shift = int((float(os_) - float(rs)) * sr)
        placed = np.zeros(len(r))
        src0 = max(0, -shift)
        dst0 = max(0, shift)
        k = min(len(rx) - src0, len(r) - dst0)
        placed[dst0: dst0 + k] = rx[src0: src0 + k]
        fake = {"path": path, "sr": sr, "x": placed[:, None], "bits": a["bits"], "kind": a["kind"]}
        row = analyze_stage(label, fake, ref, ref_p, active, ref_spec, args.key, pcs, win)
        row["flags"] = flag_stage(row, orig)
        row["note"] = "grabación de pantalla (AAC): incluye la pérdida del códec"
        rows.append(row)
        delay = int(round(row["delay_ms"] * sr / 1000))
        excerpts.append((f"{len(rows) - 1:02d}_{label}", aligned(len(r), placed, delay)[s0:s1], 10 ** ((ref_lufs - row["lufs"]) / 20)))
    for name, x, gain in excerpts:
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in name)
        write_excerpt(os.path.join(args.out, f"{safe}.wav"), x, sr, gain)
    with open(os.path.join(args.out, "metrics.json"), "w") as fh:
        json.dump(rows, fh, indent=1, ensure_ascii=False, default=float)
    print(json.dumps([{k: v for k, v in row.items()} for row in rows], ensure_ascii=False, default=float)[:200])


if __name__ == "__main__":
    main()
