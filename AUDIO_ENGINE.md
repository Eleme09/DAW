# Audio Engine

`src/audio-engine/AudioEngine.ts` — single class, single instance
(`getAudioEngine()`), owns the one `AudioContext` for the app.

## Hard rule: real-time vs. offline

Nothing in `src/audio-engine/` may do expensive work (analysis, ML
inference, file I/O) inside the audio callback path or synchronously on the
UI thread during playback. That's what causes glitches/dropouts. As DSP and
AI analysis get added (Phase 3+), they go through this split:

- **Real-time DSP** (EQ, compression, effects during playback): Web Audio
  native nodes (`BiquadFilterNode`, `DynamicsCompressorNode`, etc.) or
  `AudioWorkletNode` for anything custom. Runs on the audio rendering
  thread, must be allocation-free per callback.
- **Offline analysis / AI** (loudness, spectral analysis, noise
  fingerprinting, chain suggestions, pitch/key detection, beat generation):
  runs on `OfflineAudioContext`, a Web Worker, or a server call — never on
  the main thread during live monitoring. Results come back as data
  (parameters, suggested chains) that get applied to the real-time graph
  afterward, not as inline processing.

This split doesn't exist yet in code because Phase 1 has no DSP — it's
written here so whoever builds Phase 3 doesn't accidentally wire an analysis
pass into the playback graph.

## Node graph (current, Phase 1)

```
per track:  input -> volume -> pan -> muteGain -> analyser -> master
                                                                  |
                                                              analyser -> destination
```

- `input` is an intentionally empty pass-through gain node — it's the
  attachment point for the future per-track insert chain (Phase 3 effects).
  Nothing connects to it yet except clip sources.
- `muteGain` is 0/1, computed from `muted` + solo logic (if any track is
  soloed, all non-soloed tracks go silent) every time `syncTracks()` runs.
- Each track and the master bus has its own `AnalyserNode` for metering
  (`MeterBar` component reads `getFloatTimeDomainData` on a rAF loop).

## Clip scheduling

Clips are scheduled with plain `AudioBufferSourceNode.start(when, offset,
duration)` calls, computed relative to `AudioContext.currentTime` at the
moment `play()`/`seek()` is called. Fades are implemented as linear gain
ramps on a per-clip envelope `GainNode` (see `applyFades`).

This is a "schedule everything at play time" model, not a lookahead
scheduler. It's correct and glitch-free for the Phase 1 workflow (arrange,
then hit play) but does **not** auto-reschedule a clip you add/move while
already playing on a track that hasn't reached it yet — full support for
"edit live during playback" needs a proper lookahead loop (rewrite
`scheduleClips`/`startClock` together; don't patch around it piecemeal).

## Buffers

`decodeAndCache(sampleId, arrayBuffer)` decodes once and keeps the
`AudioBuffer` in an in-memory `Map`. This cache is **not** persisted — after
a reload it's empty, which is why `src/lib/audio/sampleLoader.ts` exists to
re-decode from the IndexedDB blob on demand (`ensureSampleLoaded`). Any new
code path that plays a sample must go through `ensureSampleLoaded`, not
assume the buffer is already cached.

## Transport / clock

`getCurrentTime()` is computed from `AudioContext.currentTime`, not a
`setInterval` counter — this is what keeps playback position accurate even
under UI jank. The `requestAnimationFrame` loop in `startClock` only exists
to push that computed time into the UI (and to check loop boundaries); it
is not the timing source itself.

## Metronome

Runs on a `setInterval(25ms)` lookahead scheduler (the standard "Chris
Wilson tutorial" pattern: schedule any click due within the next 100ms,
using precise `AudioContext` time for the actual click, not the interval
callback's timing). This is the one place Phase 1 already does lookahead
scheduling — worth reusing that pattern instead of reinventing it when the
clip scheduler eventually needs the same treatment.

## What's deliberately not here yet

- No EQ/compression/effects nodes (Phase 3).
- No pitch detection/correction (Phase 5).
- No noise reduction (Phase 3/4 — phone mic enhancement).
- No LUFS/loudness metering beyond the raw peak meter bars (Phase 3/10).
- No MIDI/instrument tracks — `Track.type` is `"audio"` only for now; the
  type is already a union-of-one so adding `"midi"` later doesn't require
  restructuring existing tracks.

Building any of these: keep them as functions/classes that take an
`AudioContext` and connect into the graph, rather than reaching into
`AudioEngine`'s private state. The per-track `input` `GainNode` (in the
private `TrackGraph`) is the intended attachment point for a future insert
chain — it exists today as an empty pass-through; wiring effects onto it
will mean adding a public accessor (e.g. `getTrackInput(trackId)`) rather
than exposing the whole `TrackGraph`.
