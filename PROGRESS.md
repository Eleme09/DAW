# Progress — PROMPT_MAESTRO.md

Tracks phase status against `PROMPT_MAESTRO.md`. Updated at the end of each session.

## FASE 0 — Auditoría e infraestructura

Status: **en curso**

Audit (verified by reading the code, 2026-09-11):

- [x] `ARCHITECTURE.md` exists and documents the stack/directory layout. Does **not** yet cover the patterns/notes/automation data model (none of that exists yet) — will be extended as those land in FASE 4/6.
- [x] Audio clock is already `AudioContext.currentTime`-based (`AudioEngine.ts` `getCurrentTime()`), with `requestAnimationFrame` driving UI polling and `setInterval` used only for metronome lookahead scheduling — this is the standard pattern, not a bug. No rework needed.
- [ ] Undo/redo: **does not exist anywhere in the codebase** (confirmed by grep across `src/state` and `src/lib` — zero matches). Blocking per the master prompt.
- [ ] Persistence: audio sample **blobs** already use IndexedDB (`src/lib/storage/sampleStore.ts`). Project **state** (tracks/clips/effects/settings) is JSON in `localStorage` (`src/lib/storage/projectStore.ts`) — needs migration to IndexedDB with autosave.

Next in this phase: implement the global undo/redo command stack, then migrate project-state persistence to IndexedDB with autosave.

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
