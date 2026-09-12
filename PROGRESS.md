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

Status: **cumple los criterios de aceptación estipulados**

- [x] Tokens: `globals.css` `:root` now defines named surface/border/text/accent/state tokens (backing values unchanged - same neutral scale - so this didn't require a mechanical rename of every `neutral-900` etc. across 26 files; new/touched code can reference the named tokens).
- [x] Accent color changed app-wide: orange → cyan (`orange-300/400/500` → `cyan-300/400/500`, one `sed` pass across all of `src/components/daw`, then verified with `tsc`/`eslint`/`vitest`) — user explicitly asked this NOT stay orange.
- [x] **TransportBar no longer overflows or scrolls at 360px.** Below `sm`: only Play/Stop/Record + time + a "⋯ More" button are inline (measured `scrollWidth === clientWidth === 360`, no horizontal scroll). Project name, Undo/Redo, BPM, time signature, Loop, Click, Export and Save move into a new `BottomSheet` (`src/components/daw/BottomSheet.tsx` — FASE 1's required "hoja deslizable" base component, tap-backdrop-or-✕ to dismiss, no drag gesture yet). At `sm`+ every control is inline exactly as before (verified at 1024px).
- [x] `paddingTop: env(safe-area-inset-top)` on TransportBar, `paddingBottom: env(safe-area-inset-bottom)` already on the mobile nav and now on BottomSheet.
- [ ] Not done: a full button/slider/knob/context-menu component library. Deliberately deferred — the acceptance criteria is about the *result* (no overflow, thumb-reachable, tokens exist), not a specific implementation, and retrofitting every button in 26 files into shared components now would be a large mechanical refactor with no functional payoff yet. Revisit when a second bottom-sheet/menu use case actually needs the abstraction.
- [ ] 🎤 emoji on "Live Tune" — left as-is, low priority, revisit in a later visual pass.
- [ ] Tabular-numeric enforcement across all numeric readouts — time/BPM already `tabular-nums`; not audited across every dB/Hz readout in the effect panels.

Verified: `tsc --noEmit`, `eslint src`, `vitest run` (256 tests) all clean after every change in this phase. Manually confirmed in-browser at 360px (no scroll, sheet opens/closes) and 1024px (full inline layout unchanged).

## FASE 2–8

Status: **no iniciadas**
