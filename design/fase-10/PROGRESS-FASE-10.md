# FASE 10 — Reconstrucción de interfaz: estado (12/09/2026)

> Este archivo es la fuente de verdad de dónde quedó FASE 10. Léelo antes de
> tocar cualquier componente de `src/components/daw`. Los demás documentos de
> esta carpeta (`fase-10-reconstruccion-interfaz.md`, `REFERENCIAS-VISUALES.md`,
> `estudio-ui.html`, `referencias/`) son el brief original sin editar — este
> archivo es el registro de qué de ese brief ya está hecho y qué no.

FASE 10 reemplaza a FASE 9 (bloqueante, ver `PROMPT_MAESTRO.md` /
`PROGRESS.md` para las fases anteriores 0-9, todas cerradas). El criterio
final de FASE 10 es "comparación lado a lado con `estudio-ui.html` sin
diferencias estructurales" en las seis pantallas de la referencia. **Ese
criterio final todavía no se cumple.** Lo que sigue es el detalle de qué
subfase está en qué estado.

## Regla de desempate

Si algo en `fase-10-reconstruccion-interfaz.md` o `REFERENCIAS-VISUALES.md`
contradice el archivo `estudio-ui.html` (p. ej. el doc menciona tipografía
"Archivo + JetBrains Mono" pero el archivo usa Bricolage Grotesque +
Instrument Sans + DM Mono), **gana el archivo `estudio-ui.html`** — así lo
pide el propio brief ("no es inspiración, es el destino"). Ya se implementó
con la tipografía del archivo, no la del texto del doc.

## 10A — Higiene: COMPLETA

- Bug de overflow horizontal corregido (`min-w-0` faltante en Timeline.tsx).
- 100% de la interfaz traducida al español, incluyendo:
  - Todos los componentes de `src/components/daw` (paneles, botones, tooltips).
  - Nombres por defecto (`Sin título`, `Pista N`, `Instrumento N`).
  - Los 15 efectos (`EFFECT_LABELS`) — de paso se quitó "Auto-Tune" del
    nombre de Pitch Correction (nombre comercial prohibido explícitamente).
  - Los 20 presets de estilo vocal (`vocalStylePresets.ts`).
  - Mensajes generados por el motor (`mixAnalysis.ts`, `mixSuggestions.ts`,
    `vocalAnalysis.ts`) — con los tests actualizados para verificar los
    tokens en español en vez de los ingleses que reemplazan.
  - **El system prompt de la IA** (`app/api/assistant/route.ts`) y
    `describeAssistantAction` (`lib/ai/assistantTools.ts`) — estos no son
    texto de UI estático, son strings generados en runtime que se habían
    escapado del primer barrido. Sin esto, el asistente tendía a responder
    en inglés y el texto de "acciones propuestas" aparecía en inglés.
- Controles duplicados eliminados ("+ Nueva pista" aparecía dos veces).

Pendiente real de 10A: ninguno conocido. Si aparece texto en inglés nuevo,
es una regresión, no trabajo pendiente.

## 10B — Sistema: COMPLETA

- Tipografía: Bricolage Grotesque (`font-display`) + Instrument Sans
  (`font-sans`, default) + DM Mono (`font-mono`) vía `next/font/google` en
  `app/layout.tsx`, mapeadas a utilidades de Tailwind en `app/globals.css`.
  `lang="en"` → `lang="es"`.
- Tokens de color "Cabina" en `globals.css` (`:root`, prefijo `--cabina-*`)
  + utilidades reales de Tailwind (`bg-ink`, `text-bone`, `bg-s1`...`s6`,
  etc.) vía `@theme inline`.
- Paleta de pista: `nextTrackColor` en `types/project.ts` usa los 6 colores
  de señal exactos de la referencia (antes 8 colores saturados genéricos).
- Set de iconos SVG: 13 iconos nuevos en `components/daw/icons.tsx`
  (Play/Pause/Stop/Record, Chevron×3, Arrow×2, Scissors, Duplicate, Close,
  Warning) reemplazando 19 usos de glifos Unicode como icono (✂ ⧉ ✕ ▶ ■ ●
  ◀ ▸ ▾ ↑ ↓ ❚❚ ⚠) — el brief prohíbe explícitamente emojis/glifos sueltos.
- Radios de 2-3px en los componentes base que tenían 8-12px (BottomSheet,
  SegmentedControl, XYPad, fila M/S/Arm/Monitor de TrackHeader).

Pendiente real de 10B: ninguno conocido contra el criterio propio de la
fase ("los seis componentes existen y están usados; ninguna fuente por
defecto"). Los seis componentes base (mando=Knob, fader=Fader,
medidor=MeterBar, hoja=BottomSheet, píldora=Picker, control
segmentado=SegmentedControl) existen y se usan en toda la app.

## 10C — Sesión: PARCIAL — falta el criterio final (barra contextual ya está)

Hecho:
- Color de pista como barra de 3px en el canto de `TrackHeader.tsx` (antes
  un punto) - coincide con `.thead::before` de la referencia.
- Forma de onda de cada clip en el color de señal de su pista (antes
  blanco fijo `rgba(255,255,255,.85)`) - bug real corregido, no solo
  estética.
- Banderín triangular de 8px en la cabeza de reproducción (antes solo una
  línea de 1px), como en Pro Tools.
- **Migración de color completa**: cero clases `neutral-*`/`cyan-*` en
  todo `src/components/daw` (confirmado por grep). Todo el acento
  decorativo (selección, botones ON, tabs activas, playhead, knobs, etc.)
  pasó de cian a hueso. Los únicos colores que quedan en pantalla son:
  - Señal real: color de pista, forma de onda, medidores.
  - Estados funcionales universales de cualquier DAW: mute (rojo), solo
    (amarillo), grabar/armar (`--rec` rojo), monitor activo (`--live`
    verde), severidad de análisis (verde/amarillo/rojo).

- **Barra contextual persistente** (`Timeline/ContextBar.tsx`, nuevo):
  Entrada / Efectos / Afinar / herramienta de corte / auriculares,
  actuando sobre la pista seleccionada (`selectedTrackId`), entre el área
  de pistas y la fila de edición existente (+Nueva pista/Dividir/etc. -
  ver nota de layout abajo). Botones reales de 44px de alto en vez de los
  28px del mock: el propio `estudio-ui.html` es un mock de escritorio no
  optimizado a táctil, y esta app ya tiene una auditoría de FASE 9 que
  exige >=44px en todo control táctil real - se siguió el patrón de
  "hit-area ampliada" ya usado en el resto del proyecto en vez de copiar
  el tamaño de píxel literal del mock donde entra en conflicto con esa
  regla. "Entrada" arma la pista para grabar, "Efectos" abre FX en modo
  pista, "Afinar" agrega Pitch Correction si la pista todavía no lo tiene
  y abre FX, el ícono de tijeras divide el clip en el playhead (mismo
  `splitClipAtPlayhead` que el botón "Dividir" ya existente - la
  referencia también duplica esta acción entre su fila de pista y la
  barra, así que no es una regresión de la regla "un control, un sitio"
  de 10A), el ícono de auriculares alterna `monitorMode` de la pista
  seleccionada (mismo ciclo que el botón de micrófono de `TrackHeader`).
  Dos íconos SVG nuevos añadidos a `icons.tsx` en el mismo estilo que el
  resto (`HeadphonesIcon`, `TuneIcon`), extraídos del glifo `head` del
  archivo de referencia donde aplica.
  **Bug real encontrado y corregido de paso**: al añadir Pitch Correction
  y navegar a FX de inmediato (justo lo que hace el botón "Afinar"),
  `PitchCorrectionPanel` lanzaba `TypeError: node?.getLastInfo is not a
  function` en su loop de animación - mientras el AudioWorklet de
  afinación carga, `EffectChain` conecta un `PassthroughEffect` de
  relleno que no implementa `getLastInfo()`, y el `as PitchCorrectionEffect`
  del panel le mentía a TypeScript sobre el tipo real en ese instante.
  Arreglado con una comprobación de tipo en tiempo de ejecución
  (`typeof node?.getLastInfo === "function"`) en vez de solo el
  optional-chaining que ya había. Este bug existía antes de esta subfase
  (cualquier ruta que agregue Pitch Correction y abra el panel rápido lo
  dispara) - esta subfase solo lo hizo fácil de reproducir y se corrigió
  al encontrarlo, no se dejó pasar.
  **Verificado en navegador** (Chromium headless): los tres botones
  quedan visibles y habilitados solo con una pista seleccionada, "Afinar"
  efectivamente agrega el efecto y muestra el panel de Pitch Correction,
  la barra mide 44px de alto entre el área de pistas y la fila de
  edición, sin errores de consola tras el fix.
- Pendiente real de 10C: el criterio final explícito ("comparación lado a
  lado con la referencia sin diferencias estructurales") **todavía no
  está cumplido** - queda estructura de layout sin tocar (cabecera con
  back+título+nube, regla con code de tiempo, densidad general) que esta
  pasada no abordó (se limitó a la barra contextual, que era el único
  punto explícitamente señalado como "no empezado" en la revisión
  anterior de este archivo).

## 10D — Grabación: COMPLETA

Las 5 subfases del punto 5 del brief, cerradas una por una (ver
`PROGRESS.md`, sección "FASE 10D — Grabación", para el detalle técnico y
la verificación de cada una): monitorización 3 estados y toggles eco/ruido
(ya existían de FASE 9, confirmado por auditoría antes de tocar nada),
comping (ya existía de FASE 5), medidor de entrada con insignia explícita
de saturación, cuenta atrás audible con acento de metrónomo, compensación
de latencia aplicada a la toma grabada, selección de dispositivo de
entrada, aviso heurístico de feedback por altavoz.

Pendiente real: el criterio de cierre completo del brief ("grabar una voz
sobre un beat desde un teléfono... y que quede alineada") no se probó en
un teléfono físico - toda la verificación fue en Chromium de escritorio
con dispositivos de audio simulados. Eso es trabajo de 10I (auditoría en
dispositivo real), no de 10D.

## 10E-10I — NO EMPEZADAS

Del orden de trabajo original del brief (`fase-10-reconstruccion-interfaz.md`
sección 6):
- **10E — Clip y hojas**: hoja contextual estilo BandLab al tocar un clip
  (tap abre acciones/ajustes sin cambiar de pestaña). No empezada.
- **10F — Efectos**: visualización propia para los 14 efectos que no son
  EQ ni Pitch Correction (Compressor, Multiband, Limiter, Clipper, Noise
  Gate, De-Esser, Reverb, Delay, Saturation, Exciter, Chorus, Flanger,
  AutoPan, Stereo Width) según la tabla de referencias del sector del
  punto 3 de `fase-10-reconstruccion-interfaz.md`. Hoy estos usan
  `ParamSlider`/`Knob` genéricos (correcto en color/tipografía tras 10C,
  pero sin la visualización dominante que pide el brief). Rediseño de
  Synth/Sampler también pendiente.
- **10G — Afinación**: los 10 modos del punto 4 del brief (hoy solo existe
  un subconjunto vía `PitchCorrectionPanel` - corrección por escala, dura,
  natural, cambio de tono fijo parcialmente; NO existen corrección
  gráfica, armonizador, doblaje, vocoder/robot, control por notas).
- **10H — Mezcla y nueva pista**: pantallas 3 y 6 de la referencia -
  MixerPanel ya migrado en color pero no auditado contra la estructura
  exacta de la pantalla "Mezcla" (bloque de mezcla automática arriba de
  todo, etc.).
- **10I — Auditoría**: pantalla por pantalla contra la referencia, en un
  teléfono real. No aplicable hasta que 10C-10H estén más avanzadas.

## Cómo seguir

1. Leer este archivo completo antes de tocar nada.
2. Leer `estudio-ui.html` completo (ábrelo con un navegador o leyendo el
   código - las seis pantallas están en el `<script>` al final).
3. Retomar por la barra contextual de 10C (es lo único que falta de esa
   subfase), o saltar directo a 10D si se prefiere seguir el orden del
   brief.
4. Cada subfase se cierra con: valores medidos (no afirmaciones),
   `tsc`/`eslint`/`vitest` limpios, verificación real en navegador
   (screenshot o lectura de la página, no solo "debería andar"), y commit
   + push a esta misma rama (`claude/personal-ai-daw-s9v97w`, que es la
   rama por defecto del repo - no existe `main`).
