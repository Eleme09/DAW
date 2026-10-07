# Investigación diaria de VSTs

Pedido del usuario (2026-10-07): cada día se trabaja UN efecto, y antes se investiga a fondo cómo lo
construyen los mejores estudios. Tres pasadas por tema, hora de Colombia/Perú (UTC−5):

| Pasada | Hora | Qué se busca |
|---|---|---|
| 1 | ~3 PM | Fuentes primarias de los mejores estudios: manuales, patentes, papers, charlas y entrevistas de sus ingenieros. Qué hacen exactamente (algoritmo, rangos, latencia, controles, detalles que nadie más tiene). |
| 2 | ~9 PM | Ingeniería: papers académicos (DAFx, AES, ICASSP), implementaciones abiertas, cómo se mide la calidad (señales de prueba, métricas). Comparar con NUESTRO código, con archivo y línea. |
| 3 | ~6 AM | Más allá: qué aman y odian productores e ingenieros de verdad (con fuente), qué puede hacer un DAW de celular que un plugin de escritorio no, y un plan priorizado de cambios con cómo verificar cada uno. Cierra el tema. |

Reglas: cada dato con su enlace; nada inventado ni genérico ("usa un buen algoritmo" no sirve; "Auto-Tune
Pro X usa Retune Speed 0–400 ms y Humanize que alarga…" sí); lo no confirmado se marca **no verificado**.

## Orden de temas

Estado: `pendiente` → `en curso (fecha)` → `investigado (fecha)`. La pasada 1 toma el primer `pendiente`;
las pasadas 2 y 3 siguen el que está `en curso`. Cada tema escribe en `investigacion/NN-tema.md`.

| # | Tema | Nuestro código | Referentes a estudiar (mínimo) | Estado |
|---|---|---|---|---|
| 01 | Autotune (Núcleo) | `public/worklets/autopitch-processor.js`, `src/types/autoPitch.ts` | Antares (Auto-Tune Pro/Artist/EFX), Celemony Melodyne, Waves Tune Real-Time, Synchro Arts RePitch, Soundtoys Little AlterBoy | pendiente |
| 02 | Compresor | `CompressorEffect.ts`, `dynamics.ts`, `public/worklets/dynamics-processor.js` | Universal Audio (1176, LA-2A), FabFilter Pro-C 2, Waves CLA-76/CLA-2A, Tube-Tech CL 1B (Softube) | pendiente |
| 03 | Ecualizador | `EqEffect.ts` | FabFilter Pro-Q, Pultec (UA/Waves), Neve 1073 (UA), SSL Channel | pendiente |
| 04 | De-esser | `DeEsserEffect.ts` | FabFilter Pro-DS, Waves Sibilance/DeEsser, Oeksound Soothe2, iZotope Nectar | pendiente |
| 05 | Reverb | `ReverbEffect.ts`, `impulseResponse.ts` | Valhalla DSP, Lexicon (480L/PCM), EMT 140 plate (UA/Softube), Audio Ease Altiverb, LiquidSonics | pendiente |
| 06 | Delay | `DelayEffect.ts` | Soundtoys EchoBoy, Valhalla Delay, Waves H-Delay, FabFilter Timeless | pendiente |
| 07 | Saturación y excitador | `SaturationEffect.ts`, `ExciterEffect.ts` | Soundtoys Decapitator, FabFilter Saturn 2, Aphex Aural Exciter, Softube Tape | pendiente |
| 08 | Puerta y limpieza de ruido | `NoiseGateEffect.ts`, `noise-gate-processor.js`, reducción de ruido | iZotope RX (Voice De-noise), Waves NS1/Clarity Vx, Accentize, Acon Digital | pendiente |
| 09 | Limitador, clipper y master | `LimiterEffect.ts`, `ClipperEffect.ts`, `src/audio-engine/mastering/` | FabFilter Pro-L 2, iZotope Ozone, Kazrog KClip, Standard Clip, LANDR | pendiente |
| 10 | Pitch shifter y armonías (Metamorfo) | `PitchShiftEffect.ts`, voces de Núcleo | Eventide (H910/H3000, MicroPitch), Antares Harmony Engine, Waves OVox, Zynaptiq | pendiente |
| 11 | Modulación e imagen | `ChorusEffect.ts`, `FlangerEffect.ts`, `AutoPanEffect.ts`, `StereoWidthEffect.ts` | Soundtoys MicroShift/PanMan, Eventide, Waves Doubler, Polyverse | pendiente |
| 12 | Compresor multibanda | `MultibandCompressorEffect.ts` | FabFilter Pro-MB, Waves C4/C6, iZotope Ozone Dynamics | pendiente |
