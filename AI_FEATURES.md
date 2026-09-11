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
  analysis yet — pitch belongs to Phase 5, not duplicated here.
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

## Planned surfaces (not built)

- **Auto Vocal Engineer** (Phase 9): broader than Phase 4's rule-based
  Phone Mic Enhance — analysis -> derived parameters for a fuller chain
  (dynamic EQ, saturation, tone shaping, pitch correction) and likely
  AI/ML-assisted parameter suggestions, not just fixed thresholds.
  Parameters must come from the analysis, not a fixed preset — see
  principle 3.
- **Pitch/Autotune engine** (Phase 5): pitch detection, key/scale
  detection, correction with retune speed / humanize / formant controls.
  This is real-time-adjacent (needs to run during monitoring for a usable
  autotune experience) — when built, it likely needs an `AudioWorklet`,
  not an offline pass; revisit the real-time/offline split in
  `AUDIO_ENGINE.md` specifically for this feature.
- **Beat Analyzer / Key-Scale detection** (Phase 6-7): BPM, key, scale,
  section structure, confidence-scored.
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
