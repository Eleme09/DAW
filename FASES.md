# Fases (temas) — copiar BandLab tema por tema

Cómo se trabaja: el usuario manda videos/capturas de BandLab sobre UN tema → se copia distribución + funciones → se prueba en Chromium (390×844) → commit + push a `claude/personal-ai-daw-s9v97w` → se actualiza este archivo → el usuario hace `/clear` y manda el siguiente tema.

Detalle de cada fase: `PROGRESS.md` (secciones "Tema N"). Qué hace BandLab: `BANDLAB_REFERENCE.md` (§13 clips, §14 grabar, §15 AutoPitch, §16 letra y ajustes, §17 +Fx).

| # | Tema | Estado | Commit |
|---|------|--------|--------|
| 0 | Estructura: pantalla de proyectos, Studio de una pantalla, Mezcla, línea fija al centro | Hecho | 3084494, 9dd8399 |
| 1 | Clips: seleccionar, barra de acciones, menú ⋯, panel inferior, Armonizar | Hecho | d94f9eb |
| 2 | Grabar + desplazamiento: eje bloqueado con inercia, toma en vivo, ciclo y tomas, editor de pista | Hecho | 09fcf9d |
| 3 | Efectos (+Fx): librería de presets, agregar efecto, perillas | Hecho (sin escucha del usuario: ver PROGRESS) | ad07081 |
| 4 | AutoPitch: panel, tonalidad, categorías, armonías (24 presets) + pestañas Letra y Ajustes | Hecho (con ajustes posteriores: ver PROGRESS) | 6369504, eb45d8e |
| 5 | Masterización: Universal/Fire/Clarity/Tape, intensidad, EQ | Pendiente |  |
| 6 | Automatización | Pendiente |  |
| 7 | Ajustes: tempo, metrónomo, latencia, importar/exportar | Parcial: pestaña Ajustes hecha en el tema 4 (tempo, compás, clave, contar, volumen de metrónomo, entrada, exportar); falta prueba de latencia |  |
| 8 | Biblioteca de proyectos | Pendiente |  |

## Pendientes conocidos de fases hechas

- Tema 3 (segunda tanda): Hard Tune y preajustes rehechos para tomas de celular; pendiente la escucha del usuario de las 3 versiones entregadas. Pendientes pedidos: arrastrar clips entre pistas, revisar bugs de cada efecto, Pitch Shifter, portadas/nombres premium, rediseño visual del AutoPitch, análisis de lo que falta (idea: venderla).
- Tema 3: nadie escuchó los 22 preajustes; solo se midieron (nivel, picos). Los umbrales de compresión son fijos: con una voz grabada mucho más baja o más alta que la de prueba (−8.7 LUFS) comprimen distinto. Latencia del compresor medida solo en Chromium (Safari sin medir). El escritorio (DawShell) sigue con el rack viejo.

- Tema 4: los presets premium no se pudieron escuchar en BandLab; su sonido sale de la descripción oficial de cada uno (FAQ de AutoPitch), no de una comparación de audio. Sin probar en un iPhone real: consumo de CPU (medido en Node: 7–16 % de un núcleo por pista según preset) y latencia al monitorear.
- Tema 4: se corrigió un fallo grave (la salida se disparaba y luego se quedaba muda con la perilla baja) pero NO se pudo comparar a oído contra BandLab; si el timbre sigue sin gustar, mandar un video corto con el MISMO fragmento en BandLab y en el DAW, con un solo preset (Classic) a la vez.
- Tema 4: un paso de semitono cantado ~30 cents desafinado tarda ~75–100 ms en cambiar de nota (a cambio de no "parpadear" con vibrato); cantado a ≤25 cents de la nota cambia al instante.
- Tema 4 (tercera tanda): aspereza del motor medida y bajada (jitter de periodo 2.17 % → ~0.1 %), AutoPitch se apaga tocando el preset activo, barra de región se cierra al tocar fuera, fila mic/+Fx/AutoPitch por pista. Comparado contra BandLab con la misma voz (espectro): el motor viejo emborronaba los armónicos agudos, el nuevo queda a nivel de BandLab arriba de 1.5 kHz. NO se pudo oír. Pendiente: nivel de varios presets con voz real, ~3 dB de ruido entre armónicos en graves: ver PROGRESS.
- Tema 4 (auditoría con la voz real del usuario): la degradación estaba en el motor (decisión de nota que saltaba 37 veces/s, marcas de síntesis que no seguían a la voz, NaN a los 72 s, −3 dB, interpolación lineal) y en la exportación a 48 kHz en teléfonos; todo arreglado y medido contra BandLab con la misma voz. Reporte: `scripts/autopitch-audit/REPORTE-2026-10-06.md`. Falta la escucha del usuario.

- Tema 4 (experimentos E1–E6): adoptado solo el lookahead de un análisis + 2 hops de margen (latencia 37.6 ms); detector con dos bugs conocidos medidos y reproducidos (lectura de armónico, octava pegada) cuyo arreglo necesita antes realinear las marcas de síntesis. Reporte: `scripts/autopitch-audit/EXPERIMENTOS-2026-10-06.md`. Falta la escucha del usuario.

- Tema 1: selección múltiple con pulsación larga, arrastrar el ícono de loop, Fusionar.
- Tema 1: no se puede escuchar el resultado de transponer/estirar/armonizar (solo medido con pruebas); procesar 20 s tarda 1–2.5 s.
- Tema 2: el gesto con el dedo y la grabación con ciclo no se han probado en un iPhone real (solo Chromium).
- Importar video MP4/MOV no se pudo probar (el Chromium de pruebas no trae AAC).
