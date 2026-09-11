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

## Planned surfaces (not built)

- **Auto Vocal Engineer** (Phase 9): broader than Phase 4's rule-based
  Phone Mic Enhance — analysis -> derived parameters for a fuller chain
  (dynamic EQ, saturation, tone shaping, pitch correction) and likely
  AI/ML-assisted parameter suggestions, not just fixed thresholds.
  Parameters must come from the analysis, not a fixed preset — see
  principle 3.
- **Real-time pitch correction** (monitor live while singing): the offline
  Phase 5 pipeline above handles "record then correct"; live correction
  needs a streaming pitch tracker and an `AudioWorklet`-based shifter with
  bounded look-ahead instead — a different architecture, not an extension
  of the offline one. See AUDIO_ENGINE.md.
- **Formant preservation** in pitch correction (Phase 5's `psola.ts` — see
  AUDIO_ENGINE.md for why this was left out of the first pass).
- **Manual note editing** on the detected pitch track (Phase 5's Pitch
  Studio shows it, doesn't yet let you drag individual notes).
- **Beat Analyzer / Key-Scale detection** (Phase 6-7): BPM, key, scale,
  section structure, confidence-scored. Note: Phase 5 already built a
  general-purpose key detector (`keyDetection.ts`) for vocal pitch tracks —
  Phase 6/7 should reuse it against a beat's detected notes/bassline rather
  than reimplementing key-finding from scratch.
- **Vocal + Beat Match** (Phase 8): compares detected vocal center to beat
  key, reports compatibility plainly (no music-theory essay, per the
  brief).
- **AI Mix/Mastering Assistant** (Phase 10/18): clipping/masking/mud
  detection across the session, moderate correction suggestions, LUFS
  targets per platform.
- **Beat Generator / Reconstruction** (Phase 11-12): generative
  melody/chords/drums from BPM/key/genre/mood inputs; approximate
  MIDI reconstruction from an uploaded beat, confidence-scored per
  detected element.
- **AI Music Assistant** (Phase 13): natural-language commands ("make this
  vocal darker") that resolve to concrete project mutations (parameter
  changes via the same Zustand actions the UI uses), not just chat replies.

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
