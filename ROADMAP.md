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

## Phase 4 — Phone Mic Enhancement ✅

- ✅ Offline vocal analysis (`src/audio-engine/analysis/`): from-scratch
  FFT, spectral band energies (relative to the recording's own average —
  not absolute thresholds), noise floor/dynamic range/clipping via
  windowed RMS, all combined into a categorical read (Noise/Low-end/Mud/
  Harshness/Sibilance: Low/Medium/High, Dynamics: Controlled/Uncontrolled)
- ✅ "Analyze" action per sample in the Audio browser tab, showing the
  VOCAL ANALYSIS block
- ✅ Rule-based "Phone Mic Enhance" auto-chain (`autoChain.ts`): measured
  analysis -> concrete Phase 3 effect chain (gate -> EQ -> de-esser ->
  compressor -> limiter, each stage only when its problem is actually
  flagged), applied via "Enhance This Recording"
- ✅ Honesty check built into the pipeline, not just documented: clipping
  is reported as an unfixable limitation, never routed through the
  auto-chain as if correctable
- ✅ Verified in-browser: a synthesized noisy/muddy recording correctly
  read Noise: High and Mud: High, Enhance applied a matching Noise Gate +
  EQ chain, playback stayed glitch-free with the new chain live
- ✅ 68 unit tests total (added: FFT correctness against known sine bins,
  spectral band detection, dynamics/noise-floor math, auto-chain rule
  mapping and stage ordering)

True spectral/ML noise reduction is still not built — the gate silences
gaps, it doesn't remove noise under the signal. Deferred, not hidden: see
AUDIO_ENGINE.md "What's deliberately not here yet." Pitch analysis was
deliberately kept out of this phase's result — that's Phase 5's job.

## Phase 5 — Pitch / Autotune ✅

- ✅ Pitch detection: a real YIN implementation
  (`src/audio-engine/pitch/pitchDetection.ts`), not autocorrelation-only —
  chosen specifically to avoid octave errors before they feed correction
- ✅ Key/scale detection: Krumhansl-Kessler key-finding from a
  confidence-weighted chroma histogram of the pitch track
  (`keyDetection.ts`), correctly identifies transposed keys, not just C
- ✅ Pitch-over-time visualization in the Pitch Studio panel (Audio browser
  tab → "Pitch" button) — the "poder visualizar las notas detectadas"
  requirement
- ✅ Pitch correction with Key/Scale/Retune Speed/Humanize controls and
  Natural/Hard Tune/Modern Trap/Extreme mode presets, exactly as specified
- ✅ Built as an **offline render** (analyze the whole take, resynthesize
  via TD-PSOLA), not real-time monitoring — a deliberate architecture
  decision, documented in AUDIO_ENGINE.md/AI_FEATURES.md rather than a
  silently-missed requirement. "Apply Pitch Correction" always creates a
  new sample + clip; the original take is never overwritten
- ✅ Verified in-browser: a synthesized, deliberately-flat C major arpeggio
  correctly visualized as an ascending note staircase, correctly detected
  as C major, Hard Tune correction rendered a new in-tune take, playback
  clean with zero console errors
- ✅ 34 pitch-specific unit tests (102 total project-wide): YIN accuracy
  against known frequencies (including an octave-error resistance case),
  key detection including a transposition test, note/scale snapping,
  retune-speed glide behavior (this caught and fixed a real bug — the
  glide was jumping straight to target instead of gliding from the sung
  pitch, which would have made the "retune speed" knob do nothing
  audible), humanize variation, and an end-to-end detect→correct→
  re-detect test confirming corrected audio actually lands near the target

Deliberately not built (see AUDIO_ENGINE.md "What's deliberately not here
yet" and AI_FEATURES.md): real-time/live pitch correction, formant
preservation, manual note editing (the pitch track is visible, not yet
draggable).

## Phase 6 — Beat Analyzer ✅

- ✅ BPM detection: autocorrelation of an onset-strength envelope (a
  "tempogram"), with a soft tempo prior to reduce half/double-time octave
  errors — a real failure mode this actually hit during development on a
  synthesized 120 BPM beat with a kick/snare backbeat (came back 60 before
  the fix), now a regression test
- ✅ Key/scale detection: reuses Phase 5's `keyDetection.ts` against a new
  full-spectrum chromagram (`chromagram.ts`) instead of reimplementing
  key-finding — exactly the reuse Phase 5's docs called for
- ✅ Bass/808 line tracking: lowpass isolation + the same YIN tracker
  Phase 5 built for vocals, retuned to bass range
- ✅ Per-segment chord estimation: chroma template matching (24 major/
  minor triads), confidence-scored — known limitation observed on a real
  test (relative major/minor confusion, e.g. F major read as Dm), named in
  AUDIO_ENGINE.md rather than hidden
- ✅ Onset-based kick/snare/hihat classification — explicitly a heuristic
  (spectral shape only), not a transcription; the UI says so
- ✅ Section boundary detection from energy novelty — relative loudness
  labels, not verse/chorus semantics (can't get those from energy alone)
- ✅ "Beat" button per sample (Audio browser tab) opens a panel showing
  BPM/key, a bass pitch-track canvas, a drum-hit timeline, chord chips, and
  section markers
- ✅ Verified in-browser on a synthesized 120 BPM / C-F-G-Am beat with a
  kick-snare-hihat pattern: correct BPM (post-fix), correct key (C major,
  87% confidence), correctly tracked bassline, plausible drum-hit spread,
  3 of 4 chords correct (the fourth is the documented Dm/F confusion)
- ✅ 32 new unit tests (126 total project-wide), including two regression
  tests for real failures caught during this phase (tempo octave error,
  and the underlying chord-confusion behavior is covered by the existing
  chord-matching tests)

Explicitly not attempted (see AUDIO_ENGINE.md/AI_FEATURES.md): melody
extraction from a full mix, instrument recognition, true structural
(verse/chorus) labeling, chord-sequence smoothing, full downbeat/meter
tracking. All real gaps against the original wishlist, named rather than
faked.

## Phase 7 — Key/Scale Detection ✅ (absorbed into Phases 5 and 6)

The original plan was a standalone, reusable, confidence-scored key/scale
detector. That's exactly what happened, just earlier than planned: Phase 5
built `keyDetection.ts` for vocal pitch tracks, and Phase 6 reused it
as-is against a beat's chromagram. No separate Phase 7 work was needed —
this entry stays only so the roadmap's phase numbering isn't confusing to
whoever reads it next.

## Phase 8 — Vocal + Beat Matching ⬜

Compares vocal pitch center to detected beat key, reports compatibility.
Unblocked now — both detectors it needs (Phase 5's vocal key/pitch, Phase
6's beat key) already exist. What's left is the comparison logic and a UI
surface for it, not new detection work.

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

**Next up:** Phase 8 (Vocal + Beat Matching) is the cheapest next win —
both detectors it needs already exist, it's comparison logic and a UI
surface, not new DSP. Phase 9 (AI Vocal Engineer) is the other reasonable
option and more central to the project's #1 priority (vocal quality) — it
builds on Phase 4's rule-based Phone Mic Enhance the same way Phase 6
built on Phase 5's key detection: extend, don't reimplement.
