# Personal AI DAW — Project Spec

Personal-use DAW, not a commercial product. Built for one workflow: record
vocals on a phone (often through earbuds/headset mics), pull them into a
proper DSP chain, correct pitch, match them to a beat, mix and master —
without a professional studio.

Genre focus: urban/trap and adjacent styles (rage, dark cinematic, melodic
trap). Production-characteristic references only (tonality, aggression,
saturation, width) — never copying specific commercial plugins or presets.

**Hard constraint the whole project respects:** DSP can compensate for a
cheap mic's limitations (noise, harshness, thinness, inconsistent gain). It
cannot turn a phone mic into a studio mic. Every "make this professional"
feature must be honest about that — report limitations (e.g. heavy clipping)
instead of pretending to fix them.

## Priority order (from the original brief, still the tie-breaker for scope decisions)

1. Vocal quality
2. Stable audio engine
3. DAW workflow
4. Beat analysis
5. AI assistance
6. Beat generation
7. Advanced features

Three things done well beat twenty done half-way.

## Phased roadmap

See `ROADMAP.md` for current status. Short version: Phase 1 (DAW shell,
timeline, playback, mixer) is done. Phases 2-13 (recording, vocal DSP chain,
phone-mic enhancement, pitch correction, beat analysis, key/scale detection,
AI vocal/mix assistants, beat generation/reconstruction) are not started.

## Non-goals (for now)

- No commercial VST/AU hosting. The plugin architecture is designed to be
  compatible with that idea later (see `AUDIO_ENGINE.md`), but nothing here
  depends on it.
- No multi-user/collaboration features. Single-user, single-project-at-a-time.
- No mandatory paid AI API. AI features must degrade to "not available" if no
  key is configured, never block the core DAW.

## Working across models/agents (gpt-astra 6 and others)

This project will be picked up by other AI agents, potentially a different
model family (the brief specifically mentions gpt-astra 6). To keep that
handoff sane:

- **Don't assume shared memory.** Read `ARCHITECTURE.md`, `AUDIO_ENGINE.md`,
  `AI_FEATURES.md`, and `ROADMAP.md` before changing structure — they are
  the actual source of truth, not this file's summary.
- **Keep the module boundaries.** `src/audio-engine/` never imports React or
  Next.js. `src/components/` never talks to the Web Audio API directly except
  through `src/audio-engine/` and `src/state/`. This is what lets a
  differently-trained agent reason about one layer without loading the rest.
- **Update the docs in the same change** that changes the architecture. A doc
  that lies is worse than no doc — future agents (any model) will trust it.
- **Types are the contract.** `src/types/project.ts` is the shape every layer
  (engine, state, storage, future AI features) agrees on. Extend it instead
  of inventing parallel shapes.
- **Language/stack is fixed for now:** TypeScript + Next.js (App Router) +
  Web Audio API on the client, Supabase for metadata persistence when wired
  up. If a future agent wants to introduce a second language (e.g. a Python
  service for heavy AI audio analysis), it must stay a separate offline
  service the client calls over HTTP — never inline into the real-time audio
  path. Document that decision in `AI_FEATURES.md` when it happens.
