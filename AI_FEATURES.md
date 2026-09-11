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

## Planned surfaces (not built)

- **Vocal Analysis** (Phase 3/9): clipping, peak, RMS, LUFS, noise floor,
  dynamic range, spectral issues (mud, boxiness, harshness, sibilance),
  pitch stability. Feeds "Auto Vocal Engineer."
- **Auto Vocal Engineer** (Phase 9): analysis -> derived parameters for a
  noise reduction -> HPF -> corrective EQ -> dynamic EQ -> de-esser ->
  compressor -> saturation -> tone EQ -> pitch correction -> limiter chain.
  Parameters must come from the analysis, not a fixed preset — see
  principle 3.
- **Phone Mic Enhance** (Phase 4): a specialized analysis profile tuned for
  phone/earbud mic artifacts specifically (proximity effect, harsh upper
  mids, room noise, inconsistent gain).
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
