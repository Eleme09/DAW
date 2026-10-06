#!/usr/bin/env python3
"""
E3/E4: pitch of what the engine OUTPUT, judged against the pitch of what was
SUNG. The sung pitch is the input frames where Praat (autocorrelation) and
WORLD Harvest agree within 0.15 octave; the output pitch is the output frames
where both trackers agree too (range 70-1000 Hz so a wrong upward lock is seen).
Output time = input time + the engine latency (read from the trace).

  octave_off_pct  output > 6 st away from the sung pitch (a harmonic or
                  sub-harmonic lock that reached the audio)
  broken_pct      sung frame is clearly voiced but the output trackers have no
                  agreeing pitch (garbage grains, low confidence)
  jumps_1st/7st   output pitch steps > 1 / > 7 st between 5 ms frames, per s
  flip_backs      a > 1 st step that comes back within 0.3 st in 50 ms, per s
  note_err        output distance to the nearest scale note (cents)
Each one over all sung frames, over attacks (first 50 ms of each sung voiced
run) and mid-note.
Usage: python e3_output_pitch.py voice.wav run.wav run_trace.json out.json [key] [t0 t1]
"""
import json
import sys

import numpy as np
import parselmouth
import pyworld as pw
from scipy.io import wavfile

MAJOR = [0, 2, 4, 5, 7, 9, 11]


def load(path):
    sr, x = wavfile.read(path)
    if x.dtype == np.int16:
        x = x.astype(np.float64) / 32768.0
    elif x.dtype == np.int32:
        x = x.astype(np.float64) / 2147483648.0
    else:
        x = x.astype(np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    return sr, x


def consensus(x, sr, step, ceil):
    snd = parselmouth.Sound(x, sampling_frequency=sr)
    p = snd.to_pitch_ac(time_step=step, pitch_floor=70.0, pitch_ceiling=ceil)
    pt, pf = p.xs(), p.selected_array["frequency"]
    fh, th = pw.harvest(x, sr, f0_floor=70.0, f0_ceil=ceil, frame_period=step * 1000)
    grid = np.arange(0, len(x) / sr, step)
    a = pf[np.clip(np.round((grid - pt[0]) / step).astype(int), 0, len(pf) - 1)]
    b = fh[np.clip(np.round(grid / step).astype(int), 0, len(fh) - 1)]
    with np.errstate(divide="ignore", invalid="ignore"):
        agree = (a > 0) & (b > 0) & (np.abs(np.log2(a / b)) < 0.15)
        f = np.where(agree, np.sqrt(a * b), 0.0)
    voiced_any = (a > 0) | (b > 0)
    return grid, f, voiced_any


def note_err(f, key):
    m = 69 + 12 * np.log2(f / 440.0)
    best = np.full_like(m, np.inf)
    for c in range(-2, 3):
        base = np.round(m) + c
        ok = np.isin(((base - key) % 12).astype(int), MAJOR)
        best = np.minimum(best, np.where(ok, np.abs(m - base), np.inf))
    return best * 100


def main():
    voice, run, trace, out = sys.argv[1:5]
    key = int(sys.argv[5]) if len(sys.argv) > 5 else 9
    win = (float(sys.argv[6]), float(sys.argv[7])) if len(sys.argv) > 7 else None
    tr = json.load(open(trace))
    sr, x = load(voice)
    sr2, y = load(run)
    delay = float(tr["delay"]) / sr
    step = 0.005
    gi, fi, _ = consensus(x, sr, step, 1000.0)
    go, fo, vo = consensus(y, sr2, step, 1000.0)
    idx = np.clip(np.round((gi + delay) / step).astype(int), 0, len(fo) - 1)
    fo_al = fo[idx]
    vo_al = vo[idx]
    sel = np.ones(len(gi), bool) if win is None else (gi >= win[0]) & (gi < win[1])
    sung = (fi > 0) & sel
    # attacks: first 50 ms of each sung voiced run (runs bridged over 1 frame gaps)
    att = np.zeros(len(gi), bool)
    start = None
    gap = 0
    for i in range(len(gi)):
        if fi[i] > 0:
            if start is None:
                start = gi[i]
            gap = 0
            if gi[i] - start < 0.05:
                att[i] = True
        else:
            gap += 1
            if gap > 1:
                start = None
    res = {"delay_ms": round(delay * 1000, 2)}
    for name, m in (("all", sung), ("attack", sung & att), ("mid", sung & ~att)):
        both = m & (fo_al > 0)
        with np.errstate(divide="ignore", invalid="ignore"):
            st = 12 * np.log2(fo_al[both] / fi[both])
        ne = note_err(fo_al[both], key) if both.any() else np.array([np.nan])
        res[name] = {
            "sung_frames": int(m.sum()),
            "octave_off_pct": round(100 * float(np.mean(np.abs(st) > 6)) if both.any() else 0.0, 3),
            "octave_off_frames": int((np.abs(st) > 6).sum()),
            "broken_pct": round(100 * float(np.mean((fo_al[m] <= 0))), 3),
            "unvoiced_out_pct": round(100 * float(np.mean(~vo_al[m])), 3),
            "note_err_c_med": round(float(np.nanmedian(ne)), 2),
            "within_10c_pct": round(100 * float(np.mean(ne <= 10)), 2),
        }
    # contour stability on the output (output frames whose input frame is sung)
    o = np.where(sung, fo_al, 0.0)
    v = o > 0
    mid = 69 + 12 * np.log2(np.where(v, o, 1.0) / 440.0)
    j1 = j7 = flips = 0
    j1_att = j7_att = flips_att = 0
    for i in range(1, len(o)):
        if v[i] and v[i - 1]:
            dj = abs(mid[i] - mid[i - 1])
            if dj > 1.0:
                j1 += 1
                j1_att += att[i]
                fb = False
                for k in range(i + 1, min(len(o), i + 11)):
                    if v[k] and abs(mid[k] - mid[i - 1]) < 0.3:
                        fb = True
                        break
                flips += fb
                flips_att += fb and att[i]
            if dj > 7.0:
                j7 += 1
                j7_att += att[i]
    vs = max(v.sum() * step, 1e-9)
    res["jumps_1st_per_s"] = round(j1 / vs, 3)
    res["jumps_7st_per_s"] = round(j7 / vs, 3)
    res["flip_backs_per_s"] = round(flips / vs, 3)
    res["attack_jumps_1st"] = int(j1_att)
    res["attack_jumps_7st"] = int(j7_att)
    res["attack_flip_backs"] = int(flips_att)
    res["voiced_out_s"] = round(vs, 2)
    print(json.dumps(res))
    # per-frame data for the cause breakdown (not printed)
    res["frames"] = {"t": np.round(gi, 4).tolist(), "sung_hz": np.round(fi, 2).tolist(), "out_hz": np.round(fo_al, 2).tolist(), "attack": att.astype(int).tolist()}
    json.dump(res, open(out, "w"))


if __name__ == "__main__":
    main()
