# Fases (temas) — copiar BandLab tema por tema

Cómo se trabaja: el usuario manda videos/capturas de BandLab sobre UN tema → se copia distribución + funciones → se prueba en Chromium (390×844) → commit + push a `claude/personal-ai-daw-s9v97w` → se actualiza este archivo → el usuario hace `/clear` y manda el siguiente tema.

Detalle de cada fase: `PROGRESS.md` (secciones "Tema N"). Qué hace BandLab: `BANDLAB_REFERENCE.md` (§13 clips, §14 grabar).

| # | Tema | Estado | Commit |
|---|------|--------|--------|
| 0 | Estructura: pantalla de proyectos, Studio de una pantalla, Mezcla, línea fija al centro | Hecho | 3084494, 9dd8399 |
| 1 | Clips: seleccionar, barra de acciones, menú ⋯, panel inferior, Armonizar | Hecho | d94f9eb |
| 2 | Grabar + desplazamiento: eje bloqueado con inercia, toma en vivo, ciclo y tomas, editor de pista | Hecho | 09fcf9d |
| 3 | Efectos (+Fx): librería de presets, agregar efecto, perillas | Pendiente — esperar videos |  |
| 4 | AutoPitch: panel, tonalidad, categorías, armonías | Pendiente |  |
| 5 | Masterización: Universal/Fire/Clarity/Tape, intensidad, EQ | Pendiente |  |
| 6 | Automatización | Pendiente |  |
| 7 | Ajustes: tempo, metrónomo, latencia, importar/exportar | Pendiente |  |
| 8 | Biblioteca de proyectos | Pendiente |  |

## Pendientes conocidos de fases hechas

- Tema 1: selección múltiple con pulsación larga, arrastrar el ícono de loop, Fusionar.
- Tema 1: no se puede escuchar el resultado de transponer/estirar/armonizar (solo medido con pruebas); procesar 20 s tarda 1–2.5 s.
- Tema 2: el gesto con el dedo y la grabación con ciclo no se han probado en un iPhone real (solo Chromium).
- Importar video MP4/MOV no se pudo probar (el Chromium de pruebas no trae AAC).
