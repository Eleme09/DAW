@AGENTS.md

# Al empezar (también después de un /clear)

Este proyecto se trabaja por temas, uno a la vez, copiando BandLab a partir de videos/capturas del usuario. Antes de tocar código:

1. Lee `FASES.md` (en qué tema vamos), `BANDLAB_REFERENCE.md` (qué hace BandLab, con fuentes) y la última sección de `PROGRESS.md` (qué está hecho, qué falta, bugs conocidos).
2. Rama: `claude/personal-ai-daw-s9v97w`. Verificación: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`, `npm run build`, y probar en Chromium (Playwright, `/opt/pw-browsers/chromium`, 390×844).
3. Respuestas al usuario: español, cortas, sin adornos; decir claro lo que no está verificado.
