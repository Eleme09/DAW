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

## Offline analysis (Phase 4)

`src/audio-engine/analysis/` — this is the other half of the real-time/
offline split described above: it runs once on a full `AudioBuffer`
(never during playback), and never touches the live node graph directly.
It hands back plain numbers/categorical results; `autoChain.ts` turns
those into an `EffectInstance[]` the UI applies through the normal
`setEffectChain` store action — same path as manually adding effects, not
a separate mechanism.

- **`fft.ts`** — a from-scratch iterative radix-2 FFT. Not the Web Audio
  `AnalyserNode`: that's a live, single-frame, engine-attached tool built
  for metering (see Analyzer above); this needs to run offline over an
  entire buffer with proper windowing and frame-averaging, on a signal
  that was never connected to an `AudioContext` in the first place (e.g.
  a sample the user hasn't added to a track yet). Pure math, unit-tested
  against known sine-wave bin positions.
- **`spectralAnalysis.ts`** — Hann-windowed, 50%-overlap frame averaging
  into 8 named bands (subBass/bass/lowMid/mid/highMid/presence/sibilance/
  air). Reports each band **relative to the recording's own average bin
  power**, not an absolute dB threshold — that's what makes "Mud: High"
  mean the same thing whether the source recording is quiet or loud.
- **`dynamicsAnalysis.ts`** — peak/RMS (reusing `loudness.ts`'s math),
  clipping ratio (samples at/above ~0dBFS), and a noise-floor estimate
  from the bottom ~10th percentile of 50ms-windowed RMS values. That
  noise-floor estimate assumes the recording has real quiet moments
  (breaths, gaps between phrases) — a take with no pauses at all reads its
  own signal level as "noise floor," since there's nothing quieter to
  find. Documented, not hidden.
- **`vocalAnalysis.ts`** — turns the above into the categorical read the
  UI shows (Noise/Low-end/Mud/Harshness/Sibilance: Low/Medium/High,
  Dynamics: Controlled/Uncontrolled). Severity thresholds are heuristic —
  calibrated by ear, not trained on a labeled dataset — and it's explicit
  about it in the file's own header comment. No pitch/pitch-stability
  field here on purpose: pitch analysis belongs to Phase 5, not
  duplicated into this result.
- **`autoChain.ts`** — the "Phone Mic Enhance" rule table: analysis ->
  concrete `EffectInstance[]` using Phase 3's real effect types, in a
  fixed signal-flow order (gate -> EQ -> de-esser -> compressor ->
  limiter), each stage included only if its corresponding problem was
  actually flagged. Deterministic and inspectable on purpose — see
  AI_FEATURES.md principle 3 (AI proposes, DSP executes) and principle 5
  (this is exactly the kind of thing that should be rules, not a model,
  until rules stop being good enough).

Clipping gets special handling everywhere in this pipeline: when
`clippedSampleRatio` is non-trivial, `vocalAnalysis.ts` adds a message to
`limitations` explaining that the audio at those points is gone and
nothing here can recover it — and the chain that message produces does
**not** try to compensate with extra processing. Reporting a limitation
honestly beats quietly doing something that can't actually help (see
PROJECT_SPEC.md's hard constraint on this project).

## Pitch detection & correction (Phase 5)

`src/audio-engine/pitch/` and `src/types/pitch.ts`.

**Architecture decision, stated up front:** this is an offline **render**,
not a real-time effect-chain insert. Unlike Phase 3's effects (live,
non-destructive, reversible from the Effects Rack), pitch correction here
needs the whole take's pitch track before it can compute a sensible
correction curve — retune-speed glide and humanize both reason across
time, and the resynthesis isn't a per-block streaming operation. "Apply
Pitch Correction" in the UI reads the source sample, runs the full
pipeline below, and writes a **new** sample + clip — the original
recording is never overwritten. Real-time pitch correction (monitor
live while singing) would need a fundamentally different approach — a
streaming pitch tracker plus an `AudioWorklet`-based shifter with bounded
look-ahead — and is explicitly not attempted here; see AI_FEATURES.md's
open question on this for whoever picks it up.

Pipeline, in order:

1. **`pitchDetection.ts`** — YIN (de Cheveigné & Kawahara): difference
   function → cumulative mean normalized difference → absolute-threshold
   local minimum → parabolic interpolation for sub-sample precision. Chosen
   over naive autocorrelation specifically because YIN is designed to avoid
   octave errors, which matter a lot once the result feeds *correction* (an
   octave-wrong snap target isn't just imprecise, it's an obviously broken
   note). `trackPitch` frame-hops this across a buffer into a `PitchFrame[]`
   (time, frequency-or-null, confidence).
2. **`noteUtils.ts`** — frequency⇄MIDI conversion, scale interval tables
   (major/naturalMinor/chromatic), nearest-in-scale-note search.
3. **`keyDetection.ts`** — Krumhansl-Kessler key-finding: a
   confidence-weighted chroma histogram from the pitch track, correlated
   against the standard major/minor key profiles rotated to each of the 12
   possible tonics. An established MIR technique, not invented for this
   project — and still a statistical best guess, hence the `confidence` on
   `DetectedKeyResult` rather than presenting it as certain.
4. **`correctionCurve.ts`** — detected pitch → target pitch, per frame.
   `retuneSpeedMs` is the time constant of an exponential glide toward the
   snapped note (0 = instant hard-tune snap; this **is** what "retune
   speed" audibly means — the classic slow-Auto-Tune swoop is the glide
   itself, not a side effect, so the glide starts from the *sung* pitch,
   not from the target — getting this backwards was an actual bug caught
   by the unit tests during development, worth remembering if this file
   gets touched again). `humanizeAmount` layers a slow, smoothed random
   walk (not white noise — that would sound like jitter, not natural
   variation) on top. Unvoiced frames reset the glide so a new phrase
   doesn't inherit a stale target from the previous one.
5. **`psola.ts`** — TD-PSOLA-lite resynthesis. Two independent pitch-mark
   sequences (standard PSOLA): analysis marks track the input's own
   detected period; synthesis marks span the *same total duration* using
   the target period, and each borrows its grain from the nearest analysis
   mark **in time** (not matching mark index) — that decoupling is what
   keeps duration independent of pitch shift. Grains are Hann-windowed,
   overlap-added, and the accumulated window weight is used to normalize
   output level (prevents overlap-add gain pumping).
   **Explicit simplification:** no formant preservation — grains aren't
   separated from a spectral envelope, so larger shifts can sound
   thinner/more artificial than a commercial pitch corrector. For this
   project that's an acceptable trade: small corrective shifts (tightening
   an otherwise in-tune take) sound fine, and an artificial character on
   large/instant shifts is the actual aesthetic "Hard Tune"/"Modern Trap"
   modes want, not a flaw to hide. Proper formant-preserving PSOLA is a
   real future improvement, documented here rather than silently missing.
6. **`applyPitchCorrection.ts`** — ties the above together
   (`analyzePitch` for detection+key, `correctPitchChannel`/
   `correctPitchBuffer` for the full correct-and-resynthesize pass, run
   independently per channel).

Every piece from YIN through PSOLA is unit-tested against synthetic tones
with known frequencies/keys — including an end-to-end test that runs the
whole pipeline on a detuned tone and confirms the output, re-analyzed,
actually lands near the target pitch. That's a meaningfully stronger bar
than "it doesn't throw."

## Beat analysis (Phase 6)

`src/audio-engine/beat/` and `src/types/beat.ts`. Same offline,
no-AudioContext, unit-tested-in-Node pattern as `analysis/` and `pitch/` —
`analyzeBeat(channelData, sampleRate)` runs once on a full buffer and
returns `BeatAnalysisResult`. Reuses Phase 4/5 infrastructure directly
rather than reimplementing it: the FFT from `analysis/fft.ts`, and
`pitch/keyDetection.ts`'s `detectKeyFromChroma` (built for a monophonic
vocal pitch track in Phase 5, it turns out to be exactly the right function
for a polyphonic chromagram too — the chroma-vector-in, key-out contract
doesn't care how the chroma was built).

- **`onsetDetection.ts`** — spectral-flux onset detection (Dixon
  2006-style): half-wave-rectified frame-to-frame magnitude difference,
  peak-picked against a local adaptive threshold. Feeds tempo, section
  boundaries, and drum-hit classification.
- **`tempoDetection.ts`** — BPM via autocorrelation of the onset envelope
  (a "tempogram"), not inter-onset-interval histogramming — more robust
  since it doesn't depend on every onset being peak-picked correctly.
  **Known limitation, hit and partially fixed during development**: naive
  autocorrelation scores a tempo's octave (half/double time) almost as
  strongly as the "true" tempo, and a kick-snare backbeat where the kick
  hits harder than the snare made a synthesized 120 BPM test beat read as
  60 — the amplitude alternation makes the 2-beat cycle the strongest raw
  periodicity, not a bug, just where the energy actually repeats most
  strongly. A soft Gaussian prior centered on a typical tempo (120 BPM,
  wide sigma) now nudges the pick toward the more common octave when raw
  scores are close (see the regression test in `tempoDetection.test.ts`
  that reproduces the exact failure). This does **not** fully solve
  half/double-time ambiguity — it's a genuinely hard, actively-researched
  MIR problem (full solutions track downbeats/meter, not just onset
  periodicity) — it's a partial mitigation, and the reported `confidence`
  reflects the raw correlation strength at whatever lag was picked, not
  certainty about which tempo octave a human would call "the" tempo.
- **`chromagram.ts`** — full-spectrum chroma extraction: every FFT bin's
  energy folds into one of 12 pitch classes regardless of octave, unlike
  `pitch/pitchDetection.ts`'s single-dominant-pitch-per-frame approach
  (which only works for monophonic material). This is what makes key
  detection work on a full beat instead of just a solo vocal line.
- **`bassTracking.ts`** — lowpass-isolate the low end
  (`filters.ts`'s RBJ-cookbook biquad, offline/pure-math, not a
  BiquadFilterNode), then run the same YIN tracker Phase 5 built for
  vocals, tuned to bass range (30-260Hz) with a coarser hop than vocal
  tracking (YIN's difference-function cost scales with buffer length, and
  a beat can run minutes where a vocal take runs seconds — see the hop
  comment in the file). Monophonic pitch tracking on a filtered signal,
  not source separation: a loud kick/808-sub will still dominate and can
  pull the tracked note off the actual bassline in busy sections.
- **`chordDetection.ts`** — chroma template matching (24 templates: major/
  minor triads on each of 12 roots), cosine-similarity scored, per
  fixed-length (not beat-synced) segment, no smoothing across segments.
  **Known limitation, observed on a real test beat**: relative major/minor
  pairs (e.g. F major vs. D minor — they share 2 of 3 notes) are easy to
  confuse this way; a synthesized F-major segment came back as Dm during
  testing. Each segment carries a `confidence`, and the docs/UI call this
  "estimated" rather than implying professional-grade chord recognition —
  that's a real gap, not smoothed over.
- **`drumClassification.ts`** — onset → kick/snare/hihat-ish, from
  spectral shape alone (low-band energy ratio, high-band energy ratio,
  spectral centroid). An explainable heuristic, not a trained
  drum-transcription model — real transcription (especially separating
  layered/sampled kits) needs ML to do well. Good enough to sketch a rough
  pattern for visualization, explicitly not good enough to trust as a
  transcription (the UI says so next to the hit count).
- **`sectionDetection.ts`** — energy-novelty boundary detection: finds
  *when* the loudness profile changes abruptly and how loud the new part
  is *relative to this track*. It cannot know, from energy alone, whether
  that's a verse, chorus, drop, or bridge — `energyLevel` is a relative-
  loudness read, not a semantic label, and is presented as exactly that.

**Explicitly not attempted, on purpose:**
- **Melody extraction** from the full polyphonic mix. Bass tracking works
  because lowpass filtering cleanly isolates that register; there's no
  equivalent trick for a lead melody buried in a full mix — that needs
  real source separation, a substantially harder problem.
- **Instrument recognition.** Needs a trained classifier; a hand-written
  heuristic (like the drum classifier gets away with, for 3 broad
  categories) doesn't generalize to "what instrument is this."
Both are real gaps against the original brief's wishlist, named here
rather than faked with a heuristic that would mostly be wrong.

## Offline bounce / project export

`src/audio-engine/bounce.ts` — renders a whole `Project` (every track's
clips, volume/pan/mute/solo, insert chain, plus the master insert chain) to
a single stereo `AudioBuffer` via `OfflineAudioContext`, instead of only
ever being audible live. Built because the original brief's mobile workflow
("Mix -> Master -> Export") had no actual export path until now — a real
gap, not deferred on purpose like the items above.

This is why `Effect.ts` and every `*Effect.ts`/`EffectChain.ts` are typed
against `BaseAudioContext` rather than `AudioContext`: `AudioContext` and
`OfflineAudioContext` are siblings under `BaseAudioContext` in the Web
Audio spec, and every node-creation call the effects use
(`createGain`, `createBiquadFilter`, `createDynamicsCompressor`,
`createWaveShaper`, `createConvolver`, `createDelay`, `createStereoPanner`,
`audioWorklet.addModule`) lives on that shared base — so the exact same
effect classes run unmodified inside either context. `bounceProject`
rebuilds the same graph shape `AudioEngine.syncTracks`/`ensureContext` use
(`input -> EffectChain -> volume -> pan -> muteGain -> master -> EffectChain
-> destination`), just against a throwaway offline context instead of the
live one, so a bounce always matches what was actually heard — there's no
separate "export renderer" to drift out of sync with playback.

A few deliberate differences from the live engine, all because a bounce is
a one-shot render from t=0 rather than a resumable transport:

- **Clip scheduling is simpler.** The live engine's `scheduleClip` has to
  handle starting mid-clip (playback beginning after a clip's start) and
  translate between timeline time and `AudioContext.currentTime` at an
  arbitrary play position. A bounce always starts at project time 0 with
  the offline context's clock also at 0, so `source.start(clip.startTime,
  clip.sourceOffset, clip.duration)` needs no such translation.
- **The noise-gate worklet loads eagerly, not lazily.** The live
  `EffectChain` drops in a `PassthroughEffect` placeholder while
  `audioWorklet.addModule()` resolves in the background, specifically so a
  synchronous `setInserts()` call never blocks the UI thread (see "Loading
  the noise-gate worklet" above). A bounce has no such constraint — it's
  already an async, user-triggered one-shot operation — so
  `bounceProject` just `await`s `ctx.audioWorklet.addModule()` once up
  front (only if some insert actually uses the gate) and passes an
  `EffectChainDeps` that always reports the worklet as already loaded.
  Reusing the live engine's lazy-placeholder path here would just add a
  race for no benefit.
- **Muted/non-soloed tracks are skipped entirely** rather than wired in at
  zero gain — same audible result, no wasted render work on audio nobody
  will hear.
- **A fixed 3-second tail is appended** past the last clip's end
  (`TAIL_PADDING_SEC`) so reverb/delay decay isn't truncated. This is a
  flat constant, not computed from the actual longest decay time in the
  chain — long enough for this project's own reverb/delay ranges, not a
  general solution for an arbitrarily long tail.
- **`AudioBuffer`s are reused across contexts.** `getBuffer` (passed in by
  the caller) resolves each clip's `sampleId` against whatever's already
  decoded in `AudioEngine`'s buffer cache — an `AudioBuffer` isn't bound to
  the context that decoded it, so buffers decoded against the live
  `AudioContext` play back fine inside the throwaway `OfflineAudioContext`
  with no re-decode needed.

`src/lib/audio/exportProject.ts` is the thin browser-facing wrapper: makes
sure every sample the project references is actually decoded
(`hydrateProjectSamples`, same helper used when reopening a saved
project), calls `bounceProject`, encodes the result with the existing
`wavEncoder.ts` (so recordings and exports share one WAV writer), and
triggers a download via an `<a download>` click — no new persistence
layer, no server round-trip. Wired to the **Export** button in
`TransportBar`, disabled while nothing's on the timeline or a take is
recording.

This same offline-rendering infrastructure (not just the WAV-writing part)
is what the planned Mix Assistant (Phase 10) is meant to build on: it needs
to analyze the actual summed mix, not per-track buffers in isolation, and
`bounceProject` is exactly that summed signal, available before it ever
reaches an output device.

## AI Mix Assistant (Phase 10)

`src/audio-engine/analysis/mixAnalysis.ts`, `mixDiagnostics.ts`,
`mixSuggestions.ts`, and `src/types/mixAnalysis.ts`. Session-wide
diagnostics — masking, mud/harshness/sibilance/low-end on the actual
summed mix, and gain-staging — plus suggested (never auto-applied)
corrections, built directly on top of the offline bounce infrastructure
above. Same split as everywhere else in this codebase: the
OfflineAudioContext-dependent rendering lives in one thin file
(`mixAnalysis.ts`, not unit-tested, verified via Playwright — same reason
as `bounce.ts`), and the actual detection/suggestion logic is pure,
synchronous, and unit-tested against synthetic per-track profiles
(`mixDiagnostics.test.ts`, `mixSuggestions.test.ts`) rather than real
rendered audio.

**Full-mix read**: literally reuses Phase 4's `analyzeVocalChannel` on the
mono-mixed output of `bounceProject(project, ...)` — "extend Phase 4's
single-track analysis pattern to session-wide," not a new detection
paradigm, per ROADMAP.md's own note on this. Explicit caveat carried into
`limitations`: those severity thresholds were calibrated by ear on solo
vocal recordings, not multi-instrument mixes — treated as a rough read on
the summed signal, not a mix-specific standard.

**Per-track profiles**: `mixAnalysis.ts` renders each track *in isolation*
(a throwaway copy of the project with only that track soloed, bounced
through `bounceProject` again) to measure what that track actually
contributes — its own RMS and a spectral-band-share profile (each
`VOCAL_BANDS` band's power as a fraction of that track's own total power,
not a relative-dB read like `spectralAnalysis.ts`'s `computeBandEnergies`,
because band **shares** are what's directly comparable across tracks
regardless of how loud each one is). Explicit cost tradeoff, stated
up front rather than found the hard way: this means one full bounce per
track plus one for the whole mix (N+1 offline renders), so run time scales
with track count and project length — fine for this project's own track
counts, not a design that would scale to a large multitrack session
without changing the approach (e.g. analyzing pre-mix buffers directly
instead of re-rendering each one).

**Masking detection** (`mixDiagnostics.ts`): flags track pairs that both
concentrate a significant share of their own energy in the same
`VOCAL_BANDS` band (share ≥ 0.16, vs. a flat 1/8 ≈ 0.125 baseline across 8
bands) — a plain, explainable heuristic for "these two are competing for
the same sonic space," not a psychoacoustic masking model (no simultaneous
masking threshold curves, no critical-band analysis). A broad,
already-balanced source naturally keeps its per-band shares low and won't
trigger this; two narrow, similarly-voiced sources (two vocal doubles, or
a vocal and a bass-heavy 808 both loud in the same band) will — which is
exactly the case a mixer actually needs flagged.

**Gain-staging detection**: flags tracks whose rendered RMS sits ≥6dB from
the session's median track RMS. A simple, explainable proxy for "this
needs a fader move," not a loudness-matching or auto-gain algorithm.
Silent/fully-muted tracks are excluded from both the median and the
findings.

**Suggestions** (`mixSuggestions.ts`), consistent with AI_FEATURES.md
principle 3 (AI proposes, DSP executes) and this phase's own "suggested,
not auto-applied" scope from ROADMAP.md: each masking finding produces
*two* independent single-band peaking-EQ-cut suggestions (-3dB, Q 1.4, at
the contested band's log-center frequency), one per track in the pair —
deliberately not picking a "winner," since which track should yield is a
musical decision this can't make. Each gain-staging finding produces one
volume-trim suggestion sized to bring that track to the session median.
Applying either goes through the exact same store actions manual edits
use (`setEffectChain` appends the suggested EQ instance to that track's
existing chain; `updateTrack` adjusts `volumeDb`) — no separate
apply-suggestion code path to drift out of sync with the Effects Rack.

**UI**: a new "Mix" tab in the Browser panel (`MixAssistantPanel.tsx`) —
"Analyze Mix" hydrates every sample the project references, runs the
above, and shows the full-mix read, masking/gain-staging findings, and
suggestion buttons (each becomes "Applied" once clicked, never re-appliable
twice by accident). Verified in-browser with three synthetic tracks (two
tones concentrated at the same ~1kHz "mid" band, one quiet bass-band tone)
via Playwright: masking correctly flagged between the two mid-band tracks,
gain staging correctly flagged the quiet track as ~24dB below the median,
both suggestion types applied correctly (a live-verified single-band EQ
cut landed in the target track's Effects Rack; the gain trim moved that
track's fader), and playback stayed glitch-free afterward with zero
console errors.

**Explicitly not attempted**: no true psychoacoustic masking model, no
automatic (non-suggested) correction, no cross-track sidechain-style
dynamic masking reduction, no mastering-stage LUFS targeting (that's
Phase 13). Named here rather than implied by the feature's name.

## Beat Generator (Phase 11)

`src/audio-engine/generate/` and `src/types/beatGen.ts`. Generates a
drum/bass/chords/melody sketch from BPM/key/scale/genre/mood inputs, as
four new tracks the user can mix, replace, or build on — the brief's
"Beat Generator" feature. First phase in this project that creates new
content rather than analyzing or correcting existing audio, and the
scope was kept deliberately honest about that: this is a rule-based
sketch generator, not a music-generation model, and every instrument is a
simple synthesized placeholder, not a sample library.

Same split as everywhere else in this codebase: `progressions.ts`,
`drumPatterns.ts`, `bassGenerator.ts`, `melodyGenerator.ts`,
`beatGenerator.ts`, and `rng.ts` are pure, synchronous, and fully
unit-tested (deterministic — same inputs always produce the same
`GeneratedBeat`, checked directly in tests, not just "doesn't throw").
`synthesizeBeat.ts` is the one OfflineAudioContext-dependent file (like
`bounce.ts` and `mixAnalysis.ts`), not unit-tested, verified via
Playwright instead.

**Chord progressions** (`progressions.ts`): a small, hand-picked library
of common progressions per scale (major/natural minor), stored as
scale-degree index sequences (e.g. `[0, 5, 2, 6]` = i-VI-III-VII) rather
than hardcoded note names — the same progression transposes to any key
for free. Triad quality (major/minor/diminished/augmented) is *derived*
from the scale's own interval structure by stacking thirds at degrees
`d, d+2, d+4` and classifying the resulting intervals, not hardcoded per
degree — that's genuinely how diatonic harmony works, and it's what makes
the vii° triad in a major scale come out diminished without a special
case for it (see `progressions.test.ts`).

**Drum patterns** (`drumPatterns.ts`): one base 16-step (16th-note),
one-bar pattern per genre (trap/boomBap/dance/halfTime), each a real,
idiomatic skeleton for that genre (four-on-the-floor kicks with no snare
for `dance`; a half-time snare-on-beat-3 for `halfTime`; trap's
syncopated kick + dense hihats + open-hat accent). Trap additionally gets
probabilistic hihat rolls (mood-dependent probability, from a seeded PRNG
— `rng.ts`, mulberry32 — so "regenerate with the same seed" is a real,
checkable guarantee, not just approximately similar) — trap-specific
because hihat rolls are genuinely a trap convention, not generalized to
every genre for the sake of code reuse.

**Bassline** (`bassGenerator.ts`): deliberately tied to the drum pattern
rather than independently melodic — a bass note fires on every kick
within a chord's span (two octaves below the chord root), sustained until
the next kick or the chord's end. This is a real, common technique
("808 follows the kick"), not a simplification standing in for a proper
bassline generator.

**Melody** (`melodyGenerator.ts`): an up-down arpeggio over each chord's
own tones (root-third-fifth-third) at a fixed 8th-note subdivision, one
octave above the chords. Explicitly documented as a simplification, not a
melody generator with phrasing/motif/contour — arpeggiated leads are
genuinely idiomatic for this project's genre focus, which is why this
was chosen over a more ambitious (and much harder to get right honestly)
contour-aware melody model for a first pass.

**Synthesis** (`synthesizeBeat.ts`): four independent `OfflineAudioContext`
renders (drums/bass/chords/melody), each its own stereo `AudioBuffer` —
kick (pitch-swept sine), snare (bandpass noise burst + triangle tone),
hihat/open-hat (highpass-filtered noise, seeded per Phase 10/generator
convention), bass (sawtooth through a lowpass filter with an ADSR-ish
envelope), chords (three detuned sawtooth voices per triad, slow
attack/release for a pad), melody (triangle oscillator, short plucky
decay). None of this claims to be production-quality sound design — it's
a rule-based sketch, and the UI says so.

**Track creation**: each synthesized stem is encoded to WAV (reusing
`wavEncoder.ts`), stored through the same `putSample`/`addSampleAsset`/
`decodeAndCache` pipeline recorded takes use, and added as a new track +
clip via the normal store actions — no special-cased "generated track"
concept. That means a generated stem is fully editable afterward: insert
effects, trim, re-arrange, re-export, exactly like anything else in the
DAW.

**UI**: a new "Generate" tab in the Browser panel
(`BeatGeneratorPanel.tsx`) — Key/Scale/Genre/Mood/Seed controls (BPM
comes from the project, not set independently, so a generated beat always
matches the project's own tempo), a Generate button that creates the 4
tracks. Verified in-browser via Playwright: generated a beat, confirmed 4
non-silent waveforms appeared with correct names, played back cleanly
with live meters on all 4 tracks plus master, and successfully exported
the resulting project through the existing Export pipeline (Phase
"Project Export" above) — reuses that infrastructure with zero special
casing.

**Explicitly not attempted**: no true generative/ML model (rule-based by
design — see AI_FEATURES.md principle 3 and the project's
no-mandatory-paid-API stance), no melody with real phrasing/contour, no
manual editing of generated note events before rendering to audio (the
result is audio, immediately — the underlying `GeneratedBeat` note data
isn't exposed for editing, only the rendered clips), no genres beyond the
four listed, no time signatures other than 4/4 (every pattern/progression
assumes it).

## Beat Reconstruction (Phase 12)

`src/audio-engine/generate/reconstructBeat.ts`. The inverse of Phase 11:
instead of generating a fresh rule-based sketch, this maps Phase 6's
*detected* `BeatAnalysisResult` (from an uploaded beat) into the exact
same `DrumHitEvent`/`BassNoteEvent`/`ChordEvent` shapes Phase 11 defined,
so the identical synthesis code (`synthesizeBeat.ts`'s `synthDrums`/
`synthBass`/`synthChords`, now exported for this reuse) renders it —
`synthesizeReconstruction()` is a thin 3-stem wrapper around the same
`renderStem`/`OfflineAudioContext` machinery, no melody stem (see below
for why). Pure mapping logic, fully unit-tested with synthetic
`BeatAnalysisResult` fragments; the synthesis half is the usual
OfflineAudioContext-dependent exception, verified via Playwright.

**Drum hits** map almost directly — `DrumHit.confidence` becomes the
synthesized hit's velocity (floored at 0.3, never fully silent), so a
hit the detector was unsure about plays back quieter rather than
presenting uncertain detections as equally confident ones. Hits typed
`"other"` (Phase 6's drum classifier only distinguishes kick/snare/hihat
confidently — see AUDIO_ENGINE.md "Beat analysis") are dropped rather
than guessed into one of the three real types.

**Bass line** needed real new logic, not just a field rename: Phase 6's
`bassLine` is a continuous per-frame pitch track (one entry per analysis
hop, `null` where unvoiced), not discrete notes. `reconstructBassEvents`
groups consecutive frames holding roughly the same pitch (within 0.7
semitones) into one held note, ending a note on a gap longer than 150ms
(a brief tracking dropout doesn't end it) — the same "voiced run" idea
Phase 5's pitch pipeline uses for vocals, applied here to a bass line
instead.

**Chords** map directly: `ChordSegment` already carries `root` (pitch
class) and `quality` (major/minor — Phase 6's chord matcher only ever
produces those two), so `reconstructChordEvents` just stacks a triad at a
fixed octave and converts `startSec`/`endSec` to beats via the *detected*
tempo.

**No melody reconstruction** — not an oversight, a direct consequence of
Phase 6 never attempting melody extraction from a full polyphonic mix
(needs real source separation, a substantially harder problem this
project doesn't attempt; see "Beat analysis" above). Reconstruction can
only ever be as good as what was actually detected, and melody was never
detected, so it's not reconstructed either — the UI says so.

**UI**: a "Reconstruct as Tracks" button added to the existing Beat
Analyzer panel, next to the analysis it already displays — no separate
upload/analyze step, since the `BeatAnalysisResult` it needs is already
computed for the panel above it. Creates 3 new tracks (Drums/Bass/Chords)
through the same sample-storage pipeline Phase 11 and recorded takes use.
Verified in-browser: analyzed a synthesized test beat, reconstructed it,
confirmed 3 non-silent tracks with waveforms reflecting the actual
detected hit/note/chord counts, played back cleanly with live meters,
zero console errors.

## Mastering Assistant (Phase 13, part 1)

`src/audio-engine/masteringTargets.ts` + `bs1770.ts`'s
`computeIntegratedLufs` + `beat/filters.ts`'s new `highpassFilter`/
`highShelfFilter`. Per-platform LUFS targets (Spotify/Apple Music/
YouTube/SoundCloud/TikTok — published streaming-normalization figures,
not derived from this project's own measurements, and documented as
"not a guarantee of exact platform behavior" since platforms change these
over time) compared against the actual bounced mix's integrated
loudness, with a suggested master-gain trim to close the gap.

**Upgraded from approximate to true gated-integrated (post-13a)**: the
original Phase 13a build compared against `loudness.ts`'s
`approxLufsFromMix` (a 2-stage K-weighting approximation reusing the live
meter's filter chain, for consistency between the live readout and the
offline reading). That approximation is still what the live Analyzer
meter uses — it has to update continuously without buffering the whole
signal, which a gated measurement structurally can't do — but the Mix
Assistant's full-mix reading now calls `bs1770.ts`'s
`computeIntegratedLufs` instead: the actual ITU-R BS.1770-4 algorithm
(exact published 48kHz K-weighting coefficients, 400ms/100ms-hop gated
block integration with the standard's absolute -70 LUFS and relative
-10 LU gates), not a simplified filter shortcut. See `bs1770.ts`'s own
header comment for the honest limit on this: the coefficients and gating
structure are high-confidence and standard, but this has not been
checked against ITU/EBU's own conformance test vectors, so treat it as
trustworthy for comparing levels rather than a guaranteed bit-exact match
to a certified meter. The live meter's "LUFS (approx.)" label and the Mix
Assistant's "Integrated LUFS" label are now deliberately different
strings — they are two different measurements, not the same one shown
twice.

**Applying a suggestion doesn't invent a new effect type**: the suggested
gain lands as a compressor inserted into `masterInserts` with `ratio: 1`
and `thresholdDb: 0` — at a 1:1 ratio no compression ever actually
happens regardless of threshold, so this is purely a makeup-gain stage,
reusing the existing Compressor effect instead of adding a dedicated
"Gain" effect type for one narrow use. Verified in-browser: applying a
+2.6dB Apple Music suggestion added exactly that — Compressor, ratio
1.0:1, threshold 0dB, makeup +2.6dB — visible and further editable in the
master Effects Rack like any other insert.

**Where this lives in the UI**: folded into the existing Mix Assistant
panel (Phase 10) rather than a separate tab — it's naturally the same
"look at the whole mix" workflow, and it reuses that panel's already-
bounced full mix (`MixAnalysisResult.mix.integratedLufs`) instead of
triggering a second render.

## AI Music Assistant (Phase 13, part 2)

`src/app/api/assistant/route.ts` (server-only), `src/lib/ai/` (provider
interface, tool schema/parser, action-application logic), `src/types/
assistant.ts`. The one feature in this project that genuinely needs a
real LLM call rather than local rule-based DSP — built after asking the
user directly (per AI_FEATURES.md's original open question on this),
who chose to connect a real provider (Anthropic) behind their own API
key rather than leaving it unbuilt.

**The vocabulary is fixed, not open-ended.** `AssistantAction`
(`types/assistant.ts`) is a closed discriminated union — volume/pan/
mute/solo, plus add-an-EQ-band and set-compressor/reverb/delay/
saturation. The model cannot express an arbitrary mutation: it can only
call one of nine tools (`lib/ai/assistantTools.ts`'s `ASSISTANT_TOOLS`),
and every tool call is re-validated field-by-field by `parseToolUse`
before it becomes an `AssistantAction` — a malformed or out-of-schema
call (wrong type, unknown enum value, missing field) is silently
dropped, never passed through as-is. This is the same instinct as every
other "untrusted input" boundary in this project, just applied to model
output instead of a file/analysis result.

**"AI proposes, DSP executes," literally**: nothing the model returns
touches the project directly. The server route only *parses* tool calls
into `AssistantProposedAction`s and returns them; the client shows each
one (with a human-readable description built server-side by
`describeAssistantAction`, from the validated action's own fields — not
trusted free text from the model) with its own Apply button.
`lib/ai/applyAssistantAction.ts`'s `applyEffectAction` (pure,
unit-tested) computes the resulting insert chain for effect-shaping
actions; track-field actions (volume/pan/mute/solo) apply directly via
the existing `updateTrack` store action. Repeated commands update the
existing effect of that type in place rather than stacking duplicates
(EQ is the one exception — `addEqBand` always appends a band, since
EQ shaping is additive by nature, the same way a producer keeps
sculpting one EQ rather than inserting a fresh one per tweak).

**API key stays server-only.** `ANTHROPIC_API_KEY` is read exclusively
in `src/app/api/assistant/route.ts` (a Next.js Route Handler, never
sent to the browser). If it's unset, the route returns
`{ configured: false }` immediately — no network call, no error — and
the UI shows a plain "not configured" state rather than failing
unclearly, per AI_FEATURES.md principle 1 (AI must be optional, the DAW
works with zero AI configured). The model itself
(`ANTHROPIC_ASSISTANT_MODEL`, defaulting to a current Claude model) is
also an env override, not hardcoded — see `.env.example`.

**Provider interface, not a hardcoded vendor**: the UI panel only talks
to `AssistantProvider` (`lib/ai/assistantProvider.ts`), an interface
with one method (`sendCommand`). The concrete implementation
(`httpAssistantProvider`) just calls this app's own `/api/assistant`
route — no Anthropic-specific type or request shape crosses that
boundary into the UI. Swapping providers later means writing a new
server route (or branching this one) and pointing the interface at it,
not touching the panel or the action-application logic.

**Honestly-scoped verification, stated plainly**: no Anthropic API key
was available in this environment, so the actual model round-trip
(real command in, real tool calls out) was **not** exercised end to
end — that's a real gap in verification, not hidden. What *was*
verified: the request/response shapes were checked directly against the
installed `@anthropic-ai/sdk`'s own type definitions (`Tool`,
`ToolUseBlock`, `TextBlock`); `parseToolUse`/`describeAssistantAction`/
`applyEffectAction` are unit-tested (valid input, malformed input,
missing fields, out-of-enum values, in-place-update vs. append-a-band
behavior); and the "not configured" degrade path was verified live in a
real browser (Playwright) with zero console errors, including the route
itself confirmed via a direct request to return `{"configured":false}`
when the key is unset. Whoever adds a real key should do one live
end-to-end pass (a command that should map to a tool call, one that
shouldn't) before trusting this in daily use.

## Real-time pitch monitor

`public/worklets/realtime-pitch-processor.js` + `AudioEngine.
enableLivePitchMonitor`/`disableLivePitchMonitor`/
`updateLivePitchMonitorSettings` + `LivePitchMonitorPanel.tsx` (the "🎤
Live Tune" bar under the transport). Lets you hear your own voice
corrected toward the nearest scale note **while singing**, not just
after recording — a genuinely different feature from Pitch Studio's
offline "record, then correct" pipeline (still the right choice for a
polished final take; this is for finding the note in the moment).

**Deliberate, narrow exception to a standing rule.** Every other part of
this engine never connects the raw mic to `ctx.destination` (see
"Recording" above) specifically to avoid feedback. This feature does,
because hearing yourself is the entire point — it is strictly opt-in (the
"🎤 Live Tune" button, off by default) and the UI carries a persistent,
unmissable warning to use headphones. Recording itself is untouched: it
still always captures the dry mic signal, never the monitor's corrected
output — this is purely what you hear while singing, not what gets
written to a track.

**Why this is a from-scratch reimplementation, not a reuse of Phase 5.**
The offline pipeline (`pitchDetection.ts` → `correctionCurve.ts` →
`psola.ts`) needs the whole take up front — PSOLA's synthesis marks are
built from the *entire* correction curve, including samples that haven't
been sung yet. A live monitor fundamentally can't have that. The worklet
reimplements the same three stages causally, deliberately kept in
sync with the offline math where the algorithm allows:

1. **YIN pitch detection**, same algorithm and default threshold/range as
   `pitchDetection.ts`'s `detectPitchYin` (translated to plain JS — like
   every worklet in this project, it's a dependency-free static file, no
   import of the TS modules), re-run every 512-sample hop (~11.6ms) on a
   2048-sample rolling window.
2. **A streaming version of `correctionCurve.ts`'s glide+humanize
   logic** — same formulas (exponential glide toward the snapped note,
   smoothed random-walk humanize), restructured as a per-hop state
   update instead of a whole-array pass, so retune speed/humanize *sound*
   the same live as they do in the offline render.
3. **A causal delay-line pitch shifter** — genuinely new DSP, not
   adapted from `psola.ts` (PSOLA's pitch-synchronous grain marks aren't
   causal). See the worklet file's own header comment for the full
   design and, importantly, **a real bug caught during verification,
   worth remembering**: the first version used a fixed-rate two-voice
   grain crossfade that reset each voice's read position to a
   `writePos`-relative anchor every cycle — that discards the very pitch
   drift it's supposed to accumulate, netting *zero* correction overall
   despite the detection/glide math being completely correct. It went
   undetected until a Playwright test rendered a known 427Hz tone through
   the worklet via `OfflineAudioContext` and measured the output
   frequency hadn't moved from 427Hz at all. The fix: a single
   continuously-drifting delay (`delay += 1 - pitchRatio` every sample —
   that unbroken drift *is* the shift), only ever rebased via a brief
   crossfade to a second tap when the drift would otherwise run past the
   delay buffer's bounds (every several hundred ms to a few seconds for
   realistic correction amounts, not every cycle). Verified afterward
   with a battery of `OfflineAudioContext` renders: a sustained upward
   correction stayed locked within ~1 cent of the target across 4 seconds
   and multiple rebase cycles, a downward correction (sharp input)
   snapped correctly, the slower "natural" glide mode converged within
   its expected time constant, bypass passed audio through unchanged,
   and a 6-second render showed no NaNs or runaway amplitude.

**Config is an AudioParam, not a port message — this also bit once.**
`key`/`scaleIndex`/`retuneSpeedMs`/`humanizeAmount`/`bypassed` are all
k-rate `AudioParam`s, not values sent via `port.postMessage`. A port
message is a genuine async round-trip; for a one-shot
`OfflineAudioContext` render in particular, rendering can finish before
the message is even delivered, so the worklet would silently run with
its default instead of the value actually requested. This was caught the
same way as the drift bug: a verification render requested `scale:
"major"`, the worklet used its default `"naturalMinor"` instead (missed
message), and the output snapped to a note outside the requested scale.
`scaleIndex` (0/1/2 for major/naturalMinor/chromatic) went through the
same `AudioParam` path as the others once this was understood — a value
set via `.value =` on the main thread is guaranteed in effect from the
very first render quantum, with no such race.

**Real, honest limitations, not hidden:**
- Total latency is roughly 30-50ms (mostly the 2048-sample analysis
  window) — usable for "hear yourself land on pitch while singing," not
  inaudible. Real hardware/software vocal processors have comparable
  latency; this isn't unusual, but it's not zero either.
- Occasional brief crossfade artifact at a delay rebase — not
  synced to the signal's own period (unlike PSOLA), so it can land
  anywhere in the waveform's cycle. Infrequent for realistic correction
  amounts, not imperceptible.
- No formant preservation, same as the offline PSOLA — larger
  corrections can sound thinner.
- Pitch ratio is clamped to roughly 0.7x-1.4x (about ±6 semitones) —
  intentional: this project's corrections are meant to nudge toward a
  nearby scale tone, not perform arbitrary pitch transposition, and the
  clamp also keeps the delay-drift math working within the buffer's safe
  bounds.

## Additional effects (post-launch)

Six effect types from the original "eventually" list (see Phase 3's
priority notes), built after the 13-phase roadmap + real-time pitch
monitor were done: `src/audio-engine/effects/MultibandCompressorEffect.ts`,
`ChorusEffect.ts`, `FlangerEffect.ts`, `ExciterEffect.ts`,
`AutoPanEffect.ts`, `StereoWidthEffect.ts`. Same pattern as every other
effect — implements `Effect<Params>`, registered in `EffectChain`'s
`createEffectNode` factory, params type in `types/effects.ts`, editor UI
in `EffectParamsEditor.tsx` — no changes needed anywhere else, since the
Effects Rack UI is fully generic over `EFFECT_LABELS`/`EffectType`.

- **Multiband Compressor** (`MultibandCompressorEffect.ts`): 3-band
  parallel split via standard 2nd-order (12dB/oct) highpass/lowpass
  `BiquadFilterNode`s, not a phase-corrected Linkwitz-Riley crossover —
  a known simplification (some band overlap/coloration right at the
  crossover points), documented in `types/effects.ts`'s doc comment
  rather than hidden. Each band gets its own `DynamicsCompressorNode` +
  makeup gain; the three sum back together (multiple `AudioNode`
  connections into one `GainNode` *is* the sum). Attack/release are
  shared across bands, threshold/ratio/makeup are per-band.
- **Chorus** / **Flanger** (`ChorusEffect.ts`/`FlangerEffect.ts`):
  modulated `DelayNode`s — an `OscillatorNode` LFO drives `delayTime`
  directly (an `AudioParam` connection adds the LFO's output on top of
  the node's static `.value`, standard Web Audio modulation routing).
  Chorus uses a longer base delay (~20ms) with no feedback (simple
  doubling/thickening); Flanger uses a much shorter base delay (~3ms)
  with a feedback loop (the resonant comb-filter sweep that's actually
  "flanging," vs. chorus's plain thickening). Both start their LFO
  oscillator once at construction and run it for the node's lifetime,
  the same pattern `AutoPanEffect` uses.
- **Exciter** (`ExciterEffect.ts`): highpass-isolates the top end,
  drives it through the *same* saturation curve `SaturationEffect`
  already uses (`curves.ts`'s `makeSaturationCurve("bright")`, reused
  rather than inventing a second waveshaping curve), and blends the
  result back on top of the untouched dry signal — additive, not a
  dry/wet crossfade, matching how a real hardware/plugin exciter
  actually behaves (it adds harmonic "air," it doesn't replace the
  source).
- **Auto-Pan** (`AutoPanEffect.ts`): an LFO drives a `StereoPannerNode`'s
  `pan` param directly — `depth` scales the LFO output before it reaches
  `pan`, so depth=1 sweeps hard-left to hard-right and depth=0 sits
  silently at center (by design, not a bug).
- **Stereo Width** (`StereoWidthEffect.ts`): mid-side processing built
  from a `ChannelSplitterNode`/`ChannelMergerNode` plus plain `GainNode`
  arithmetic (Web Audio sums multiple connections into one node — that's
  the "+"; a negative gain is the "-"): `mid = 0.5(L+R)`,
  `side = 0.5(L-R)`, scaled by `width` and recombined as
  `mid ± width*side`. Only audibly does anything on genuinely stereo
  material (panned tracks summed on the master, or a stereo import) — a
  single dead-center mono source has no side signal to widen, which is
  correct behavior for mono input, not a bug.

**Verified via Playwright** (not unit-tested — these are pure
`AudioNode`-graph wiring, same "AudioContext-dependent code isn't unit
tested" split as every other effect in this file): added all 6 to both a
track and the master bus, tweaked params, toggled bypass, played back —
zero console errors. Beyond that baseline, each effect's actual DSP
correctness was checked numerically against exported WAV output (the
same rigor used for the pitch worklet and BS.1770, since these are
custom-wired node graphs, not simple node wrappers, and carry the same
"looks right but silently does nothing" risk class):
- Stereo Width: L-R difference RMS measured 0.000 at width=0 (exact mono
  collapse), and scaled linearly with `width` (0.252 at width=1, 0.504 at
  width=2) — confirms the mid-side sign/scaling math is exactly right,
  not just "roughly stereo-ish."
- Auto-Pan: per-window L/R balance measured swinging from -0.86 to +0.65
  over a 2-second render at 4Hz/100% depth — confirms the panner is
  actually oscillating, not stuck at a static value.
- Chorus/Flanger/Exciter: each effect's active-vs-bypassed export
  differs by a real margin (not near-zero, which is exactly the class of
  "wired but the wet path never reaches output" bug the real-time pitch
  worklet's zero-net-shift bug turned out to be), with sane non-clipping
  peak levels and no NaN/Infinity in the rendered output.
- Multiband Compressor: pushing the low band's threshold/ratio hard on a
  tone routed into that band measurably dropped the exported RMS vs. a
  neutral setting — confirms the crossover actually routes signal into
  the right band's compressor, not just passing everything through
  unprocessed.

## What's deliberately not here yet

- No manual note editing (dragging individual detected notes) — the pitch
  track is visualized (Pitch Studio's canvas) but not yet interactively
  editable. A real feature to add later, not implied by what exists today.
- Real-time/live pitch correction now exists (see "Real-time pitch
  monitor" above) — a separate, causal reimplementation from the offline
  pipeline below, not a replacement for it.
- No formant preservation in PSOLA — see `psola.ts` above.
- No true spectral/ML noise reduction. What exists instead: the
  envelope-follower Noise Gate (Phase 3, silences gaps between phrases)
  and a gate-tuned auto-chain (Phase 4's `autoChain.ts`). Neither removes
  noise sitting *underneath* a loud signal — that needs actual spectral
  subtraction or a trained model (e.g. an RNNoise-style WASM module),
  still not built. `vocalAnalysis.ts` says so explicitly when a
  recording's noise floor is high, instead of implying the gate fixes it.
- Multiband compressor, chorus, flanger, exciter, auto-pan, and stereo
  width now exist (see "Additional effects" below) — built after the
  original Phase 3 priority list (vocal quality first) was done. No
  expander or phaser yet — genuinely not built, not implied by anything
  above.
- The live Analyzer meter's "LUFS (approx.)" (see "Master bus loudness
  tap" above) stays a fast approximation, by necessity — it can't buffer
  the whole signal. The Mix Assistant's "Integrated LUFS" now uses the
  real BS.1770-4 gated algorithm (`bs1770.ts`) instead, but is still not
  conformance-tested against official ITU/EBU reference vectors — see
  "Mastering Assistant" above.
- No MIDI/instrument tracks — `Track.type` is `"audio"` only for now; the
  type is already a union-of-one so adding `"midi"` later doesn't require
  restructuring existing tracks.
- No melody extraction from a full beat mix, no instrument recognition —
  see "Beat analysis" above for why these specifically weren't attempted.
- No fully-solved tempo octave ambiguity or beat/downbeat tracking, no
  chord-sequence smoothing across segments — see "Beat analysis" above;
  both are partial/heuristic by design, not silently broken.
