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

## FASE 2 — Timeline de nivel profesional

Status: **subset de mayor valor implementado; ítems de mayor riesgo diferidos (ver abajo)**

- [x] Regla en compases y tiempos: `src/lib/timing/grid.ts` (BPM+time-signature -> beat/bar seconds, 9 tests) reemplaza los ticks de segundos del `Ruler` por números de compás; el largo del compás se muestra explícito.
- [x] Snap a rejilla configurable (Off, 1/4, 1/8, 1/16, 1/32, 1/8t, 1/16t) — selector en la barra inferior del Timeline, aplicado a mover/recortar clips en `ClipView.tsx`.
- [x] Clip gain: ya se aplicaba en el audio engine (`AudioEngine.ts`) pero no existía UI — agregada una línea horizontal arrastrable (-24..+12 dB) sobre cada clip.
- [x] Fade in/out con manija: también ya aplicado en el motor; agregadas manijas triangulares en las esquinas superiores con overlay visual del triángulo de fade.
- [x] Región de loop visible y editable: nuevo `LoopRegion.tsx`, arrastra el cuerpo para mover ambos extremos juntos o cada borde por separado.
- [x] Duplicar clip: nueva acción `duplicateClipAtPlayhead` (store), botón "⧉ Duplicate" + atajo `D`.
- [x] Formas de onda en Canvas con caché de picos — ya existía (`Waveform.tsx` + `computePeaks`), sin cambios.

Deliberadamente diferido (no a medias — no se empezó por el riesgo/costo real):
- [ ] Zoom con pinch e scroll inercial — necesita gestos táctiles reales para probar bien; `PIXELS_PER_SECOND` sigue fijo en 80.
- [ ] Virtualización del renderizado — no urgente con la cantidad de pistas actual (todas las pistas/clips son DOM plano hoy); revisar si el conteo de pistas crece.
- [ ] Crossfade entre clips adyacentes (distinto de fade in/out de un solo clip - requiere detectar solapamiento entre dos clips).
- [ ] Marcadores nombrados arbitrarios (más allá de la región de loop).

Verificado: `tsc`/`eslint`/`vitest` (265 tests, +9 nuevos) limpios. En navegador: generado un beat real (4 pistas con audio real vía Beat Generator), confirmado bar-length en la regla, arrastre de gain simulado con PointerEvent (0dB -> 10dB), undo revierte correctamente a 0dB, loop region con título/rango correcto, sin errores de consola.

## FASE 3 — Mixer completo

Status: **subset de mayor valor implementado; sends/buses diferidos (ver abajo)**

- [x] Fader de recorrido largo, táctil: nuevo `Mixer/Fader.tsx` — todo el control (no solo la manija fina) es el área de arrastre, con delta de arrastre desacoplado del alto visual (mismo patrón que la línea de gain de `ClipView.tsx`) para precisión real en una tira angosta; doble-click/doble-tap resetea a 0dB.
- [x] Pan por canal (ya existía en `TrackHeader.tsx`, faltaba en el Mixer — agregado).
- [x] Mute/Solo/Arm por canal en el Mixer (el Arm ahora usa la acción `armTrack` del store, que ya garantizaba exclusividad — el Mixer no debía reimplementar esa regla con un `updateTrack` suelto).
- [x] Acceso directo a la cadena de inserts: botón "FX" por canal y en Master — selecciona el track (o modo Master) y salta a la pestaña Effects en móvil (`effectsRackMode` y `mobileView` se subieron al store para que el Mixer pueda pilotar la navegación, antes eran estado local de `EffectsRackPanel`/`DawShell`).
- [x] Rename inline por canal en el Mixer (ya existía en el Timeline; de paso se corrigió que renombrar generaba un undo-step por cada tecla — ahora coalesce como BPM/pan).
- [x] Reordenar canales con ◀/▶ (nueva acción `moveTrack`) — reordena el array `tracks` y reasigna `order`; el Timeline refleja el mismo orden porque comparte el campo.
- [x] Master fader real: nuevo `Project.masterVolumeDb` + `GainNode` dedicado en `AudioEngine` (`setMasterVolume`), insertado después de la cadena de inserts de Master y antes del analyser — mismo lugar que un fader maestro en Pro Tools/FL. Proyectos guardados antes de este campo cargan con 0dB por defecto (`loadProject` normaliza).
- [x] Metering peak+RMS con hold y clip: `MeterBar.tsx` reescrito — RMS coloreado (verde/ámbar/rojo) en escala de dB (no lineal), línea de peak-hold con decaimiento (~12dB/s), LED de clip que se enciende a ~-0.18dBFS y queda enclavado hasta que se hace click para resetearlo. Es el mismo componente que ya usaban `TrackHeader` y el medidor de grabación en vivo, así que ambos heredan la mejora sin duplicar código.
- [x] Bug de layout corregido de paso: en móvil, la pestaña "Mixer" quedaba comprimida en la barra compacta de escritorio (192px) mientras el área de arriba —vacía— seguía reclamando su espacio `flex-1`. Ahora el Mixer es una vista a pantalla completa como Browser/Timeline/FX cuando es la pestaña activa en móvil, y solo el dock compacto de escritorio usa la altura fija.

Deliberadamente diferido (arquitectura nueva, no a medias):
- [ ] Sends (2 auxiliares por canal) y buses/grupos — requiere un subsistema de ruteo nuevo (entidad `Bus`, nodos de retorno en `AudioEngine`, UI de asignación) que no existe hoy en ningún lado del código. Implementarlo parcialmente arriesgaría bugs de grafo de audio no verificables sin más tiempo dedicado; se deja para una sesión propia.
- [ ] Salida asignable por canal (enviar a un bus en vez de a Master) — depende directamente del punto anterior.

Verificado: `tsc`/`eslint`/`vitest` (265 tests) limpios. En navegador, con el beat real de 4 pistas: arrastre de fader con clamping -60..+6dB, doble-click reset, undo revierte el fader, pan/mute/solo/arm funcionando (arm respeta exclusividad), reorder ◀/▶ reordena y el Timeline lo refleja, botón FX de canal y de Master saltan correctamente a Effects (seleccionando el track o el modo Master) tanto en escritorio como saltando de pestaña en móvil, fader de Master atenúa el bus completo sin afectar los medidores individuales de cada canal, medidores muestran RMS variando en tiempo real, peak-hold sostenido y LED de clip encendiéndose con señal real (el beat generado sí satura picos) y apagándose al click. A 375px de ancho: el Mixer ahora ocupa toda la altura disponible (antes ~192px con una franja vacía arriba), sin overflow horizontal de página.

## FASE 4 — Creación musical

Status: **primer slice funcional (synth+sampler, patrones, piano roll por tap); pendientes reales anotados abajo**

- [x] Track de instrumento: nuevo `Track.type: "audio" | "instrument"`. Deliberadamente **no** se fusionó `midiClips` dentro de `clips` — quedó como array propio (`Track.midiClips`) para que los 8+ consumidores existentes que asumen `clips: AudioClip[]` (exportar, bounce, mix analysis, los paneles de IA) sigan funcionando sin tocarlos ni tener que filtrar por tipo.
- [x] Instrumento por track: `Instrument = SynthInstrument | SamplerInstrument`, con ADSR compartido. Sintetizador (oscilador + envolvente) y Sampler (sample existente de la librería, re-pitchado por `playbackRate = 2^((nota-raíz)/12)`) implementados en `AudioEngine.playVoice` — se conectan al mismo punto (`graph.input`) que un `AudioClip`, así que atraviesan la cadena de inserts/volumen/pan/mute/medidor del track exactamente igual (todo lo de FASE 3 les aplica gratis).
- [x] Patrones: botón "+ Add Instrument" (crea el track) y "+ Add Pattern" (agrega un `MidiClip` de 1 compás en el playhead del track de instrumento seleccionado y abre el piano roll). El bloque en el Timeline (`MidiClipView.tsx`) se mueve/recorta como un clip de audio y muestra una miniatura de las notas.
- [x] Piano roll: `PianoRoll/PianoRoll.tsx`, abierto como bottom-sheet (reutiliza `BottomSheet`) — grid de tap-para-alternar-nota (como un step sequencer), con preview de audio inmediato al tocar una celda (`AudioEngine.previewNote`), y botones +/− para extender el patrón por compás.
- [x] Panel de instrumento: `EffectsRack/InstrumentSettings.tsx`, agregado arriba de la cadena de inserts cuando el track seleccionado es de instrumento — cambia Synth/Sampler, forma de onda, sample+nota raíz, y los 4 sliders ADSR (reutilizan `ParamSlider`, ya coalescen igual que los demás parámetros de efectos).
- [x] Proyectos guardados antes de este modelo cargan con `type:"audio"`/`midiClips:[]`/`instrument:null` por defecto (mismo patrón que la normalización de `masterVolumeDb` en FASE 3).

Verificado: `tsc`/`eslint`/`vitest` (273 tests, +8 nuevos) limpios. En navegador: creado un track de instrumento, agregado un patrón de 1 compás, programada una melodía tocando celdas (C4-E4-G4-C5), toggle on/off confirmado, cerrado y el bloque en el Timeline muestra la miniatura de notas correctamente tanto en escritorio como a 375px (sin overflow horizontal, la barra de herramientas ahora hace wrap a dos filas). Reproducción real: el medidor del track de instrumento muestra señal real tanto en modo Synth (sawtooth) como después de asignarle un sample existente en modo Sampler y tocarlo pitcheado — confirma que ambos caminos de síntesis llegan al bus del track. Sin errores de consola en ningún paso.

Deliberadamente diferido (para no dejarlo a medias):
- [ ] Arrastrar/redimensionar notas individuales en el piano roll — hoy solo tap para agregar/quitar (duración fija = un paso de grid). Mover una nota existente requiere borrarla y volver a tocarla.
- [ ] Step sequencer dedicado (grid de baterías con velocity por celda) — el piano roll actual puede programar percusión asignando un sample por pitch, pero no tiene la vista compacta tipo FL Studio.
- [ ] Patrones reutilizables de verdad (bloque compartido tipo FL Studio, donde editar una instancia actualiza todas) — hoy cada patrón es independiente; "Duplicate" ya existente para audio no se extendió a `MidiClip`, así que copiar un patrón hoy es solo posible recreándolo o vía código, no desde la UI.
- [ ] Split/Duplicate-at-playhead (los atajos S/D existentes) no se extendieron a `MidiClip` — por ahora solo operan sobre clips de audio.
- [ ] Un limitador de voces/polifonía — cada nota agenda su propio oscilador/buffer sin límite; una progresión muy densa en muchos tracks de instrumento simultáneos podría acumular nodos. No es un problema con el uso típico de este proyecto, pero no hay un techo explícito.

## FASE 5 — Grabación y voz

Status: **comping y Live Tune real ya cumplidos; vocal chain presets ya existían de una sesión anterior**

Auditoría antes de tocar nada: "vocal chain presets" y "Live Tune real" ya estaban sustancialmente hechos de trabajo previo a esta sesión (no se re-hicieron, solo se verificaron y se cerró el único pendiente que quedaba abierto):
- [x] **Vocal chain presets** — ya existía: `VocalEngineerPanel.tsx` analiza la toma y aplica una cadena de efectos real de un tap ("Make Vocal Professional") con presets por carácter (Clean/Natural/Bright...) y por género. Verificado que sigue funcionando, sin cambios.
- [x] **Live Tune real** — ya existía: corrección de tono en vivo genuina vía `realtime-pitch-processor.js` (no un placeholder), con selector de tonalidad/escala, 4 modos (natural/hardTune/modernTrap/extreme) y lectura Sung→Target en vivo. Lo único pendiente de FASE 1 era el emoji 🎤 explícitamente señalado en el prompt maestro ("elimina el emoji 🎤 de Live Tune") — **corregido**: reemplazado por un `MicIcon` propio del set de iconos (`icons.tsx`), consistente con el resto de la barra de transporte.
- [x] **Comping** (lo único genuinamente faltante) — implementado a nivel de toma completa (no a nivel de fragmento, ver diferido abajo): grabar/agregar un clip que se superpone en tiempo con uno existente en el mismo track ya no apila audio simultáneo silenciosamente — `addClip` en el store detecta el solapamiento, agrupa ambos clips con un `takeGroupId` compartido, y silencia (`muted: true`, campo nuevo en `AudioClip`) todas las tomas salvo la más reciente. `AudioEngine.scheduleClip` omite clips silenciados; `TrackLane` no renderiza las tomas inactivas (siguen en los datos, no se pierden). El bloque de la toma activa muestra un selector "Take N/M" para volver a cualquier toma anterior (`selectTake`, nueva acción). Borrar la toma activa promueve automáticamente la toma remanente más reciente en vez de dejar la región muda.

Verificado: `tsc`/`eslint`/`vitest` (278 tests, +5 nuevos de comping) limpios. En navegador: emoji reemplazado por el ícono confirmado visualmente, resto de la app sin regresiones ni errores de consola. La lógica de comping (la parte con riesgo real) se verificó con 5 tests unitarios directos sobre el store — grabar/agregar dos tomas solapadas agrupa y silencia correctamente, clips que no se solapan no se agrupan, `selectTake` cambia cuál sea la activa, borrar la activa promueve otra, y una tercera toma se une al mismo grupo existente — en vez de intentar simular una grabación de micrófono real en este entorno de navegador sandboxeado, que no es fiable para eso.

Deliberadamente diferido (no a medias):
- [ ] Comping a nivel de fragmento (combinar partes de distintas tomas dentro de una misma región, estilo lanes de Pro Tools) — hoy el comping es de toma completa: eliges cuál toma entera suena, no mezclas mitades de dos tomas distintas. Requeriría una vista de carriles dedicada; se deja para una sesión propia si hace falta ese nivel de control.

## FASE 6 — Automatización

Status: **volumen y pan por curva de puntos, funcional de punta a punta**

Auditoría antes de tocar nada: no existía absolutamente nada de automatización en el código (ni tipos, ni motor, ni UI) - fase enteramente nueva.

- [x] Modelo de datos: `Track.automation: { volume: AutomationLane, pan: AutomationLane }`, cada lane con `enabled` + `points: AutomationPoint[]` (`{id, time, value}`). Mientras una lane está deshabilitada o vacía, la reproducción usa el valor estático (`volumeDb`/`pan`) exactamente igual que antes de esta fase - es puramente aditivo, cero riesgo para proyectos existentes (normalizado en `loadProject` igual que `masterVolumeDb`/`instrument`).
- [x] Motor: `AudioEngine.scheduleAutomation` programa la curva completa sobre el `AudioParam` real (`gain`/`pan`) con `setValueAtTime`/`linearRampToValueAtTime`, re-anclada en cada `play()`/`seek()`/`startRecording()` - mismo mecanismo que ya usan los fades de clip. `pause()`/`stop()` ahora re-sincronizan `volumeDb`/`pan` a su valor estático (antes un fader automatizado se quedaba "pegado" en el último valor rampeado tras detener la reproducción).
- [x] Editor: `Automation/AutomationEditor.tsx`, bottom sheet (no un carril inline en el Timeline - ver nota de diseño abajo) con selector Volumen/Pan, toggle de habilitado, y una curva editable: tap en espacio vacío agrega un punto, arrastrar un punto lo mueve, doble-click lo borra. Botón de acceso nuevo en `TrackHeader` (ícono propio `AutomationIcon`, se enciende en cian cuando el track tiene alguna lane habilitada).
- [x] Nota de diseño: se descartó deliberadamente un carril de automatización inline dentro del Timeline (como en Pro Tools) porque el cálculo de alturas de `Timeline.tsx`/`TrackLane.tsx`/`LoopRegion.tsx` asume `TRACK_HEIGHT` uniforme por track (ya verificado y estable desde FASE 2/3) - agregar una fila expandible por track requería alturas dinámicas, con riesgo real de regresión en el ruler/loop/playhead ya probados. El bottom sheet reutiliza el mismo componente y vocabulario de interacción que el piano roll, sin tocar el Timeline en absoluto.

Verificado: `tsc`/`eslint`/`vitest` (286 tests, +8 nuevos: 4 de `interpolateAutomation` puro, 4 del store) limpios. En navegador: agregar/arrastrar/borrar puntos con clicks/pointer events reales, habilitar la lane, y **reproducción real confirmada por el medidor** - el canal de Bass bajó de 84% a 48% de señal entre el punto de automatización en 0s y el de 3.75s, seguido exactamente por el patrón dibujado; al detener, el medidor vuelve a 0% (no se queda "pegado" en el último valor automatizado). Sin errores de consola reales (una sesión de depuración encontró un error de compilación obsoleto en el buffer de logs del navegador que sobrevivió a un reinicio completo del dev server - confirmado como un log histórico atascado, no un error en vivo, verificando el contenido real de la página en cada paso).

Deliberadamente diferido (no a medias):
- [ ] Automatización de parámetros de efectos individuales (ej. cutoff de un filtro) - por ahora solo volumen y pan a nivel de track, los dos targets de mayor valor. Extenderlo requeriría un selector de "qué efecto + qué parámetro" por lane; se deja para cuando haya una necesidad concreta.
- [ ] El fader/pan visual en el Mixer no sigue el valor automatizado en vivo durante la reproducción - solo el audio real sigue la curva, el control estático de la UI no se anima con el playhead (como sí hace Pro Tools). Puro pulido visual, no afecta el resultado sonoro.

## FASE 7 — Capa de IA

Status: **Vocal Match completado esta sesión; AI Mix y masterizado ya cumplían de antes; Beat Gen y AI Assistant contextual con pendientes reales**

Auditoría contra el prompt maestro punto por punto:

- [x] **AI Mix** — el análisis DSP (nivel, masking espectral, gain staging) con sugerencias aplicables ya existía de una sesión anterior. Esta sesión se agregó lo que faltaba: una lectura conversacional real. Nueva sección "AI READ" en `MixAssistantPanel.tsx` que envía el análisis ya medido (severidades, peak/RMS/LUFS, masking, gain staging) como contexto al mismo backend Claude que usa `AiAssistantPanel` (`/api/assistant`, `ANTHROPIC_API_KEY` server-only) — el system prompt (`buildMixSection` en `route.ts`) le pide explícitamente que base su respuesta en esos números reales, no en consejos genéricos. Mismo mecanismo de "propone, no aplica": las acciones sugeridas por Claude se muestran con botón Apply, igual que en el Assistant. Verificado en navegador con el pipeline completo (análisis real → petición al backend → degradación correcta a "not configured" sin la key) — falta solo que el usuario configure `ANTHROPIC_API_KEY` en Vercel para ver una respuesta real de Claude en producción.
- [x] **Masterizado automático con objetivo de loudness** — también ya existía: la sección MASTERING de `MixAssistantPanel` ya sugiere y aplica una ganancia de master hacia un LUFS objetivo por plataforma (Spotify/etc.).
- [x] **Vocal Match — completado esta sesión.** Antes solo comparaba tonalidad (key/scale) y mostraba un mensaje de texto, sin ningún botón de aplicar - violaba la regla "la IA propone, el usuario aplica" tal cual la pide el prompt maestro. Se agregó lo que faltaba explícitamente (nivel y espacio):
  - Nueva `suggestVocalTreatment()` en `vocalBeatMatch.ts`: nivel objetivo de la voz relativo al RMS del beat (+4dB, valor nombrado explícitamente, no una caja negra) y un delay sincronizado al tempo detectado del beat (nota de octavo) como técnica honesta de "espacio" - no se inventó una detección falsa de reverb del beat (eso necesitaría separación de fuentes, inviable aquí).
  - Botones "Apply level" y "Apply tempo-synced delay" en `VocalBeatMatchPanel.tsx`, que crean/encuentran el track de la voz y aplican de verdad: `updateTrack` para el nivel, `setEffectChain` con un Delay para el espacio. Verificado en navegador: RMS/tempo detectados reales, click en ambos botones cambió el volumen del track (-8.1dB aplicado) y agregó un Delay real a su cadena de efectos (267ms, sincronizado al tempo detectado) - visible y editable en la pestaña FX.
- [x] **AI Assistant contextual — completado esta sesión.** El chat vivía solo en su propia pestaña del Browser, sin ningún punto de entrada desde otro lado. Se agregó un botón "Ask AI" (ícono chispa) en `TrackHeader` y en `EffectCard` que saltan directo a la pestaña Assistant con el mensaje pre-rellenado ("Nombre del track: " o "Efecto on Track: "). El borrador del mensaje se subió al store (`assistantDraftMessage`, mismo patrón que `mobileView`/`snapResolution`) en vez de quedar en estado local del panel — evita por completo el problema de sincronización de "¿ya consumí este valor?" entre montado/desmontado del panel, que sí mordió durante la implementación (ver nota abajo). También se subió `BrowserPanel`'s tab activo (`browserTab`) al store por la misma razón: hacía falta poder cambiarlo desde otro componente.
  - Nota técnica: el primer intento (un campo "contexto" de un solo uso, consumido en un `useEffect`/comparación por referencia dentro de `AiAssistantPanel`) falló en dos rondas - el lint del repo prohíbe `setState` dentro de efectos y también prohíbe leer `useRef` durante el render (`react-hooks/set-state-in-effect`, `react-hooks/refs`). La solución correcta terminó siendo más simple que el problema: en vez de sincronizar un valor derivado, subir el dato en sí (`assistantDraftMessage`) al store, eliminando la necesidad de sincronizar nada.
- [ ] **Beat Gen** — pendiente real. El propio código ya lo admite en un comentario: "every instrument here is a simple synthesized placeholder... there are no sample-based drums/instruments." Se le preguntó al usuario cómo resolver la fuente de samples reales; sugirió descargar packs desde Reddit. Se declinó esa vía explícitamente: los packs de batería que circulan en Reddit casi nunca tienen licencia clara de redistribución (muchos son extraídos de librerías comerciales sin permiso), y no hay forma confiable de verificar la licencia de un archivo enlazado en un post — bundlearlo en un repo público expondría al usuario a un riesgo real de infracción de derechos. Queda pendiente elevar la síntesis actual (mejores envolventes/capas en kick/snare/hihat, sin samples reales) como alternativa segura, o que el usuario aporte samples con licencia verificable (ej. Freesound.org con licencia CC0/CC-BY explícita por archivo, o grabaciones propias).

## FASE 8

Status: **no iniciada**
