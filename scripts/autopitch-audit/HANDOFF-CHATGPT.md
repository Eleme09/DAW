# AutoPitch del DAW — documento de traspaso para análisis externo

Fecha: 2026-10-06. Rama: `claude/personal-ai-daw-s9v97w`, último commit `5798b52`. Repo: `Eleme09/DAW`.

## 0. Prompt sugerido (pega esto antes del documento)

> Eres un ingeniero de DSP de audio / procesamiento de voz. Abajo hay un documento que describe un afinador de voz en tiempo real (tipo Auto-Tune, TD-PSOLA en un AudioWorklet de la Web Audio API) que llevo meses intentando que suene bien. Lo que se escucha sigue siendo peor que BandLab. Léelo completo y respóndeme: (1) ¿qué parte del diseño actual sospechas que sigue causando el sonido áspero/robótico/quebrado?, (2) ¿qué experimentos concretos (medibles sin oído) harías, en qué orden, para confirmarlo?, (3) ¿qué cambios de algoritmo propones y qué riesgo tiene cada uno?, (4) ¿qué falta medir o qué métrica de las que usamos es engañosa? No inventes datos: si algo no se puede saber con lo que está escrito, dilo.

## 1. Contexto

- Proyecto: un DAW móvil en el navegador (Next.js 16, React, TypeScript, Zustand, Web Audio API) que copia BandLab. Se usa sobre todo en **iPhone / Safari**. Sin sampler, sin drum machine: voz + pistas importadas.
- El módulo es **AutoPitch**: corrección de tono en tiempo real con 24 presets (Classic, Duet, Big Harmony, Natural, etc.) como el AutoPitch de BandLab. El preset que importa ahora es **Classic al 100 %** (el efecto "hard tune": notas de la escala al instante).
- El usuario compara contra **BandLab Classic al 100 %** con **la misma voz**. Su descripción del problema (textual): *"carrasposo, de mala calidad, no se apega a la voz, suena como un robot, distorsionado, saturado"*; después de la primera ronda de arreglos: *"sí mejoró un poco, pero sigue muy por debajo de un buen autotune; se escucha como la voz también quebrada"*.
- Quien escribe esto es una IA (Claude) que **no puede oír**. Todo lo diagnosticado es por medición. El usuario es el único oído y todavía no ha escuchado la última versión.

## 2. Arquitectura relevante

### 2.1 Dónde vive el afinador en la app

```
clip (AudioBuffer, decodificado a la frecuencia del contexto: 44.1 o 48 kHz)
  → AudioBufferSourceNode
  → track.input (GainNode)
  → AutoPitchEffect: AudioWorkletNode "autopitch-processor" (1 entrada mono → 2 salidas) + ConvolverNode (reverb opcional)
  → EffectChain de la pista (EQ, compresor... inserts del usuario)
  → volumen → pan → mute → analyser → master (cadena master + fader) → salida
```

- Mic en vivo (monitor): según el código, `getUserMedia` (mono) → misma pista → mismo worklet; esa ruta no se auditó con el motor nuevo.
- Reproducción: los clips de una pista con AutoPitch se programan **26 ms antes** (latencia del motor) para que la voz afinada caiga en tiempo.
- Exportación: render offline (`OfflineAudioContext`) con la misma cadena; WAV 16 bits. (Hasta hoy exportaba siempre a 44.1 kHz; en un teléfono a 48 kHz eso remuestreaba 44.1→48→44.1: corregido hoy a la frecuencia del audio decodificado.)
- El worklet es un archivo estático `public/worklets/autopitch-processor.js` (≈1450 líneas, JS plano, sin dependencias). En pruebas se ejecuta en Node dentro de un `vm` (harness `workletHarness.ts`) que simula `AudioWorkletGlobalScope`, procesando bloques de 128 muestras como el navegador.

### 2.2 Parámetros de Classic (los que llegan al worklet)

`key` (0–11, p. ej. 9 = La), `scaleIndex` (2 = mayor), `amount` 1, `speedMs` 0, `transitionMs` 0, `humanize` 0, `flex` 0, `lowLatency` 0, `formantFollow` 1, `leadGain` 1, sin voces de armonía, sin vocoder/efectos, sin reverb. El knob "Level" < 100 % sube `speedMs`/`transitionMs` hasta +250 ms y baja `amount`. Es decir: **Classic = cuantización instantánea al semitono de la escala más cercano**, sin glide.

### 2.3 Algoritmo del worklet (resumen fiel al código actual)

Entrada mono → anillo de historia (16384 muestras) → tres cosas en paralelo:

**A. Detección (cada HOP = 256 muestras ≈ 5.8 ms a 44.1 kHz)**
- Señal diezmada ×2 (filtro de un polo 0.45). Ventana YIN de ≈ 2.1 periodos de 70 Hz (≈ 30 ms). Umbral YIN 0.2; búsqueda 70–1000 Hz. Guardia de subarmónico (si 1/2, 1/3 o 1/4 del lag elegido es casi igual de bueno, se toma ese). Refinamiento parabólico acotado (`refineLag`).
- Cuadro "bueno": rms ≥ 0.0018 (−55 dBFS), confianza ≥ 0.55, hz finito > 0. Voz = 1 cuadro bueno para entrar, 2 malos para salir (histéresis).
- Salto de > 7 semitonos: hay que ver 2 lecturas seguidas (error de octava).
- Rechazo de atípicos: si el tono llevaba estable (< 0.25 st entre las 2 lecturas previas) y llega una lectura a > 0.5 st, se **retiene la anterior** hasta que 3 lecturas coincidan; como mucho 4 análisis (~23 ms).
- Promedio de dos polos del tono (τ ≈ 30 ms por polo, ≈ 60 ms efectivo) usado solo para **confirmar** cambios de nota; se reinicia si salta > 1 st.

**B. Decisión de nota y corrección**
- Nota objetivo = nota de la escala más cercana al tono detectado, con histéresis ("tolerancia"): cambia de inmediato si la lectura actual cae a ≥ 0.5 st más cerca de otra nota (≥ 25 cents pasado el punto medio); si no, cambia si el promedio confirma que esa es la nota más cercana (margen 0.1 st).
- `correction = (objetivo − detectado) × amount`, suavizada con `speedMs` (o `transitionMs` justo tras un cambio). Con 0 ms → `alpha = 1` (instantánea).
- Se guarda el historial de los dos últimos cuadros (`histT0/C0`, `histT1/C1`) para interpolar la corrección en el instante de entrada de **cada grano** (no la del cuadro más nuevo, que va ~15 ms atrasada).

**C. Marcas de periodo ("épocas") y síntesis TD-PSOLA con latencia constante D**
- Épocas: se siguen periodo a periodo. La primera de un tramo con voz = pico de energía suavizada (x², ventana ≈ P/16) dentro de ±P/2 de la rejilla; las siguientes = máximo de **correlación cruzada normalizada** de un periodo alrededor de la época anterior, buscada en ±P/4 de `anterior + P`, con refinamiento parabólico; luego un tirón suave (0.2, con zona muerta P/24) hacia el pico de energía para no derivar. Cada época guarda posición, periodo y si se midió con la voz activa.
- Síntesis (por mark): `mark_siguiente = mark + (periodo LOCAL de la entrada, de época a época) / razón`, donde `razón = 2^(semitonos/12)` y los semitonos = corrección interpolada. Para cada mark se toma el grano cuya época esté más cerca de `mark − D` (D = 26 ms, 14 ms en "low latency"), ventana Hann de **un periodo por lado** (mínimo 0.7 del salto, máximo D/2), leído con **núcleo sinc de 16 taps** (cúbica si hay remuestreo de formantes), y se suma en un buffer OLA junto con la **suma de pesos de las ventanas**. La salida es `OLA / max(suma de pesos, 0.35)` (promedio ponderado, nunca supera el pico de la entrada).
- Con voz activa se mezcla `dry·(1−g) + tuned·g` con `g` = ganancia de voz (cte. de tiempo 8 ms) × cobertura (si los granos cubren poco, rellena la señal seca alineada). `dry` = entrada retardada exactamente D, por eso los consonantes/respiración (no voz) pasan limpios sin tocar.
- Alineación: al empezar cada tramo con voz la marca se pone en `época + D`, y durante los primeros 100 ms si no hay corrección; si no, las marcas nunca se mueven (la deriva entre marcas y épocas **es** el cambio de tono). Si la corrección es ~0 (< 0.0006 de razón) se re-engancha suavemente a las épocas (≤ 0.5 muestra por periodo).
- **Afinación instantánea (speed 0)**: además, el grano usa el periodo medido en las épocas alrededor de ESE grano (`pref`, promedio de 3 periodos) para refinar la razón en `ganancia × (detectado_interpolado − tono_local_medido)`, solo si la diferencia es < 0.5 st.
- Ganancia de salida ×√2 (el paneo interno es de potencia constante, 0.707 por lado; la pista sin AutoPitch suena a 1.0).

### 2.4 Detalles que importan para cualquier análisis

- `sampleRate` es el del contexto (44.1 o 48 kHz; se asume 48 kHz en iPhone, **no medido en un teléfono real**; las pruebas cubren 44.1 y 48 kHz). Constantes de tiempo en el código están en segundos, las de muestras se derivan.
- El detector corre sobre la señal diezmada ×2, el resto a tasa completa.
- Latencia total fija de 26 ms; un grano no puede ser más ancho que D/2 por lado → voces por debajo de ~77 Hz usan granos cortos (límite documentado).
- CPU medida en Node (V8) con 30 s de voz: Classic ≈ 8 % de un núcleo, Duet ≈ 12 %, Big Harmony ≈ 18 %. En iPhone **no medido**.

## 3. Historia: qué se probó, qué se escuchó, qué se corrigió

| Versión | Commit | Qué se hizo | Qué dijo el usuario |
|---|---|---|---|
| v0 | `6369504`, `cab5310` | Motor TD-PSOLA con 24 presets; después un arreglo del "motor se queda mudo / sale 50× más fuerte" con la perilla baja | Videos A (BandLab) y B (nuestro): "carrasposo, robótico, saturado, no se apega a la voz" |
| v1 | `54ccf3a` | Se bajó el jitter de periodo en vocales sintéticas de 2.2 % a ~0.1 %; épocas por correlación; guardia de subarmónico; rechazo de atípicos; Toggle Off del preset; barra de región; fila de pista | Video C: "mejoró un poco, sigue muy por debajo de un buen autotune, voz quebrada" |
| v2 | `5798b52` | Auditoría por etapas con la voz real del usuario (82 s) → ver §4–5 | **Sin escuchar todavía** |

**Hipótesis equivocadas (para no repetirlas):**
1. "La toma está recortada/saturada al grabar en iPhone". Falsa: la voz es una pista cruda exportada de BandLab que suena bien allí, y el audio del video B no tiene recorte duro (crest 7.2 dB vs 7.9 de BandLab).
2. "Bajar el jitter de periodo a 0.1 % en vocales sintéticas = sonido limpio". Engañoso: sobre la voz real, el jitter de periodo de BandLab es ≈ 1.4–1.8 %, y la voz cruda 1.5 %; lo que se había medido era ruido de la propia síntesis sobre una señal demasiado regular. **Las pruebas sintéticas pasaban mientras la voz real fallaba** — lección: validar siempre con voz real.
3. "Mirando un espectrograma se ve bien". El usuario pidió explícitamente no concluir nada de un espectrograma: todo lo de §5 son métricas numéricas.

## 4. Auditoría con la voz real

Voz del usuario: `VozAudio_3.wav`, 82 s, 44.1 kHz, 16 bits, dual-mono, pico −1.55 dBFS, sin recortes. Referencia: el audio del video del usuario con BandLab Classic al 100 % (La mayor) sobre esa misma voz, alineado por correlación de envolventes (0.98); **ojo: es una grabación de pantalla (AAC), con pérdida de códec** (medido: solo por el códec el HNR baja ≈ 1.4 dB y aparece energía > 16 kHz).

Etapas comparadas contra el ORIGINAL (todas con el worklet real; "viejo" = `cab5310`):
1. Exportación de la app sin procesar.
2. Solo detección (`amount = 0`: el motor de granos corre, no se corrige nada) → debería devolver la voz idéntica retardada 26 ms.
3. Corrección mínima (`amount = 0.1`, ≤ unos pocos cents).
4. Classic 100 %.

Herramientas: Praat (parselmouth) para F0, jitter, shimmer, HNR, formantes; pyloudnorm (BS.1770) para LUFS; scipy/numpy para lo demás. Reproducible con `scripts/autopitch-audit/analyze.py` y `src/audio-engine/autopitch/pipelineAudit.test.ts` (ver README).

### 4.1 Resultado por etapa (resumen)

(Tabla de las etapas sobre el archivo completo de 82 s.)

| Etapa | Motor viejo | Motor nuevo |
|---|---|---|
| Exportación sin procesar (44.1 k) | transparente, SNR 83.5 dB (límite 16 bits) | igual |
| Exportación en teléfono (contexto 48 k) | −1.8 dB en 9.6–16 kHz, SNR 40 dB (doble remuestreo) | corregido: SNR 68 dB contra el original remuestreado una vez |
| Solo detección | −3.0 dB de nivel; solo 96 % de ventanas de 50 ms idénticas | nivel igual; 98 % de ventanas idénticas |
| Corrección mínima | ya degrada: error de tono mediana 8 cents / p95 116, HNR −1.1 dB, armónicos 0.3–1.5 kHz −3 dB, ciclos glotales rotos ×1.8, discontinuidades ×2.6 | sin alarmas: 3.9 cents (lo pedido), HNR −0.1 dB |
| Classic 100 % | modulación artificial de F0 (8–30 Hz) 88 cents RMS (voz original 55), error de tono p95 1099 cents (saltos de octava), 4.4 % de cuadros sin tono claro, HNR −1.5 dB, armónicos 0.3–1.5 kHz −4.4 dB, −3.3 dB de nivel | ver 4.2 (ventana con BandLab) |

### 4.2 Classic 100 %, ventana 5.6–23.7 s (misma voz, La mayor), nuevo vs viejo vs BandLab

| Métrica | Original | Viejo | **Nuevo** | BandLab (AAC) |
|---|---|---|---|---|
| Cambio de nivel dB | 0 | −3.42 | **−0.25** | −1.02 |
| HNR (Praat) dB | 15.21 | 13.72 | **14.70** | 13.94 |
| Jitter local % | 1.55 | 2.19 | **1.91** | 1.76 |
| Shimmer local % | 5.96 | 6.33 | **5.94** | 5.64 |
| Ciclos glotales rotos/repetidos por s | 0.43 | 1.03 | **0.80** | 0.78 |
| Modulación F0 8–30 Hz (cents RMS) | 50 | 92 | **31** | 47 |
| Cuadros de baja confianza de F0 % | 0.29 | 5.29 | **2.86** | 1.93 |
| Cuadros a ±10 cents de una nota % | 17.7 | 61.9 | **56.4** | 53.0 |
| Distancia mediana a la nota cents | 31.4 | 4.5 | **7.7** | 8.9 |
| Saltos de tono > 1 st por s | 3.15 | 5.24 | **6.02** | 7.53 |
| "Salta y vuelve" (idas y vueltas) por s | 1.00 | 1.11 | **1.23** | 1.42 |
| Rizado periódico del espectro (índice de peine, dB) | 0 | 2.38 | **2.01** | 1.94 |
| Contraste armónico 0.3–1.5k / 1.5–3k / 3–5k dB | 27.4 / 16.0 / 8.8 | 21.8 / 15.7 / 11.8 | **24.5 / 15.8 / 10.7** | 24.3 / 16.1 / 10.8 |
| Desplazamiento de formantes F1 / F2 / F3 (% mediana) | 0 | 1.5 / 1.1 / 0.7 | **1.4 / 1.0 / 0.7** | 1.9 / 1.4 / 1.3 |
| Discontinuidades por s (picos de 2ª diferencia) | 3.2 | 11.5 | **8.8** | 2.4 (AAC) |
| Energía 16–20 kHz vs original (la voz original tiene ≈ −83 dB ahí) | — | +1.2 dB | +7.6 dB (≈ −75 dB, inaudible por sí solo) | +23 dB (códec) |
| Peak / true peak / muestras ≥0.999 | −1.55 / −1.53 / 0 | −4.90 / −4.88 / 0 | −1.86 / −1.85 / 0 | −2.69 / −2.54 / 0 |

Archivo completo (82 s) y las otras 9 etapas: `REPORTE-2026-10-06.md` (misma carpeta).

## 5. Qué estaba mal (causas encontradas) y cómo se arregló

1. **Decisión de nota inestable** (la más grave): el promedio retrasado podía elegir *su propia* nota (distinta de la cantada) cada 5.8 ms tras un cambio. 37 cambios de nota por segundo de voz, 968 idas y vueltas en 82 s, saltos de 2–6 semitonos. Ahora el promedio solo confirma la nota más cercana a la lectura actual: 9 cambios/s, 67 idas y vueltas.
2. **Marcas de síntesis que no seguían a la voz**: el espaciado era un periodo de la nota *objetivo*; incluso sin corregir nada, repetían/saltaban un periodo cada ~25 ciclos (2 % + 2.3 %) y los granos vecinos se solapaban desfasados (> 18 muestras en el 10 % de los granos). Ahora: periodo local de la entrada / razón.
3. **"Bloqueo 1:1" a mitad de nota**: cada vez que la corrección pasaba por cero se desplazaba la marca hasta medio periodo de golpe. Ahora solo se alinea al empezar un tramo.
4. **Detector roto desde el segundo 72**: la interpolación parabólica devolvió un lag de −38 muestras (−1.15 Hz) → NaN en el periodo suavizado → el afinador quedó muerto el resto de la canción. Ahora `refineLag` (solo en mínimos reales, ±0.5).
5. **Lecturas retenidas ~75 ms en glissandos** (filtro de atípicos que comparaba contra la primera lectura sospechosa). Ahora máximo 4 análisis.
6. **−3 dB al encender AutoPitch** (paneo interno). Ahora ×√2.
7. **Interpolación lineal al leer granos** (pasabajos distinto por grano: −1.3 a −2.2 dB en 5–16 kHz). Ahora sinc de 16 taps (lead) / cúbica (granos remuestreados).
8. **Afinación poco "pegada"**: la corrección salía de un cuadro de 30 ms centrado ~15 ms lejos del grano. Ahora se refina con el periodo local alrededor del grano (solo speed 0).
9. **Exportación a 44.1 fijo** con contexto a 48 kHz (§2.1).

Pruebas de regresión nuevas (`autopitchQuality.test.ts`, 377 pruebas en total pasan): salida = entrada con corrección 0 (> 60 dB de SNR), repetición/omisión de periodos solo la necesaria, sin idas y vueltas en cambios legato, `refineLag` acotado, nivel igual con/sin AutoPitch. Las de comportamiento **fallan con el motor viejo**.

## 6. Lo que sigue abierto (honesto)

**Verificación**
- **Nadie ha oído el motor nuevo.** Que las métricas lo acerquen a BandLab no demuestra que suene igual. No se sabe qué métrica correlaciona con "robótico" para este usuario.
- Referencia de BandLab con códec AAC, un solo fragmento de 18 s (Classic) — no hay referencia de otros presets.
- No probado en iPhone real: CPU, reproducción en vivo a 48 kHz, monitoreo del micrófono en vivo con el motor nuevo. La ruta de la app (Chromium, exportación a 44.1 y 48 kHz) da lo mismo que el render en Node.
- Los otros 23 presets no se han validado con voz real: solo con señales sintéticas y "sin NaN". Medido con la voz real ANTES de sumar +3 dB al motor (RMS por canal respecto a la voz cruda): Classic −3.4 dB (ahora −0.25, re-medido); playCard −10.3, telephone −8.3, gorgon −7.7, modernRap −6.9, hyper −6.7, yummy −6.6 dB. Como la ganancia √2 es global se espera que cada uno haya subido ≈ 3 dB, pero **no se re-midió ninguno salvo Classic**: siguen siendo varios dB distintos entre presets. El "volumen igualado ±0.5 dB entre presets" de una versión anterior solo se midió con vocal sintética y no se cumple con voz real.

**Diferencias medibles que siguen contra BandLab (Classic)**
- Saltos de tono > 1 st: 6.0/s (BandLab 7.5, original 3.1): es el efecto en escalón, pero no se sabe si los saltos nuestros son equivalentes.
- Cuadros de baja confianza de F0 2.9 % (BandLab 1.9 %, original 0.3 %): **errores de octava al arranque de una nota** (el detector lee una octava abajo durante 1–2 cuadros; ej. 10.7 s: 73 Hz → 314 Hz → 146 Hz). Los ≈ 2 % de ventanas de la etapa "solo detección" que no salen idénticas son arranques de nota.
- Jitter 1.91 % vs 1.76 %; contraste armónico 0.3–1.5 kHz 24.5 vs 24.3 dB (ambos 3 dB por debajo de la voz cruda).
- **Discontinuidades 8.8/s vs 3.2 del original** (BandLab 2.4, pero con AAC no comparable). Causa no completamente aislada. Hallazgo parcial: la voz original ya trae picos aplanados a ±0.7 (parece un limitador de la exportación de BandLab; no verificado) y al cambiar el tono esas esquinas se desplazan; con vocal sintética lisa no aparecen. Granos cortados al escribir: 0 de 20 307. No se ha demostrado si son audibles.
- Índice de peine 2.0 dB (original 0, BandLab 1.9): rizado periódico del espectro a largo plazo; causa no aislada (¿solape de granos no idénticos?).
- Más energía a 50–150 Hz (+1.9 dB; BandLab +4.0): no investigado.

**Decisiones de diseño que podrían estar limitando la calidad (hipótesis, no hechos)**
- TD-PSOLA con **una sola** pista de épocas medida en tiempo real, validada contra un pulso glotal conocido solo en vocales **sintéticas** — nunca contra una referencia real (GCI/EGG) con voz.
- Cambio de nota **instantáneo** (`transitionMs = 0`): el cambio de ciclo a ciclo es lo que da el "T-Pain"; no se sabe si BandLab usa una micro-transición (de 1–3 ms) para evitar discontinuidades. No investigado.
- Latencia fija de 26 ms y detector con ventana de 30 ms: el tono se conoce con ~15 ms de retraso y se compensa por interpolación; en arranques el detector aún no ha convergido.
- La detección y la síntesis comparten el mismo anillo/época pero la decisión de nota usa un promedio de ~60 ms: se desconoce el comportamiento exacto de BandLab en esto (solo se midió en el tramo con AutoPitch encendido: en fotogramas donde BandLab está sobre una nota, nuestro motor intermedio estaba en esa misma nota el 70 % de las veces, otra el 13 % y no periódico el 16 %; **medido con una versión intermedia, antes de los arreglos finales**).
- Voz con vocal/consonante: los consonantes pasan por la ruta seca alineada; el cruce seco↔afinado usa una constante de 8 ms (¿audible como clic/ola?). No auditado.

## 7. Cómo reproducir y qué archivos pasarle al otro analista

Archivos más útiles:
- `public/worklets/autopitch-processor.js` (el motor completo).
- `src/audio-engine/autopitch/resolveAutoPitch.ts` y `src/types/autoPitch.ts` (parámetros por preset).
- `src/audio-engine/autopitch/autopitchQuality.test.ts` y `testVoice.ts` (pruebas de calidad y generadores de voz).
- `scripts/autopitch-audit/analyze.py`, `REPORTE-2026-10-06.md`, `README.md`.
- A/B para escuchar (los 10 WAV de 18 s igualados en LUFS ya se los envié al usuario en el chat): `00_original`, `01_export_sin_procesar`, `02a/b_solo_deteccion_VIEJO/NUEVO`, `03a/b_correccion_minima_VIEJO/NUEVO`, `04a/b_classic100_VIEJO/NUEVO`, `04c_classic100_NUEVO_exportado_desde_la_app`, `05_bandlab_classic100_del_video`.

Reproducir:
```bash
# render de etapas con el worklet real (Node)
AUTOPITCH_AUDIT_INPUT=voz.wav AUTOPITCH_AUDIT_OUT=out AUTOPITCH_AUDIT_TAG=nuevo \
  npx vitest run src/audio-engine/autopitch/pipelineAudit.test.ts
# motor viejo
git show cab5310:public/worklets/autopitch-processor.js > viejo.js
AUTOPITCH_WORKLET=viejo.js AUTOPITCH_AUDIT_INPUT=voz.wav AUTOPITCH_AUDIT_OUT=out AUTOPITCH_AUDIT_TAG=viejo \
  npx vitest run src/audio-engine/autopitch/pipelineAudit.test.ts
# métricas + alarmas + extractos
pip install praat-parselmouth pyloudnorm numpy scipy
python scripts/autopitch-audit/analyze.py --original voz.wav \
  --stage "CLASSIC nuevo:out/nuevo_full.wav" --stage "CLASSIC viejo:out/viejo_full.wav" \
  --key 9 --scale major --window 5.6 23.7 --out reporte
```
(`--key 9` = La; el motor aplica la escala mayor de esa tónica.)

## 8. Dónde creo (Claude) que se podría atacar — ideas para contrastar, no conclusiones

1. **Aislar "decisión" de "síntesis".** Extraer del motor la secuencia de notas objetivo por tiempo y renderizar *ese mismo contorno de tono* con un PSOLA de referencia offline (Praat `Manipulation` / `Change gender`, o WORLD) sobre la misma voz. Si el de referencia suena claramente mejor con las mismas notas, el defecto está en nuestra síntesis; si suena igual, está en la decisión de nota/transiciones.
2. **Errores de octava al arranque de nota** (§6): medir cuántos arranques se afinan una octava abajo/arriba durante 1–2 cuadros y si un arranque con lookahead (esperar 1–2 cuadros antes de aplicar corrección, a costa de latencia) lo elimina.
3. **Transición entre notas**: probar un micro-glide de pocos ms (BandLab podría hacerlo; no se sabe) y medir discontinuidades, saltos de tono y la métrica de "salta y vuelve".
4. **Épocas con referencia real**: validar el rastreador de épocas contra marcas de GCI de Praat (`To PointProcess (periodic, cc)`) sobre la voz real y medir el desfase; hoy solo se validó con pulsos sintéticos conocidos.
5. **Discontinuidades 8.8/s**: separar cuáles caen en fronteras de grano, cuáles en cruces seco↔afinado, cuáles son propios de la voz (esquinas aplanadas) y si son audibles (ej. aplicar un filtro de paso alto/suavizado solo a la medición, o renderizar solo esos tramos para escuchar).
6. **Métrica de "robótico"**: pedir al usuario una evaluación ciega A/B/X (los 10 archivos) y puntuar, para buscar qué métrica numérica la predice. Sin eso, la optimización sigue a ciegas.
7. **Validar en iPhone real** (CPU del worklet a 48 kHz, subidas de buffer, monitoreo en vivo) antes de seguir puliendo calidad: un desborde de CPU suena a "crujido/saturado" y no se vería en Node.
8. **Alternativas de re-síntesis** (si lo anterior no alcanza): PSOLA con épocas de mayor precisión (GCI) + corrección de fase entre granos, o un vocoder de fase con *phase locking* / síntesis armónica (WORLD) para el preset Classic. Riesgo: latencia/CPU en iPhone y complejidad.

## 9. Restricciones del proyecto (para que las propuestas sean viables)

- Corre en un AudioWorklet de iPhone/Safari: sin WASM pesado, presupuesto de CPU por bloque de 128 muestras, latencia fija ≤ ~26 ms deseable (hay modo 14 ms).
- No añadir EQ/compresión/saturación/denoise para "esconder" artefactos: el usuario quiere corregir la causa.
- Mono de entrada, estéreo de salida; el worklet también hace armonías (hasta 4 voces), vocoder y efectos de carácter para los otros 23 presets.
- Código y comentarios en el repo; respuestas al usuario en español.
