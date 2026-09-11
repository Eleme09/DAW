# AI Features

Status: **not started.** Nothing in this file is implemented yet — Phase 1
was DAW shell/playback only. This document exists so the shape is decided
before the first AI feature gets bolted on ad hoc.

## Principles (from the project brief, restated as engineering constraints)

1. **AI must be optional.** The DAW works with zero AI configured — local
   recording, editing, mixing, playback. AI features are additive
   (analysis, suggested chains, generation) and must fail gracefully
   ("AI not configured" / "analysis unavailable") rather than blocking core
   workflow.
2. **No invented precision.** Key/BPM/chord detection, chain suggestions,
   noise/harshness scoring — every AI/analysis result needs a confidence
   value shown to the user, and low confidence must say so instead of
   presenting a guess as fact. This applies to DSP-based analysis too, not
   just ML-based.
3. **AI proposes, DSP executes.** "Make this vocal professional" means: run
   analysis -> derive parameters for the existing DSP chain (EQ curve,
   compressor ratio, de-esser threshold, etc.) -> apply through the same
   real-time-safe path effects normally use. The AI layer should not become
   its own parallel audio rendering path.
4. **Never promise to fix what isn't there.** A heavily clipped phone
   recording should be reported as clipped, with the option to proceed
   anyway — not silently "enhanced" into something that claims to recover
   lost signal.
5. **Don't copy proprietary chains.** Genre/artist-inspired presets
   (section 7 of the brief: Yeat/rage, Travis Scott/atmospheric, etc.)
   capture production *characteristics* (tonal balance, saturation amount,
   width, dynamics) as parameter presets for our own DSP — never reverse
   engineer or replicate a specific commercial plugin/preset.

## Where AI analysis runs

Per `AUDIO_ENGINE.md`'s real-time/offline split: all AI analysis
(loudness, spectral content, noise floor, pitch/key/BPM detection, mix
diagnostics, beat generation) is offline work. It can live in:

- A Web Worker (in-browser, no network dependency, works for DSP-only
  analysis — e.g. a JS/WASM noise floor or spectral analysis).
- A server-side call (for anything needing a real ML model — e.g. genre
  classification, generative beat elements, an LLM-driven chain
  recommendation).

Either way, results come back as **data** (numbers, suggested parameter
sets) applied to the existing engine/effects, never as an alternate
playback path.

## Built (Phase 4)

- **Vocal Analysis** (`src/audio-engine/analysis/`): clipping ratio, peak,
  RMS, noise floor (windowed-RMS percentile — assumes the recording has
  real quiet moments to measure, see `dynamicsAnalysis.ts`), dynamic
  range, and spectral balance (mud/harshness/sibilance/low-end, each
  reported **relative to the recording's own average level**, via a
  from-scratch FFT — `fft.ts`/`spectralAnalysis.ts` — not the Web Audio
  `AnalyserNode`, since this runs offline on a full buffer rather than a
  live signal). Severity thresholds (`vocalAnalysis.ts`) are heuristic,
  calibrated by ear against a handful of recordings — not trained on a
  labeled dataset, and not presented as more precise than that. No pitch
  analysis in this result on purpose — see Phase 5 below, not duplicated.
- **Phone Mic Enhance** (`autoChain.ts`): a deterministic, inspectable
  rule table maps the analysis to a concrete effect chain (Noise Gate → EQ
  → De-Esser → Compressor → Limiter, each stage only added if its
  corresponding problem was actually flagged) built from Phase 3's real
  DSP nodes. This is the **Phone Mic Enhance** feature specifically
  (artifacts typical of phone/earbud mics) — the broader, AI-driven "Auto
  Vocal Engineer" below is still Phase 9 and will likely supersede or
  extend this rule table rather than duplicate it.
- **Honesty check, in code, not just prose**: when clipping is detected,
  the UI surfaces it as an unfixable limitation instead of routing it
  through the auto-chain as if it could be corrected (`vocalAnalysis.ts`'s
  `limitations` array) — see PROJECT_SPEC.md's hard constraint.

## Built (Phase 5)

- **Pitch detection & key/scale detection** (`src/audio-engine/pitch/`):
  YIN pitch tracking (chosen over naive autocorrelation to avoid octave
  errors) and Krumhansl-Kessler key-finding from the resulting chroma
  histogram, both confidence-scored rather than presented as certain.
  Visualized as a pitch-over-time plot in the Pitch Studio panel — this is
  the "poder visualizar las notas detectadas" requirement from the brief.
- **Pitch correction** (`correctionCurve.ts` + `psola.ts` +
  `applyPitchCorrection.ts`): Key/Scale/Retune Speed/Humanize controls plus
  Natural/Hard Tune/Modern Trap/Extreme mode presets, exactly as specified.
  Implemented as an **offline render** (analyze the whole take, then
  resynthesize via TD-PSOLA), not a real-time monitor-while-singing effect
  — a deliberate architecture choice, not a missed requirement; see
  AUDIO_ENGINE.md's "Pitch detection & correction" section for the reasons
  and for what a real-time version would need instead. No formant
  preservation yet (also documented there) — the brief itself flagged this
  as "si es técnicamente viable," which turned out to mean "not in this
  pass." Every stage of this pipeline is unit-tested against synthetic
  tones with known frequencies, not just exercised in the UI.
- **Manual note editing**: not built. The pitch track is visible but not
  yet draggable/editable — a real gap, not hidden.

## Built (Phase 6)

- **Beat Analyzer** (`src/audio-engine/beat/`): BPM (autocorrelation of an
  onset-strength envelope, with a soft tempo prior to reduce — not
  eliminate — half/double-time octave errors), key/scale (reusing Phase
  5's `keyDetection.ts` against a full-spectrum chromagram instead of a
  monophonic pitch track), a tracked bassline (lowpass + the same YIN
  tracker Phase 5 built for vocals), a per-segment chord estimate (chroma
  template matching), a heuristic kick/snare/hihat classification of
  detected onsets, and energy-based section boundaries. All confidence-
  scored, all with real, sometimes-wrong-in-predictable-ways behavior
  caught during testing and documented rather than hidden — see
  AUDIO_ENGINE.md's "Beat analysis" section for the specific failure modes
  (a kick/snare backbeat reading as half-time; relative major/minor chord
  confusion) and how each was handled.
- **Explicitly not attempted**: melody extraction from a full mix
  (needs source separation), instrument recognition (needs a trained
  classifier), and true structural labeling (verse/chorus/etc. — energy
  boundaries are detected, semantic labels are not, because loudness alone
  can't tell you that). Named here so nobody mistakes their absence for an
  oversight.

## Built (Phase 8)

- **Vocal + Beat Match** (`src/audio-engine/matching/vocalBeatMatch.ts`):
  wires Phase 5's vocal pitch/key detection to Phase 6's beat key detection
  — no new detection, just comparison logic and a UI surface (the "Match"
  tab in the Audio browser panel). Compatible means same key **or**
  relative major/minor (C major and A minor share every note — treating
  that as a mismatch would have been actively wrong, not just imprecise).
  Messages match the brief's own example phrasing exactly, no
  music-theory explanation layered on top.

## Built (Phase 9)

- **Auto Vocal Engineer / "Make Vocal Professional"**
  (`src/audio-engine/analysis/vocalEngineerChain.ts`): extends Phase 4's
  Phone Mic Enhance rather than replacing it — same corrective logic
  (noise gate, EQ cuts, de-esser, all still driven by the measured
  analysis, per principle 3), plus a compressor that's now always present
  (baseline "professional" glue, not just a fix for flagged-uncontrolled
  dynamics), plus a **stylistic** layer that does NOT come from analysis:
  the selected preset's EQ tilt, presence boost, saturation, reverb, and
  delay. Two preset tables
  (`src/audio-engine/analysis/vocalStylePresets.ts`):
  - **13 vocal character presets** (Clean/Natural/Bright/Dark/Aggressive/
    Melodic/Trap/Rage/Cinematic/Radio/Lead/Adlib/Double), matching the
    brief's list exactly.
  - **8 genre-inspired presets** (Rage/Yeat-, atmospheric trap/Travis
    Scott-, experimental/Kanye-, dark cinematic/Hades 66-, aggressive/
    Clarent-, hard/Yovngchimi-, modern Latin/Kris R-, dark melodic/Luar La
    L-inspired) — each hand-picked to capture the *characteristics* the
    brief described (tonality, aggression, presence, saturation,
    ambiance, dynamics), never a literal copy of any artist's or plugin's
    actual chain, which this project has no access to and wouldn't use if
    it did. Every value is original, not reverse-engineered from a
    reference track.
  Pitch correction is deliberately NOT part of this chain — it's Phase
  5's separate offline render, architecturally incompatible with an
  insert-effect list (see AUDIO_ENGINE.md). The UI points to the Pitch
  tab instead of pretending to include it.
  Still fully rule-based, not ML — same principle-3 reasoning as Phase 4:
  deterministic, inspectable, and every result stays editable afterward
  in the Effects Rack like any manually-built chain.
- **Real-time pitch correction** (monitor live while singing): the offline
  Phase 5 pipeline above handles "record then correct"; live correction
  needs a streaming pitch tracker and an `AudioWorklet`-based shifter with
  bounded look-ahead instead — a different architecture, not an extension
  of the offline one. See AUDIO_ENGINE.md.
- **Formant preservation** in pitch correction (Phase 5's `psola.ts` — see
  AUDIO_ENGINE.md for why this was left out of the first pass).
- **Beat Reconstruction** (Phase 12): approximate MIDI/project
  reconstruction from an uploaded beat, confidence-scored per detected
  element.
- **AI Music Assistant** (Phase 13): natural-language commands ("make this
  vocal darker") that resolve to concrete project mutations (parameter
  changes via the same Zustand actions the UI uses), not just chat replies.

## Built (Phase 10)

- **AI Mix Assistant** (`src/audio-engine/analysis/mixAnalysis.ts` +
  `mixDiagnostics.ts` + `mixSuggestions.ts`): session-wide diagnostics
  across every track, not per-sample like Phases 4/9 — masking (track
  pairs both concentrating energy in the same frequency band), gain
  staging (tracks sitting well away from the session's median level), and
  a full-mix mud/harshness/sibilance/low-end read that reuses Phase 4's
  `analyzeVocalChannel` directly on the rendered mix (extending the
  single-track pattern to session-wide, per principle 3, rather than a new
  detection paradigm).
- **Suggested, not auto-applied, corrections**: masking findings produce
  single-band EQ-cut suggestions (one per track in the pair — this can't
  know which track should yield, so it offers both and the user picks);
  gain-staging findings produce a volume-trim suggestion. Every suggestion
  is inert data until the user clicks Apply, at which point it goes
  through the exact same `setEffectChain`/`updateTrack` store actions a
  manual edit would use.
- **"Mix" tab** in the Browser panel (`MixAssistantPanel.tsx`): Analyze
  Mix hydrates every referenced sample, runs the above, and shows the
  full-mix read, masking/gain-staging findings, and suggestion buttons
  (each flips to "Applied" once used).
- **No clipping detection at the mix level yet** — clipping is checked per
  recording (Phase 4) and implicitly guarded by the master limiter, but
  there's no explicit "the summed mix is clipping" diagnostic in this
  pass; a real gap against the original Phase 10 scope, named here rather
  than silently absent.
- **Cost/scope limitation, stated plainly**: computing per-track profiles
  renders the project once per track plus once for the full mix (N+1
  offline bounces), so analysis time scales with track count and project
  length — acceptable for this project's own scale, not something that
  would hold up for a large multitrack session without a different
  approach. See AUDIO_ENGINE.md "AI Mix Assistant (Phase 10)" for the full
  design rationale, including why masking uses per-track band-energy
  *shares* rather than the relative-dB metric Phase 4 uses.

## Built (Phase 11)

- **Beat Generator** (`src/audio-engine/generate/`): generates a
  drum/bass/chords/melody sketch from BPM/key/scale/genre/mood inputs as
  four new, independently editable tracks — the brief's requirement,
  resolved in favor of the rule-based/local-first approach this file's
  "Open technical decisions" section below already flagged as
  preferable (no mandatory paid API, matches principle 3).
- **Deterministic, not a trained model**: a hand-picked library of chord
  progressions and genre drum patterns, diatonic harmony derived
  structurally from the chosen scale (not hardcoded per chord), a
  kick-following bassline, and a chord-tone arpeggio melody — every piece
  is inspectable and reproducible (same seed -> same result, including
  the synthesized audio's noise texture, via a seeded PRNG). See
  AUDIO_ENGINE.md "Beat Generator (Phase 11)" for the full design.
- **Honesty about scope, built into the docs and the UI copy itself**:
  the panel tells the user up front that instruments are synthesized
  placeholders (oscillators + filtered noise, no sample library) meant to
  be mixed/replaced/built on, not a finished beat — consistent with
  principle 4 (never promise more than what's actually there).
- **Not attempted**: a true generative/ML model, melody with real
  phrasing or motif development (the arpeggiator is a deliberate
  simplification, named as such), genres/time-signatures beyond the four
  genres and 4/4 assumption this pass shipped with, and editing generated
  note events before they're rendered to audio (the output is audio clips
  immediately, not an editable MIDI-like representation in the UI).

## Open technical decisions (for whoever builds these)

- Which pitch-detection algorithm/library (autocorrelation, YIN, CREPE-style
  ML model) — depends on accuracy vs. latency needs once autotune UX is
  scoped.
- Whether beat generation/reconstruction needs a server-side model or can
  stay client-side/rule-based for a first pass. Given the "no mandatory
  paid API" principle, a rule-based/local first pass is preferable, with a
  pluggable interface for a stronger server-side model later.
- LLM provider for the natural-language assistant (Phase 13) — keep it
  behind an interface so it's swappable, don't hardcode one vendor's SDK
  into the assistant logic itself.
