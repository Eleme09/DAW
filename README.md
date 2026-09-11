# Personal AI DAW

Personal-use DAW: record vocals on a phone, process them into a clean,
controlled mix with DSP + AI assistance, match them to a beat, master and
export. Not a commercial product. See `PROJECT_SPEC.md` for the full brief.

## Docs

- `PROJECT_SPEC.md` — what this is, priorities, non-goals
- `ARCHITECTURE.md` — stack, directory layout, data flow, Supabase status
- `AUDIO_ENGINE.md` — the real-time audio graph and its extension points
- `AI_FEATURES.md` — planned AI/analysis surfaces and their constraints
- `ROADMAP.md` — phase-by-phase status

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run test      # vitest
npm run build
```

Runs fully local by default — no Supabase project or API keys required.
See `.env.example` and `ARCHITECTURE.md` for the (currently unused)
Supabase integration.
