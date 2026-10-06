#!/usr/bin/env python3
"""
Mean / range over the 6 input shifts (0, 1, 37, 64, 128, 300 samples of
silence prepended) of each variant's metrics, and in how many shifts it is
below the baseline run with the same input. Run from $AUDIT_DIR (the folder
run_variant.sh writes to); writes multishift.json there.
Usage: python multishift.py base <variant> [<variant> ...]
"""
import json, sys, os
import numpy as np
SH = [0, 1, 37, 64, 128, 300]
def tag(v, k):  # shift 0 is "<v>", the others "<v>_s<k>" ("base": ctrl<k>)
    if v == "base": return "base" if k == 0 else f"ctrl{k}"
    return v if k == 0 else f"{v}_s{k}"
def metrics(t):
    d = json.load(open(f"exp/det/{t}.json"))["summary"]; e = json.load(open(f"exp/e3/{t}.json"))
    f = json.load(open(f"exp/e2/{t}_full.json")); w = json.load(open(f"exp/e2/{t}_win.json"))
    return {
        "lat_ms": e["delay_ms"],
        "det_err_pct": d["engine_wrong_pct_of_checkable"], "det_harm_frames": d["by_type"]["harmonic"],
        "det_err_attack_pct": d["attack_error_rate_pct"], "det_max_run_ms": d["runs"]["ms_max"], "det_p90_run_ms": d["runs"]["ms_p90"],
        "out_octave_frames": e["all"]["octave_off_frames"], "out_broken_pct": e["all"]["broken_pct"], "out_broken_attack_pct": e["attack"]["broken_pct"],
        "jumps1_per_s": e["jumps_1st_per_s"], "jumps7_per_s": e["jumps_7st_per_s"], "flip_backs_per_s": e["flip_backs_per_s"],
        "note_err_c": e["all"]["note_err_c_med"], "note_err_attack_c": e["attack"]["note_err_c_med"], "within10_pct": e["all"]["within_10c_pct"],
        "disc_per_s_full": f["per_s"], "disc_per_s_win": w["per_s"],
    }
vs = sys.argv[1:]
data = {}
for v in vs:
    rows = []
    for k in SH:
        t = tag(v, k)
        if os.path.exists(f"exp/e2/{t}_win.json"): rows.append((k, metrics(t)))
    data[v] = rows
keys = list(data[vs[0]][0][1].keys())
out = {}
print(f"{'metric':22s}" + "".join(f"{v:>26s}" for v in vs))
for m in keys:
    line = f"{m:22s}"
    for v in vs:
        a = np.array([r[m] for _, r in data[v]], float)
        cell = f"{a.mean():.2f} [{a.min():.2f}-{a.max():.2f}] n{len(a)}"
        if v != "base":
            b = {k: r[m] for k, r in data["base"]}
            diffs = [r[m] - b[k] for k, r in data[v] if k in b]
            lower = sum(1 for x in diffs if x < 0)
            cell += f" {lower}/{len(diffs)}↓"
        line += f"{cell:>26s}"
        out.setdefault(v, {})[m] = {"mean": round(float(a.mean()), 3), "min": float(a.min()), "max": float(a.max()), "n": len(a)}
    print(line)
json.dump({"shifts": SH, "summary": out, "runs": {v: {str(k): r for k, r in rows} for v, rows in data.items()}}, open("exp/multishift.json", "w"), indent=1)
