#!/bin/bash
# Render one variant with the trace and run the per-run analyses.
# Usage (from the repo root's parent or anywhere):
#   AUDIT_DIR=/path/work PY=/path/venv/bin/python \
#   scripts/autopitch-audit/experiments/run_variant.sh <tag> <worklet.js> <voice.wav> ['{"amount":0}']
# Writes $AUDIT_DIR/runs/<tag>.wav|_trace.json|_mix.f32 and
# $AUDIT_DIR/{det,e3,e2}/<tag>*.json (what multishift.py reads).
set -e
: "${AUDIT_DIR:?set AUDIT_DIR}"
PY=${PY:-python3}
tag=$1; worklet=$2; voice=$3; params=${4:-'{}'}
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../.." && pwd)
mkdir -p "$AUDIT_DIR"/{runs,det,e3,e2}
(cd "$repo" && AUTOPITCH_WORKLET="$worklet" AUTOPITCH_TRACE_PARAMS="$params" AUTOPITCH_TRACE_INPUT="$voice" \
  AUTOPITCH_TRACE_OUT="$AUDIT_DIR/runs" AUTOPITCH_TRACE_TAG="$tag" npx vitest run src/audio-engine/autopitch/pipelineTrace.test.ts >/dev/null)
r="$AUDIT_DIR/runs/$tag"
$PY "$here/detector_vs_references.py" "$voice" "${r}_trace.json" "$AUDIT_DIR/det/$tag.json" >/dev/null
$PY "$here/e3_output_pitch.py" "$voice" "$r.wav" "${r}_trace.json" "$AUDIT_DIR/e3/$tag.json" 9 >/dev/null
$PY "$here/e2_discontinuities.py" "$voice" "$r.wav" "${r}_trace.json" "${r}_mix.f32" "$AUDIT_DIR/det/$tag.json" "$AUDIT_DIR/e2/${tag}_full.json" >/dev/null
$PY "$here/e2_discontinuities.py" "$voice" "$r.wav" "${r}_trace.json" "${r}_mix.f32" "$AUDIT_DIR/det/$tag.json" "$AUDIT_DIR/e2/${tag}_win.json" 5.6 23.7 >/dev/null
rm -f "${r}_instrumented.js"
echo "$tag done"
