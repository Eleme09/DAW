# Progress — PROMPT_MAESTRO.md

Tracks phase status against `PROMPT_MAESTRO.md`. Updated at the end of each session.

## FASE 0 — Auditoría e infraestructura

Status: **en curso**

Audit (verified by reading the code, 2026-09-11):

- [x] `ARCHITECTURE.md` exists and documents the stack/directory layout. Does **not** yet cover the patterns/notes/automation data model (none of that exists yet) — will be extended as those land in FASE 4/6.
- [x] Audio clock is already `AudioContext.currentTime`-based (`AudioEngine.ts` `getCurrentTime()`), with `requestAnimationFrame` driving UI polling and `setInterval` used only for metronome lookahead scheduling — this is the standard pattern, not a bug. No rework needed.
- [x] **Undo/redo — implemented.** `src/state/projectStore.ts`: every project-mutating action funnels through a new `setProject()` helper that maintains `past`/`future` snapshot stacks (capped at 200 entries). Continuous edits (fader/knob drag, typing a name, BPM) coalesce into a single undo step within a 400ms window instead of one step per tick; discrete actions (add/remove track or clip, add/remove/reorder effect, mute/solo/arm toggles) always get their own step. `loadProject`/`newProject` reset history. `undo()`/`redo()` re-sync the live audio graph (`syncTracks`/`syncMasterInserts`) after jumping. Wired to Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y in `DawShell.tsx`, and to Undo/Redo icon buttons in `TransportBar.tsx` (disabled when there's nothing to undo/redo). Covered by 7 new tests in `projectStore.test.ts` (discrete undo/redo, redo-cleared-by-new-action, coalescing, non-coalescing across discrete actions, history-clear-on-new-project) — full suite (256 tests) and typecheck/lint pass.
- [x] **Persistence — migrated to IndexedDB with autosave.** New `src/lib/storage/db.ts` is the single shared IndexedDB connection (`personal-daw`, bumped to v2) with three object stores: `samples` (unchanged), `projects` (new), `sampleAssets` (new). `src/lib/storage/projectStore.ts` and `sampleIndex.ts` now read/write IndexedDB instead of `localStorage`, each with a one-time, idempotent migration of any pre-existing `localStorage` data so upgrading doesn't strand a user's saved projects/samples. All call sites across `BrowserPanel.tsx` (Samples + Projects tabs), `VocalBeatMatchPanel.tsx`, `BeatAnalyzerPanel.tsx`, `BeatGeneratorPanel.tsx`, `PitchStudioPanel.tsx`, `DenoisePanel.tsx` and `state/projectStore.ts` updated for the now-async API. Autosave: the store subscribes to `project` changes and writes to IndexedDB 1.2s after the last edit (debounced), plus a `beforeunload` best-effort flush. New `recoverLastProject()`/`openProjectById()` store actions — the app now **automatically reopens the most recently saved project on load** (previously it always started blank even though "Save Project" worked, which meant "recovery after unexpected close" didn't actually happen). Verified manually in-browser: add track → wait for debounced autosave → confirm the write in IndexedDB directly → reload the page → track is back, undo history correctly reset, Projects tab lists it. Full suite (256 tests) + typecheck + lint clean throughout.

FASE 0 is now functionally complete against its stated scope (ARCHITECTURE.md exists, audio clock was already correct, undo/redo done, persistence migrated). Not yet re-verified against the phase's own acceptance checklist as a final gate — see below.

## FASE 1 — Sistema de diseño y shell móvil

Status: **parcial, hecho fuera de orden antes de tener este documento**

What already landed (previous session, before PROMPT_MAESTRO.md was shared):
- Icon set (`src/components/daw/icons.tsx`) and icon+label headers across every tab/panel.
- Mobile bottom-tab shell (Browser/Timeline/Mixer/FX) in `DawShell.tsx`.
- Timeline/Mixer empty states, ruler tick hierarchy, tooltips on previously-unlabeled controls.

Does **not** yet meet FASE 1's acceptance bar:
- [ ] TransportBar still overflows past 375px and was made horizontally *scrollable* (`overflow-x-auto`) rather than redesigned to fit — the master prompt explicitly forbids horizontal scroll for primary transport/save controls.
- [ ] No formal design-token system (colors are still ad-hoc Tailwind classes like `neutral-950`/`orange-500`, not named surface/text/semantic tokens).
- [ ] No shared base components (button/slider/knob/bottom-sheet/context-menu).
- [ ] 🎤 emoji still used on "Live Tune" instead of a vector icon.
- [ ] No tabular-numeric enforcement across all numeric readouts (time/BPM/dB/Hz).

This phase needs to be revisited properly once FASE 0 is closed.

## FASE 2–8

Status: **no iniciadas**
