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

## Node graph (current)

```
per track:  input -> [EffectChain] -> volume -> pan -> muteGain -> analyser -> master
                                                                                   |
master:     master -> [EffectChain] -> analyser -> destination
                                            |
                                       (loudness tap, see below)
```

- `input` is where clip sources connect; `[EffectChain]` is the per-track
  insert chain (Phase 3 — see "Effect chain" below). An empty chain is just
  a passthrough, so this diagram collapses to the Phase 1 shape when a
  track has no inserts.
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

## Recording

`AudioEngine.startRecording`/`stopRecording` (Phase 2) capture mic input via
an `AudioWorkletNode` (`public/worklets/recorder-processor.js`), not
`MediaRecorder` — the worklet posts raw Float32 blocks straight to the main
thread, which concatenates them and encodes a PCM16 WAV
(`wavEncoder.ts`) once recording stops. No lossy codec (Opus/AAC) ever
touches a take before it reaches the DSP chain — this matters specifically
because the whole project's premise is compensating for a cheap source, and
throwing away signal to compression first would work against that.

`getUserMedia` is requested with `echoCancellation`, `noiseSuppression`,
and `autoGainControl` all **off**. Two reasons: (1) the mic is never routed
to the output (see below), so echo cancellation has nothing to cancel; (2)
the whole point of Phase 3+ is that *our* DSP decides how to clean up the
signal, based on analysis — letting the browser's black-box AGC/NS touch it
first would fight that and can't be un-done afterward.

The mic is **never connected to `ctx.destination`** — recording is visual
monitoring only (`getRecordingAnalyser()` feeds a level meter), specifically
because this app assumes phone/earbud recording setups where routing input
back to output risks feedback. `startRecording` also starts playback of the
existing tracks from the same timeline position, so you can record a vocal
over a beat; both use the same `AudioContext.currentTime` reference so
they stay in sync.

The worklet node and its analyser are kept "live" in the graph by
connecting them to a zero-gain `GainNode` -> `destination` (`silentSink`).
This isn't cosmetic: per the Web Audio spec, a node with no path toward
`destination` isn't guaranteed to be pulled for processing at all — leaving
this out means the worklet may simply stop receiving `process()` calls.

Recording always targets whichever track has `armed: true`; arming is
exclusive (`projectStore.armTrack`) and locked while a take is in progress,
because the recorded clip is created for a specific track id when the take
finishes — re-arming mid-take would silently misattribute the clip.

## Effect chain (Phase 3)

Declarative state (`Track.inserts` / `Project.masterInserts`, both
`EffectInstance[]` in `src/types/effects.ts`) describes *what* is inserted,
in what order, with what parameters. `src/audio-engine/effects/EffectChain`
turns that into real nodes — same split as the rest of the engine: state
says what, the engine renders it.

Each effect type (`src/audio-engine/effects/*Effect.ts`) implements one
small interface:

```ts
interface Effect<Params> {
  readonly inputNode: AudioNode;
  readonly outputNode: AudioNode;
  setParams(params: Params): void;
  dispose(): void;
}
```

`EffectChain.setInserts(inserts)` diffs against what it already has:

- A plain parameter tweak (moving a slider) only calls `setParams` on the
  already-connected node — no reconnect, no click.
- Add/remove/reorder/bypass reconnects the chain (`input -> e1 -> e2 -> ...
  -> output`, skipping bypassed entries entirely rather than muting them in
  place). This is rare enough as a user action that a reconnect is fine;
  don't try to avoid it for params, only for structural changes.

Bypass lives entirely in `EffectChain`, not in each effect — a bypassed
effect's nodes are simply left out of the connection sequence. Individual
effects never need to know they can be bypassed.

Built as of Phase 3, all native-node (no AudioWorklet) except the gate:

- **EQ** — a rebuildable chain of `BiquadFilterNode`s, one per band
  (highpass/lowshelf/peaking/highshelf/lowpass).
- **Compressor** — `DynamicsCompressorNode` + a makeup-gain stage.
- **De-Esser** — split-band: `lowpass(freq)` band passes untouched,
  `highpass(freq)` band goes through a fast `DynamicsCompressorNode`, both
  sum back together. No custom DSP, no sidechain routing hacks.
- **Saturation** — `WaveShaperNode` with a curve from
  `effects/curves.ts` (warm/neutral/bright, unit-tested for the
  soft-saturation shape), pre-gain (drive) + dry/wet mix.
- **Limiter** — fast `DynamicsCompressorNode` into a hard-clip
  `WaveShaperNode` (brickwall safety net) into a makeup gain that maps the
  clip ceiling (0 dBFS) down to the configured ceiling — so true peak is
  guaranteed even if the compressor's release lags a transient.
- **Clipper** — standalone hard clip (`WaveShaperNode`, same curve
  generator as the limiter's safety stage), no compression first. A
  distinct tool from the limiter, not a duplicate.
- **Reverb** — `ConvolverNode` fed an **algorithmically generated**
  impulse response (`effects/impulseResponse.ts`: exponentially-decaying
  noise, decorrelated per channel for stereo width, decay exponent varies
  by room/hall/plate). This is a deliberate simplification — no external IR
  files, no real algorithmic reverb (diffusion network, modulation). It's
  honest, dependency-free, and good enough as a first pass; a proper
  algorithmic reverb or recorded IRs would sound better and is a
  reasonable future upgrade.
- **Delay** — `DelayNode` + feedback `GainNode` with a `BiquadFilterNode`
  (lowpass) in the feedback loop for tape-style damping, dry/wet mix.
- **Noise Gate** — the one AudioWorklet-based effect
  (`public/worklets/noise-gate-processor.js`): a real per-sample
  envelope-follower gate (attack/release/hold, single detector on channel 0
  applied identically to all channels so stereo/mono material gates as one
  linked unit — computing the envelope independently per channel was an
  early bug here, worth remembering if this gets extended). This is a
  **gate**, not spectral noise reduction — it attenuates when the signal
  drops below threshold, it does not remove noise sitting under a loud
  signal. True spectral/ML noise reduction (e.g. an RNNoise-style WASM
  model) is deferred to Phase 4, where it thematically belongs anyway.

### Loading the noise-gate worklet without blocking the audio-param UI

`AudioContext.audioWorklet.addModule()` is async, but `EffectChain.setInserts`
is a synchronous public API (matches `AudioEngine.syncTracks`, called on
every relevant store update). When a `noiseGate` insert is requested before
the worklet module has finished loading, `EffectChain` drops in a
`PassthroughEffect` (a bare `GainNode`) as a placeholder so the rest of the
chain still connects correctly, kicks off the load in the background, and
swaps the placeholder for a real `NoiseGateEffect` (re-running `rewire`)
once it resolves. In practice this is a local static file, so the window
where a freshly-added gate is a no-op is on the order of a few
milliseconds — not worth blocking the UI thread over.

### Master bus loudness tap

The Peak/RMS/LUFS-ish readout in the Analyzer panel taps off
`masterAnalyser` through an approximate K-weighting filter pair
(`highshelf` ~1.5kHz +4dB, then `highpass` ~60Hz — a perceptual
approximation, **not** the exact bilinear-transformed ITU-R BS.1770
coefficients) into its own `AnalyserNode`. Like the recording/metronome
taps, this branch needs its own silent path to `destination`
(`loudnessSink`, gain 0) or the pull-based graph simply won't process it —
see the recording section above for why. The resulting number is a
momentary/smoothed reading (exponential smoothing in
`Analyzer.tsx`, not the standard's full 400ms-gated integration), labeled
"LUFS (approx.)" in the UI on purpose — never present it as certified
broadcast-standard loudness. The math (`src/audio-engine/loudness.ts`) is
unit-tested; the filters that feed it are not exact and shouldn't be
presented as such.

## Metronome

Runs on a `setInterval(25ms)` lookahead scheduler (the standard "Chris
Wilson tutorial" pattern: schedule any click due within the next 100ms,
using precise `AudioContext` time for the actual click, not the interval
callback's timing). This is the one place Phase 1 already does lookahead
scheduling — worth reusing that pattern instead of reinventing it when the
clip scheduler eventually needs the same treatment.

## What's deliberately not here yet

- No pitch detection/correction (Phase 5).
- No true spectral/ML noise reduction — only the envelope-follower Noise
  Gate exists (Phase 3); real denoising is Phase 4 (phone mic enhancement).
- No multiband compressor, expander, exciter, chorus/flanger/phaser,
  auto-pan, or stereo-width tool. These were in the original effects list
  as "eventually" — the Phase 3 priority was getting EQ/compressor/
  de-esser/saturation/limiter/clipper/gate/reverb/delay solid first (see
  PROJECT_SPEC.md's priority order: vocal quality first). Add them the same
  way as the existing effects: a new `*Effect.ts` implementing `Effect<T>`,
  a new params type in `types/effects.ts`, a case in `EffectChain`'s
  `createEffectNode` factory.
- No certified LUFS (see "Master bus loudness tap" above) — approximate
  and labeled as such.
- No MIDI/instrument tracks — `Track.type` is `"audio"` only for now; the
  type is already a union-of-one so adding `"midi"` later doesn't require
  restructuring existing tracks.
