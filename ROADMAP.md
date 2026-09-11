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
limitations"): no timeline zoom, scheduler doesn't reschedule live edits
mid-playback. (Clip trim/split and the arm button are no longer gaps —
closed in Phase 2.)

## Phase 2 — Recording ✅

- ✅ Microphone capture via `AudioWorkletNode` (raw PCM, no lossy codec) —
  `public/worklets/recorder-processor.js` + `wavEncoder.ts`
- ✅ REC transport control; recording plays back existing tracks in sync so
  you can record a vocal over a beat
- ✅ Live input level meter on the armed track (visual monitoring only —
  mic is never routed to output, to avoid feedback on phone/earbud setups)
- ✅ Exclusive track arming, locked while a take is in progress
- ✅ Recorded takes go through the same sample pipeline as imports
  (IndexedDB blob + localStorage metadata + engine buffer cache) — save/load
  works identically for recorded and imported clips
- ✅ Clip trim: drag either edge to adjust in/out points against the
  underlying buffer (closes the Phase 1 "no trim" gap)
- ✅ Split clip at playhead (toolbar button + "S" shortcut)
- ✅ Verified in-browser with Playwright's fake mic device: arm -> record
  -> stop -> clip appears with correct duration -> split produces two
  contiguous clips
- ✅ Unit tests for the WAV encoder and the split/arm store logic (21 tests
  total)

Mic permission/device errors surface inline in the transport bar
(`recordingError`) instead of failing silently.

## Phase 3 — Vocal Engine ✅

- ✅ Declarative effect-chain model (`Track.inserts` / `Project.masterInserts`,
  `src/types/effects.ts`) rendered by `EffectChain` — param tweaks never
  reconnect the graph, structural changes (add/remove/reorder/bypass) do
- ✅ Nine effect types: EQ (multi-band, rebuildable), Compressor, De-Esser
  (split-band technique, native nodes only), Saturation (warm/neutral/bright
  waveshaping curves), Limiter (compressor + hard-clip safety stage),
  Clipper (standalone), Reverb (algorithmically generated IR — room/hall/
  plate, no external files), Delay (feedback + damping filter), Noise Gate
  (real envelope-follower `AudioWorklet` — a gate, explicitly not spectral
  noise reduction)
- ✅ Effects Rack UI: per-track and master-bus insert chains, add/remove/
  reorder/bypass, full param editors for every effect type
- ✅ Analyzer: real-time spectrum (log-scale bars), peak/RMS readout, an
  approximate K-weighted loudness meter explicitly labeled "LUFS (approx.)"
  — not certified BS.1770 (see `AUDIO_ENGINE.md`)
- ✅ Verified in-browser: added all 9 effect types across a track and the
  master bus, toggled bypass, reordered, played back — meters and spectrum
  stayed live throughout, zero console errors
- ✅ 41 unit tests total (added: saturation/clip curve shape, impulse
  response decay envelope, loudness math)

Deferred on purpose (not gaps, scope decisions — see `AUDIO_ENGINE.md`
"What's deliberately not here yet"): multiband compressor, expander,
exciter, chorus/flanger/phaser, auto-pan, stereo width, true spectral/ML
noise reduction (→ Phase 4), certified LUFS.

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

**Next up:** Phase 4 (Phone Mic Enhancement) — the DSP building blocks
from Phase 3 (EQ, compressor, de-esser, saturation, gate) are what a
phone/earbud-tuned auto-chain would configure and apply; this is also
where true noise reduction belongs (deferred out of Phase 3 on purpose).
Phase 5 (pitch/autotune) is the other unblocked option if that's a higher
priority to use first.
