# Architecture

## Stack

- **Next.js 16 (App Router)** + React 19 + TypeScript, `create-next-app` defaults
  (Turbopack, Tailwind v4, ESLint 9 flat config). Node 22.
- **Zustand** for client state (`src/state/`). No Redux, no Context-based
  global state — one small store is enough for a single-project app.
- **Web Audio API** directly — no Tone.js/howler/etc. A DAW needs precise
  control over scheduling, gain staging, and the node graph; a wrapper
  library would fight us more than help. See `AUDIO_ENGINE.md`.
- **Supabase** (`@supabase/supabase-js`) for future metadata persistence.
  Scaffolded, not wired up — see the Supabase section below.
- **Vitest** for unit tests of pure logic (dB math, waveform peaks, project
  model defaults). No component/DOM testing yet — not worth the setup cost
  until there's non-trivial component logic to protect.

Next.js 16 here is genuinely new (its own docs warn "this is NOT the
Next.js you know" relative to older training data) — when in doubt about an
API, check `node_modules/next/dist/docs/` rather than assuming.

## Why the DAW page is client-only

`src/app/page.tsx` loads `DawShell` via `next/dynamic({ ssr: false })`. The
entire app depends on Web Audio, IndexedDB, and localStorage, none of which
exist on the server. Server-rendering any of it just produces a hydration
mismatch the moment a returning user already has local data (which is every
session after the first). Don't try to make DawShell SSR-safe — keep the
`ssr: false` boundary and put decisions that depend on browser-only APIs
behind `useEffect`/`useState(() => ...)` inside that boundary, not above it.

## Directory layout

```
src/
  audio-engine/     Real-time audio graph + transport (see AUDIO_ENGINE.md).
                     No React, no Next.js imports here — must stay usable
                     from a Worker or a test file with zero DOM.
                     wavEncoder.ts has no AudioContext dependency either —
                     it's pure Float32 -> WAV Blob, testable in Node.
public/worklets/    AudioWorkletProcessor scripts. Loaded by URL
                     (ctx.audioWorklet.addModule), so they must stay plain
                     JS served as static files, not bundled TS.
  types/project.ts   Shared data model: Project / Track / AudioClip / etc.
                      Every other layer (state, storage, UI, future AI) reads
                      and writes this shape. Extend it here first.
  state/             Zustand store. Bridges UI <-> audio-engine. Owns the
                     in-memory Project and mirrors transport state
                     (currentTime, isPlaying) from the engine's clock.
  lib/storage/       Local-first persistence.
                       - projectStore.ts: project JSON in localStorage.
                       - sampleStore.ts: raw audio Blobs in IndexedDB.
                       - sampleIndex.ts: lightweight metadata list mirroring
                         sampleStore, in localStorage (so the browser panel
                         doesn't have to open IndexedDB to list samples).
  lib/audio/         Glue between storage and the engine
                     (sampleLoader.ts: decode-on-demand + rehydrate after
                     reload, since the engine's buffer cache is in-memory
                     only).
  lib/supabase/      Supabase client factory. Returns null if env vars are
                     unset — the app must keep working local-only.
  components/daw/    UI. TransportBar, BrowserPanel, Timeline/*, Mixer/*.
  hooks/             Small reusable hooks (useRafLoop for meters/clocks).
app/                 Next.js App Router shell (layout, page, globals.css).
supabase/migrations/ SQL schema, NOT applied to any live project (see below).
```

## Data flow

```
User action (click, drag, file picker)
   -> Zustand action (src/state/projectStore.ts)
       -> updates `project` (immutable)
       -> calls into AudioEngine for anything audible (syncTracks, play, seek)
   -> React re-renders from the new store state
   -> AudioEngine's own rAF clock pushes currentTime back into the store
      via `onTimeUpdate`, independent of the action that triggered playback
```

The engine is the single source of truth for *when audio actually plays*;
the store is the single source of truth for *what the project contains*.
Neither owns both — that split is what keeps playback timing accurate
without funneling every audio callback through React.

## Local-first persistence, by design

Everything works with zero backend: projects in `localStorage`, audio blobs
in `IndexedDB`. This was a deliberate Phase 1 choice, not a placeholder:

- It matches the actual usage pattern (one person, one device most of the
  time).
- It means the DAW is never blocked on network/auth to record and edit.
- It gives Supabase sync a clean, optional layer to add later instead of
  being load-bearing from day one.

## Supabase

A Supabase project already exists on this account
(`menajeiner@gmail.com's Project`, plus unrelated `venta-webs*` projects for
a different app) but **none of them were wired into this app**. Connecting
this DAW to any existing project is a decision for the user to make
explicitly — don't assume "a Supabase project exists" means "use it."

What's prepared:

- `supabase/migrations/0001_init.sql` — schema for `projects`, `tracks`,
  `samples`, `clips`, `presets`, with RLS policies scoped to `auth.uid()`.
  **Not applied anywhere.** Audio bytes are explicitly kept out of Postgres
  (`samples.storage_path` points at Supabase Storage, not a `bytea` column).
- `src/lib/supabase/client.ts` — reads `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` from env, returns `null` if unset.
- `.env.example` — the two vars above, both empty.

To actually turn this on: provision (or pick) a Supabase project dedicated
to this app, run the migration, set the env vars, and replace the
`lib/storage/*` calls with Supabase-backed equivalents behind the same
function signatures (or add a sync layer — either is reasonable, pick when
you get there).

## Known limitations (intentional, not bugs)

- No zoom control on the timeline (fixed 80px/second).
- Single-track recording only — one armed track at a time, matching a
  solo-vocalist workflow. Multi-track simultaneous recording (e.g. a live
  band take) isn't a goal right now.
- The transport scheduler schedules all clips at `play()`/`seek()` time; it
  does not reschedule if you add/move a clip mid-playback on a different
  track's future region. Fine for Phase 1's edit-then-play workflow; a
  proper lookahead scheduler is worth adding once live editing during
  playback matters.
