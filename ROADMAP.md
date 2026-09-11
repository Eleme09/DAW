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
"What's deliberately not here yet"): expander, phaser, true spectral/ML
noise reduction (→ Phase 4), certified LUFS. Multiband compressor,
exciter, chorus/flanger, auto-pan, and stereo width were deferred here
too but have since been built — see "Additional effects" below.

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

Spectral noise reduction (the gate here only silences gaps, doesn't
remove noise under the signal) was deferred at this point in the roadmap
but has since been built — see "Spectral noise reduction" below. Pitch
analysis was deliberately kept out of this phase's result — that's
Phase 5's job.

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
yet" and AI_FEATURES.md): formant preservation, manual note editing (the
pitch track is visible, not yet draggable). Real-time/live pitch
correction was deferred here but has since been built — see "Real-time
pitch monitor" below.

## Real-time pitch monitor ✅ (built after the original 13-phase roadmap)

The user explicitly asked for this after reviewing the finished roadmap —
"debe sonar conmigo cuando cante, es la manera de caer en nota" (I need to
hear it while I sing, that's how I land on the note). Addresses exactly
the gap Phase 5 named and deferred.

- ✅ `public/worklets/realtime-pitch-processor.js`: causal YIN detection +
  streaming glide/humanize correction curve + a delay-line pitch shifter,
  all reimplemented from scratch for streaming/causal operation (the
  offline PSOLA pipeline can't run causally — see AUDIO_ENGINE.md)
- ✅ `AudioEngine.enableLivePitchMonitor`/`disableLivePitchMonitor`/
  `updateLivePitchMonitorSettings`: routes the mic through the worklet to
  `ctx.destination` — a deliberate, narrow, opt-in-only exception to
  "mic never touches output," with a persistent headphones/feedback
  warning in the UI. Recording stays unaffected (still captures dry).
- ✅ "🎤 Live Tune" bar (`LivePitchMonitorPanel.tsx`) under the transport:
  Key/Scale/Mode controls plus a live Sung→Target note readout
- ✅ Two real bugs caught and fixed during verification, both worth
  remembering (see AUDIO_ENGINE.md for the full writeup): (1) a naive
  grain-reset pitch-shift design that measurably applied *zero* net
  correction despite correct detection/glide math, caught by rendering a
  known-frequency test tone through the worklet via `OfflineAudioContext`
  and measuring the output hadn't moved; (2) passing `scale` via a
  worklet port message, which is async and can arrive after an
  `OfflineAudioContext` render already finished — fixed by making it a
  k-rate `AudioParam` like the other settings, which is guaranteed
  in effect from the first render quantum
- ✅ Verified via a battery of `OfflineAudioContext` renders (Playwright):
  correct upward and downward correction, stability across 4 seconds and
  multiple internal delay rebases, the slower "natural" glide mode
  converging within its expected time constant, bypass passing audio
  through unchanged, no NaNs/runaway amplitude over a 6-second render,
  and the full UI flow (toggle on/off, live readout, headphones warning)
  exercised with Playwright's fake mic device — zero console errors
- Real limitations, not hidden: ~30-50ms latency, no formant preservation,
  an occasional brief crossfade artifact at a delay rebase, pitch ratio
  clamped to roughly ±6 semitones

## BS.1770-4 integrated loudness ✅ (built after the original 13-phase roadmap)

Part of the same "build everything you told me isn't done" pass as the
real-time pitch monitor above. The Mastering Assistant (Phase 13, part 1)
originally compared against a fast K-weighting approximation shared with
the live Analyzer meter; this replaces that comparison's source with a
real gated-integrated measurement.

- ✅ `src/audio-engine/bs1770.ts`: exact published 48kHz ITU-R BS.1770-4
  K-weighting biquad coefficients (shelf + high-pass stages), linear-
  interpolation resample to 48kHz for other sample rates, 400ms blocks at
  100ms hop, absolute gate (-70 LUFS) then relative gate (ungated average
  - 10 LU) per the standard's two-pass structure
- ✅ Wired into `analyzeMix`/`MixAnalysisResult.mix.integratedLufs` and
  the Mix Assistant panel (`suggestMasteringGain` now receives the real
  integrated value); the live Analyzer meter's separate fast
  approximation (`loudness.ts`) is untouched on purpose — it can't buffer
  the whole signal, so it structurally can't run the gated algorithm
- ✅ 7 unit tests: length/attenuation behavior of the K-weighting filter,
  silence reads -Infinity, louder-reads-louder, a full-scale 1kHz tone
  lands in a plausible (not asserted-exact) range, gating keeps a loud
  section's reading from being dragged down by a long quiet tail,
  resampling doesn't crash for 44100/48000/22050 Hz
- **Honest limit, stated plainly**: the coefficients and gating structure
  are the standard's real published values (high confidence — they match
  across essentially every independent open-source implementation), but
  this has **not** been validated against ITU/EBU's own official
  conformance test vectors (no internet access in this environment to
  fetch them, and not enough confident recall of their exact expected
  values to hand-type them safely as a test oracle). Trustworthy for
  *comparing* loudness (louder/quieter, on/off a mastering target) —
  not a claim of bit-exact match to a certified reference meter. Also
  mono-only, consistent with the rest of this project's analysis
  pipeline.

## Additional effects ✅ (built after the original 13-phase roadmap)

The six effect types Phase 3 deferred as "eventually" (see that phase's
notes above) — multiband compressor, chorus, flanger, exciter, auto-pan,
stereo width. Same "build everything you told me isn't done" pass as the
real-time pitch monitor and BS.1770 upgrade above.

- ✅ `MultibandCompressorEffect.ts`: 3-band parallel split (standard
  2nd-order 12dB/oct crossover, not phase-corrected Linkwitz-Riley — a
  named simplification), each band its own `DynamicsCompressorNode` +
  makeup gain, summed back together
- ✅ `ChorusEffect.ts`/`FlangerEffect.ts`: LFO-modulated `DelayNode`s —
  chorus uses a longer delay with no feedback (thickening), flanger a
  much shorter delay with feedback (the resonant sweep)
- ✅ `ExciterEffect.ts`: highpass + the same saturation curve
  `SaturationEffect` already uses, blended additively on top of the dry
  signal (not a dry/wet crossfade — it adds harmonic "air")
- ✅ `AutoPanEffect.ts`: LFO drives a `StereoPannerNode` directly
- ✅ `StereoWidthEffect.ts`: mid-side processing from a channel
  splitter/merger + plain `GainNode` arithmetic (`mid = 0.5(L+R)`,
  `side = 0.5(L-R)`, scaled by `width`, recombined)
- ✅ All 6 wired through the same fully-generic Effects Rack UI as every
  other effect — no UI-specific code needed beyond the params editor,
  since the rack is data-driven off `EFFECT_LABELS`/`EffectType`
- ✅ Verified via Playwright: UI smoke test (added all 6 to a track and
  master, tweaked params, toggled bypass, played back, zero console
  errors) PLUS numeric verification against exported WAV output, since
  these are custom node-graph wiring (not simple node wrappers) and
  carry the same "looks right but silently does nothing" risk class the
  real-time pitch worklet's zero-net-shift bug turned out to be:
  Stereo Width's L-R difference measured exactly 0.000 at width=0 and
  scaled linearly with width; Auto-Pan's L/R balance measured actually
  swinging -0.86 to +0.65 over time; Chorus/Flanger/Exciter's
  active-vs-bypassed exports differ by a real margin with sane
  non-clipping levels and no NaN; Multiband Compressor's aggressive
  low-band settings measurably dropped output RMS vs. a neutral
  baseline on a tone routed into that band. See AUDIO_ENGINE.md
  "Additional effects (post-launch)" for the full writeup.

## Spectral noise reduction ✅ (built after the original 13-phase roadmap)

Closes the gap Phase 3/4 named and deferred: the Noise Gate only silences
gaps between phrases, never noise sitting *underneath* a loud signal.
Classic spectral subtraction (no ML), same "build everything you told me
isn't done" pass as the other post-launch additions above.

- ✅ `src/audio-engine/analysis/spectralNoiseReduction.ts`: STFT via new
  `ifftInPlace` (`fft.ts`) → noise profile estimated from the recording's
  own quietest 10% of frames → per-frame magnitude subtraction with a
  spectral floor → original phase kept → inverse FFT → windowed
  overlap-add, normalized by actual window energy
- ✅ **Two real bugs caught and fixed during development** (see
  AUDIO_ENGINE.md for the full writeup): (1) dividing by near-zero
  overlap-add window energy at a buffer's absolute start/end amplified
  any spectral change there by orders of magnitude — a debug render
  caught peaks reaching ~3x the input; (2) a units mismatch between the
  noise-profile estimator (normalized by frame size) and the subtraction
  loop (not normalized) made the profile ~2048x too small, so
  subtraction was effectively a no-op at any strength — caught by
  hand-deriving the expected per-bin scale factor and comparing it
  against what a debug render actually produced
- ✅ "Denoise" button added to the Audio browser tab next to Analyze/
  Engineer/Pitch/Beat (`DenoisePanel.tsx`), same "renders a new, separate
  take" pattern as Pitch Studio — the original recording is never
  overwritten
- ✅ 19 unit tests (268 total): `ifftInPlace` round-trips correctly,
  noise profile built from a recording's quiet section rather than its
  loud one, monotonic never-amplifying reduction as strength increases,
  a noise-only section reduced far more than a section where the same
  noise sits under a loud tone, substantial attenuation with an accurate
  profile, no NaN/Infinity, multi-channel handling
- ✅ Verified in-browser with Playwright: imported a synthetic noisy-
  then-toned recording, applied Denoise at high strength, confirmed a
  new track was created with a visibly different waveform and played
  back cleanly, zero console errors

Real limitations, not hidden: needs actual quiet moments in the
recording to build an accurate profile from; prone to "musical noise" at
aggressive settings; assumes stationary noise; not a substitute for a
trained model (RNNoise-style) at separating voice from noise that
overlaps heavily in time and frequency.

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

## Phase 8 — Vocal + Beat Matching ✅

- ✅ Comparison logic (`src/audio-engine/matching/vocalBeatMatch.ts`):
  wires Phase 5's vocal pitch/key detection to Phase 6's beat key
  detection — no new DSP, just the comparison the brief asked for
- ✅ Compatible means same key **or relative major/minor** (e.g. C major
  and A minor share every note — correctly treated as compatible, not a
  mismatch)
- ✅ Plain-language messages matching the brief's own example format
  ("Your vocal (X) matches the beat (Y)." / "The beat appears to be X,
  while the vocal is centered around Y.") — no music-theory essay
- ✅ Notes-outside-scale check: which pitch classes the vocal actually sang
  that fall outside the beat's key/scale
- ✅ New "Match" tab in the Audio browser panel: pick a vocal sample and a
  beat sample, Compare, see the result
- ✅ Verified in-browser: a C-major vocal melody against a C-major beat
  correctly read as matching (89%/87% confidence)
- ✅ 7 new unit tests (134 total): same-key match, relative major/minor
  match, incompatible-key message format, scale-membership checks

## Phase 9 — AI Vocal Engineer ✅

- ✅ "Make Vocal Professional" chain builder
  (`vocalEngineerChain.ts`): extends Phase 4's corrective logic (same
  analysis -> noise gate/EQ/de-esser reasoning) with an always-present
  baseline compressor and a stylistic layer (tone tilt, presence,
  saturation, reverb, delay) from a selected preset
- ✅ 13 vocal character presets (Clean/Natural/Bright/Dark/Aggressive/
  Melodic/Trap/Rage/Cinematic/Radio/Lead/Adlib/Double) — matches the
  brief's list exactly
- ✅ 8 genre-inspired presets (Yeat/rage, Travis Scott/atmospheric trap,
  Kanye/experimental, Hades 66/dark cinematic, Clarent/aggressive,
  Yovngchimi/hard, Kris R/modern Latin, Luar La L/dark melodic) —
  characteristics only, no literal chain copying (see AI_FEATURES.md)
- ✅ "Engineer" panel per sample (Audio browser tab): style picker with
  description, "Make Vocal Professional" applies the chain to a track
- ✅ Pitch correction intentionally excluded from this chain — it's Phase
  5's separate offline render; the UI points to the Pitch tab instead
- ✅ Verified in-browser: a noisy/muddy test recording + "Rage-inspired"
  produced Noise Gate -> EQ (corrective + stylistic bands) -> ... ->
  Limiter, applied to a track, played back clean with zero console errors
- ✅ 8 new unit tests (142 total): minimal chain for a clean recording,
  full signal-flow order when everything is flagged, compressor ratio
  taking whichever is stronger (corrective vs. stylistic), EQ tilt math,
  skip-when-zero-mix logic, every preset producing a valid chain

## Project Export ✅ (gap fix, not a numbered phase)

Built between Phase 9 and Phase 10 after noticing a real hole against the
brief's mobile workflow ("Mix → Master → Export"): there was no way to
actually get a finished mix out of the DAW as a file.

- ✅ Effects generalized from `AudioContext` to `BaseAudioContext`
  (`Effect.ts` and all nine `*Effect.ts`/`EffectChain.ts`) — mechanical,
  no behavior change, verified by the full existing test suite passing
  unmodified
- ✅ Offline bounce engine (`src/audio-engine/bounce.ts`): renders the full
  project (every track's clips/volume/pan/mute/solo/inserts + master
  inserts) to one stereo `AudioBuffer` via `OfflineAudioContext`, reusing
  the same `EffectChain` the live engine uses — see AUDIO_ENGINE.md
  "Offline bounce / project export" for the specific differences from
  live playback (eager worklet load, t=0 scheduling, fixed reverb/delay
  tail padding)
- ✅ Export button in `TransportBar`: hydrates every sample referenced by
  the project, bounces, encodes with the existing `wavEncoder.ts`,
  triggers a browser download (`src/lib/audio/exportProject.ts`) — disabled
  while there's nothing on the timeline or a take is recording
- ✅ Verified in-browser with Playwright: imported a 2s test tone, added it
  to a track, exported — downloaded WAV was stereo/44.1kHz/16-bit, 5s long
  (2s clip + the 3s tail pad, as expected), non-silent (`maxAbs` well above
  zero), zero console errors
- ✅ tsc/lint/vitest (142 tests, unchanged) and `next build` all clean

This is also the infrastructure Phase 10 (below) needs: analyzing the
*actual summed mix* requires rendering it first, which is exactly what
`bounceProject` now does.

## Phase 10 — AI Mix Assistant ✅

- ✅ Full-mix read (`mixAnalysis.ts`): reuses Phase 4's
  `analyzeVocalChannel` directly on the rendered/summed mix (via
  `bounceProject`) — mud/harshness/sibilance/low-end/dynamics/peak/RMS on
  the actual mix, not a per-track guess
- ✅ Masking detection (`mixDiagnostics.ts`): flags track pairs that both
  concentrate energy in the same frequency band (measured per-track, in
  isolation, via solo-rendering each track) — an explainable heuristic
  (band-energy share ≥0.16 for both tracks), not a psychoacoustic model
- ✅ Gain-staging detection: flags tracks sitting ≥6dB from the session's
  median track level
- ✅ Suggested corrections (`mixSuggestions.ts`), never auto-applied: a
  masking finding produces one EQ-cut suggestion per track in the pair (a
  -3dB peaking cut at the contested frequency); a gain-staging finding
  produces a volume-trim suggestion sized to the session median. Applying
  either uses the exact same store actions (`setEffectChain`/
  `updateTrack`) manual edits use
- ✅ New "Mix" tab in the Browser panel (`MixAssistantPanel.tsx`): Analyze
  Mix, full-mix read, masking/gain-staging findings, suggestion buttons
- ✅ Verified in-browser with Playwright: three synthetic tracks (two
  ~1kHz tones on separate tracks, one quiet bass-band tone) correctly
  produced a masking finding between the two mid-band tracks and a
  gain-staging finding for the quiet track; applied both suggestion types
  and confirmed the EQ cut landed in the target track's Effects Rack
  (Peaking, 1000Hz, -3.0dB, Q 1.4) and the gain trim moved that track's
  fader; playback stayed glitch-free afterward, zero console errors
- ✅ 16 new unit tests (158 total) for the pure diagnostics/suggestion
  logic, using synthetic per-track profiles (masking pair detection,
  band-concentration vs. broadly-balanced-mix non-detection, ranking/
  capping findings, gain-staging in both directions, silent-track
  exclusion, suggestion generation for both finding types)

Explicitly not attempted this phase (see AI_FEATURES.md/AUDIO_ENGINE.md):
mix-level clipping detection, a true psychoacoustic masking model,
cross-track sidechain-style masking reduction, per-platform LUFS
mastering targets (Phase 13). Cost tradeoff named rather than hidden: this
renders the project once per track plus once for the full mix, so it
scales with track count/length, fine for this project's own scale.

## Phase 11 — Beat Generator ✅

- ✅ Chord progressions (`progressions.ts`): a hand-picked library per
  scale (major/natural minor), stored as scale-degree sequences so they
  transpose to any key; triad quality derived structurally from the
  scale's own intervals (stacked thirds), not hardcoded per degree
- ✅ Drum patterns (`drumPatterns.ts`): one idiomatic base pattern per
  genre (trap/boomBap/dance/halfTime) on a 16-step grid, plus
  mood-weighted, seeded-PRNG hihat rolls for trap specifically
- ✅ Bassline (`bassGenerator.ts`): follows the kick pattern (a note per
  kick, sustained to the next kick), two octaves below the chord root —
  the "808 follows the kick" technique, not an independent melodic line
- ✅ Melody (`melodyGenerator.ts`): an up-down arpeggio over each chord's
  own tones, explicitly documented as a simplification rather than a
  phrasing-aware melody generator
- ✅ Orchestrator (`beatGenerator.ts`) + synthesis (`synthesizeBeat.ts`):
  deterministic generation (same seed -> same `GeneratedBeat`, checked
  directly in tests) rendered to 4 stereo `AudioBuffer`s via
  `OfflineAudioContext` using simple synthesized instruments (sine/saw/
  triangle oscillators, filtered noise) — no sample library, and the UI
  says so plainly
- ✅ New "Generate" tab (`BeatGeneratorPanel.tsx`): Key/Scale/Genre/Mood/
  Seed controls, BPM taken from the project; Generate creates 4 new,
  independently editable tracks (Drums/Bass/Chords/Melody) through the
  same sample-storage pipeline recorded takes use — no special-cased
  "generated track" concept
- ✅ Verified in-browser with Playwright: generated a beat, confirmed 4
  non-silent waveforms with correct names, played back cleanly with live
  meters on all 4 tracks and the master bus, zero console errors, and
  successfully exported the resulting project through the existing
  Export pipeline with no special-casing needed
- ✅ 32 new unit tests (190 total) for every pure generation module
  (seeded-PRNG determinism, diatonic triad quality including the vii°
  diminished case, progression/chord timing, drum-pattern genre rules,
  kick-following bass timing, arpeggio note coverage, end-to-end
  generator determinism and event-timeline bounds)

Explicitly not attempted (see AI_FEATURES.md/AUDIO_ENGINE.md): a true
generative/ML model, melody with real phrasing/motif development, genres
or time signatures beyond the four genres and 4/4 assumption this pass
shipped with, and editing the generated note events themselves (the
output is rendered audio immediately, not an editable MIDI-like
representation in the UI).

## Phase 12 — Beat Reconstruction ✅

- ✅ Reconstruction mapping (`reconstructBeat.ts`, pure, unit-tested):
  maps Phase 6's detected `BeatAnalysisResult` into Phase 11's own
  `DrumHitEvent`/`BassNoteEvent`/`ChordEvent` shapes — drum hits map
  directly (detection confidence becomes synthesis velocity, floored not
  zeroed); the bass line needed real new logic, since Phase 6 outputs a
  continuous per-frame pitch track, not discrete notes — grouped into
  held notes via a pitch-tolerance + gap-length rule; chords map directly
  (root + major/minor quality -> a stacked triad)
- ✅ Synthesis reuse: `synthesizeReconstruction()` in `synthesizeBeat.ts`
  calls the exact same `synthDrums`/`synthBass`/`synthChords` functions
  Phase 11 uses (now exported for this), no melody stem — Phase 6 never
  attempts melody extraction from a full mix, so there's nothing to
  reconstruct there, named as inherited scope rather than a new gap
- ✅ "Reconstruct as Tracks" button added to the existing Beat Analyzer
  panel — no separate upload/analyze flow, reuses the panel's
  already-computed analysis
- ✅ Verified in-browser with Playwright: analyzed a synthesized test
  beat, reconstructed it, confirmed 3 non-silent tracks (Drums/Bass/
  Chords) whose waveforms reflect the actual detected hit/note/chord
  counts (41 drum hits, 14 bass notes, 8 chords in the test run), played
  back cleanly with live meters on all 3 tracks and master, zero console
  errors
- ✅ 11 new unit tests (201 total): BPM-to-beat conversion, confidence-to-
  velocity mapping and the "other" hit type being dropped, major/minor
  triad construction, bass-line note segmentation (grouping steady
  pitch, splitting on a real pitch jump, tolerating a brief dropout vs.
  ending a note on a real gap, empty/fully-unvoiced input)

Reconstruction quality is bounded by Phase 6's own detection quality
(tempo octave ambiguity, chord relative-major/minor confusion, heuristic
drum classification) — inherited limitations, not new ones, and the UI
calls this "best-effort approximation," never a lossless transcription.

## Phase 13 — Advanced AI ✅

- ✅ **Mastering Assistant** (`masteringTargets.ts` + `bs1770.ts`'s
  `computeIntegratedLufs`, upgraded from the original launch's
  `approxLufsFromMix` — see "BS.1770-4 integrated loudness" below):
  per-platform LUFS targets (Spotify/Apple Music/YouTube/SoundCloud/
  TikTok) compared against the bounced mix's true gated-integrated
  loudness, with a suggested master-gain trim folded into the existing
  Mix Assistant panel. Applies as a 1:1-ratio compressor makeup-gain
  stage — no new effect type needed.
  Verified in-browser: switching platforms recomputed the target/delta
  live, applying added exactly the expected Compressor (ratio 1.0:1,
  threshold 0dB, makeup +2.6dB in the verification run) to the master
  chain, zero console errors. 9 new unit tests (214 total): filter
  frequency-response checks, `approxLufsFromMix` silence/loudness/
  K-weighting behavior, and every mastering-suggestion direction
  (turn up, turn down, already-at-target, silence).
- ✅ **Natural-language AI Music Assistant** (`app/api/assistant/route.ts`
  + `lib/ai/`): the one feature in the entire original roadmap that
  needed a real decision from the user rather than an engineering call —
  asked directly rather than guessed at. The user chose to connect a
  real provider (Anthropic, behind their own `ANTHROPIC_API_KEY`) rather
  than leaving it unbuilt or skipping it. Commands resolve to a closed,
  validated set of concrete project mutations (volume/pan/mute/solo,
  EQ/compressor/reverb/delay/saturation) — the model can't express
  anything outside that fixed tool vocabulary, and nothing it proposes
  applies without the user clicking Apply. `ANTHROPIC_API_KEY` is
  server-only (never reaches the browser); unset, the assistant shows
  "not configured" and the rest of the DAW is unaffected — verified live
  in-browser via Playwright (the actual state in this build environment,
  since no key was available here). The provider sits behind a
  one-method `AssistantProvider` interface so a different vendor could
  be swapped in without touching the UI.
- ⚠️ **Verification gap, named rather than hidden**: the real model
  round-trip (an actual command in, actual tool calls out) was never
  exercised end to end in this build environment — no API key was
  available to test against. Everything reachable without a live key
  was verified (SDK type-correctness, unit tests of the parsing/
  validation/application logic, the "not configured" path). Whoever adds
  a real key should do one live pass before relying on this daily — see
  AUDIO_ENGINE.md's "AI Music Assistant (Phase 13, part 2)" for the full
  list of what was and wasn't checked.

This closes every phase in the original roadmap (1 through 13). What's
left is exactly what's named throughout AUDIO_ENGINE.md/AI_FEATURES.md as
deliberately out of scope for this pass (real-time pitch correction,
formant preservation, true spectral/ML noise reduction, melody extraction
from a full mix, a true psychoacoustic masking model, a live end-to-end
test of the AI Music Assistant) — real gaps, named plainly, not silently
missing.

---

**Next up:** nothing from the original 13-phase roadmap remains. What's
left is (1) adding a real `ANTHROPIC_API_KEY` and doing a live end-to-end
pass on the AI Music Assistant (the one verification gap named above),
and (2) the many "deliberately not attempted" items named throughout
AUDIO_ENGINE.md/AI_FEATURES.md as real, honestly-documented gaps rather
than hidden ones — real-time/live pitch correction, formant preservation
in PSOLA, true spectral/ML noise reduction, melody extraction from a full
mix, instrument recognition, a true psychoacoustic masking model,
mix-level clipping detection, and manual editing of a generated beat's
note events before they're rendered to audio. None of these were skipped
by oversight — each is called out at the point in the docs where it was
deliberately scoped out, with the reasoning for why.
