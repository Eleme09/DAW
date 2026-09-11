# Roadmap

Status legend: ✅ done · 🚧 in progress · ⬜ not started

## Phase 1 — Foundation ✅

- ✅ Repo inspected (was empty — no prior code, greenfield build)
- ✅ Next.js 16 + TypeScript + Tailwind v4 app shell
- ✅ DAW shell layout: transport bar, browser panel, timeline, mixer
- ✅ Real-time audio engine (`src/audio-engine/AudioEngine.ts`): per-track
  gain/pan/mute/solo graph, master bus, metering
- ✅ Timeline: multi-track, draggable clips, waveform rendering, playhead,
  click-to-seek ruler, loop region toggle, BPM/time signature
- ✅ Basic mixer: per-track fader/pan/mute/solo, live peak meters, master
  meter
- ✅ Audio import (file picker, multi-file), decoded via Web Audio,
  cached, waveform preview
- ✅ Metronome (lookahead-scheduled click track)
- ✅ Project structure: `Project`/`Track`/`AudioClip` model
  (`src/types/project.ts`)
- ✅ Persistence: local-first (project JSON in localStorage, audio blobs in
  IndexedDB), save/load/delete, survives reload (verified in-browser)
- ✅ Supabase scaffolding (client + full schema migration), **not applied**
  to any project — deliberately left for the user to decide where this
  lives
- ✅ Vitest unit tests for pure logic (dB conversion, waveform peaks,
  project model defaults) — 14 tests passing
- ✅ Verified end-to-end in a real browser (Playwright): import audio, add
  track, add clip, play/pause with live meters, save + reload + load
  project, sample rehydration after reload

Known gaps carried forward on purpose (see `ARCHITECTURE.md` "Known Phase 1
limitations"): no clip trim/split, no timeline zoom, arm button is a UI
placeholder, scheduler doesn't reschedule live edits mid-playback.

## Phase 2 — Recording ⬜

Microphone input, recording to a clip, waveform during capture, basic
non-destructive editing (trim/split — also closes the Phase 1 gap above),
save/load already covered by Phase 1's persistence layer.

## Phase 3 — Vocal Engine ⬜

Real DSP effects as Web Audio nodes/AudioWorklets, attached at each track's
`input` node (see `AUDIO_ENGINE.md`): EQ, compressor, de-esser, noise
reduction, saturation, limiter, reverb, delay. Plus an analyzer view
(spectrum, LUFS/peak/RMS).

## Phase 4 — Phone Mic Enhancement ⬜

Specialized analysis + chain tuned for phone/earbud recordings specifically.
Depends on Phase 3's DSP nodes existing.

## Phase 5 — Pitch / Autotune ⬜

Pitch/key/scale detection, correction (Natural/Hard Tune/Modern
Trap/Extreme modes), manual note editing, formant control if viable. Likely
needs `AudioWorklet` for real-time monitoring — see open question in
`AI_FEATURES.md`.

## Phase 6 — Beat Analyzer ⬜

BPM/key/scale/structure/instrument detection from an imported beat.

## Phase 7 — Key/Scale Detection ⬜

Surfaced as its own confidence-scored result, reusable by Phase 6 and 8.

## Phase 8 — Vocal + Beat Matching ⬜

Compares vocal pitch center to detected beat key, reports compatibility.

## Phase 9 — AI Vocal Engineer ⬜

"Make Vocal Professional": analysis-driven parameters applied to the Phase
3 chain. See `AI_FEATURES.md` principle 3 — AI proposes, DSP executes.

## Phase 10 — AI Mix Assistant ⬜

Session-wide diagnostics (masking, mud, harshness, gain staging) with
suggested (not auto-applied without confirmation) corrections.

## Phase 11 — Beat Generator ⬜

Generative melody/chords/bass/drums from BPM/key/genre/mood, editable in
the DAW afterward.

## Phase 12 — Beat Reconstruction ⬜

Approximate MIDI/project reconstruction from an uploaded beat, confidence
per detected element.

## Phase 13 — Advanced AI ⬜

Natural-language assistant that executes project mutations, mastering
assistant with per-platform LUFS targets.

---

**Next up:** Phase 2 (recording) is the natural next step — it's the
remaining piece of "mobile workflow" (record -> import -> analyze) that
Phase 1 didn't cover, and everything from Phase 3 onward assumes you can
get a vocal into the DAW without leaving it.
