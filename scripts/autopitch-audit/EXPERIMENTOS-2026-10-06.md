# AutoPitch — experimentos E1–E6 sobre VozAudio_3.wav (2026-10-06)

Baseline: motor del commit `5798b52` (Classic 100 %: amount 1, speed 0, transition 0, La mayor).
Cada variante cambia **un solo mecanismo** respecto del baseline (`experiments/make_variants.py`).
Herramientas: `src/audio-engine/autopitch/pipelineTrace.test.ts` (render + traza de lo que hizo el motor)
y los scripts de `experiments/` (cómo repetirlo: `experiments/README.md`; resultados crudos en
`experiments/results/`). Referencias externas: Praat (autocorrelación, PointProcess, PSOLA),
WORLD (Harvest, CheapTrick, D4C), ZFF para instantes de cierre glótico.

Nada de esto dice cómo suena. Las conclusiones son sobre lo que se midió; la escucha es del usuario.

## 0. Control de ruido (hallazgo que cambia cómo leer todo lo demás)

El motor es determinista, pero **cualquier** cambio en una decisión (un cuadro) desplaza la fase de
todas las marcas de síntesis desde ahí en adelante: las salidas de dos variantes difieren por completo
(diferencia máx. 1.4 con pico 0.75) después de la primera decisión distinta. Para saber cuánto varían
las métricas por eso solo, se corrió el MISMO baseline con 0, 1, 37, 64, 128 y 300 muestras de silencio
agregadas al principio de la entrada (nada más cambia):

| métrica | rango |
|---|---|
| detector mal % | 7.43 – 15.35 |
| cuadros armónico | 170.00 – 412.00 |
| bloqueo máx ms | 603.70 – 899.80 |
| ataque roto % | 11.66 – 17.13 |
| salida >6 st | 0.00 – 1.00 |
| saltos >1 st/s | 1.06 – 1.40 |
| salta-vuelve/s | 0.10 – 0.17 |
| dist. nota c | 9.01 – 10.61 |
| dist. ataque c | 20.83 – 24.90 |
| ±10 c % | 48.60 – 52.02 |
| disc/s (82 s) | 2.52 – 2.96 |

Una variante solo "mejora" si sale del rango del control, y en la mayoría de los 6 desplazamientos.
Las comparaciones de una sola corrida (hechas antes de este control) no alcanzan.

## E1 — decisión vs síntesis

Misma trayectoria de decisión (F0 detectada, nota objetivo, corrección por cuadro, extraída de la traza),
sintetizada por nuestro TD-PSOLA, por Praat (PSOLA overlap-add) y por WORLD. Ventana 5.6–23.7 s.

| | nuestro PSOLA | Praat PSOLA | WORLD | original | BandLab (video) |
|---|---|---|---|---|---|
| ±10 c de una nota | 56 % | 84 % | 72 % | 18 % | 53 % |
| distancia a la nota (mediana) | 7.7 c | 1.2 c | 3.9 c | 31 c | 8.9 c |
| ciclos glotales rotos/s | 0.80 | 0.07 | 0.07 | 0.43 | 0.78 |
| jitter | 1.91 % | 1.09 % | 0.83 % | 1.55 % | 1.76 % |
| HNR | 14.7 dB | 15.5 dB | 18.4 dB | 15.2 dB | 13.9 dB |
| discontinuidades/s | 8.84 | 7.18 | 8.84 | 3.20 | 2.38 |

Por regiones (cuadros con decisión correcta, 2794): distancia a la nota buscada 7.45 c (nuestro) vs
1.08 c (Praat); cambio cuadro a cuadro 6.1 c vs 1.6 c. En cuadros con decisión equivocada (224) nuestro
HNR cae a 9.9 dB (Praat 19.1): granos basura.

**Conclusión:** con la misma decisión, nuestra síntesis deja flotar el tono (hereda la variación ciclo
a ciclo de la entrada: el espaciado de marcas usa el período local de cada ciclo). BandLab, medido en el
video, flota parecido (8.9 c). Las discontinuidades NO son propias de nuestra síntesis: WORLD (sin granos)
da la misma tasa con la misma trayectoria; la referencia de BandLab tiene menos, pero es AAC (el códec
quita agudos y el detector usa la segunda diferencia, muy sensible a agudos): no comparable.

## E2 — discontinuidades por causa

Mismo detector que `analyze.py`. Archivo completo: 2.96/s en la salida vs 1.16/s en la entrada.
Primera categoría que aplica (ventana 5.6–23.7 s, 160 eventos): borde de grano 45.6 %, heredada de la
entrada 23.8 %, otra 17.5 %, cambio de nota 3.1 %, dry→tuned 3.8 %, ataque 3.8 %, detector 1.9 %,
época 0.6 %, tuned→dry 0 %, voicing 0 %. Amplitud ×8–9 el nivel local en todas las categorías.
"Borde de grano" está confundida con las marcas: los picos caen en las marcas (66 % salida vs 45 %
entrada vs 20 % azar), o sea en los cierres glóticos; WORLD, sin granos, da la misma tasa. Lo
atribuible al motor en sí es ~1/s.

## E3 — errores de octava al ataque

Variantes: A actual, B esperar 1 cuadro, C esperar 2, D lookahead 1 (+11.6 ms), E lookahead 2 (+23.2 ms).
Durante el experimento apareció la causa de los bloqueos largos de octava, que no está en el ataque
(ver F). Métricas: error del detector contra Praat+Harvest (solo cuadros donde ambas referencias
coinciden), y en la SALIDA: cuadros a > 6 st del tono cantado, cuadros "rotos" (ni Praat ni Harvest
leen un tono en la salida donde la entrada es claramente sonora), saltos > 1 st y > 7 st, salta-y-vuelve,
distancia a la nota; global y en los primeros 50 ms de cada nota.

Todas las variantes, 6 corridas cada una (media; entre paréntesis: en cuántas de las 6 queda por DEBAJO del baseline con la misma entrada; para "±10 c %" más alto es mejor):

| variante | lat ms | detector mal % | cuadros armónico | bloqueo máx ms | ataque roto % | salida >6 st | saltos >1 st/s | salta-vuelve/s | dist. nota c | dist. ataque c | ±10 c % | disc/s (82 s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A baseline 5798b52 | 26.0 | 10.99 | 260.00 | 673.37 | 14.93 | 0.83 | 1.24 | 0.14 | 9.80 | 23.27 | 50.41 | 2.69 |
| B esperar 1 cuadro | 26.0 | 10.99 (0/6↓) | 260.00 (0/6↓) | 673.37 (0/6↓) | 13.67 (4/6↓) | 1.17 (0/6↓) | 1.16 (3/6↓) | 0.12 (3/6↓) | 10.27 (0/6↓) | 26.12 (0/6↓) | 49.42 (6/6↓) | 2.61 (4/6↓) |
| D lookahead 1 (+2 hops) **adoptado** | 37.6 | 8.22 (6/6↓) | 144.17 (6/6↓) | 640.48 (4/6↓) | 9.56 (6/6↓) | 0.00 (5/6↓) | 1.21 (5/6↓) | 0.12 (4/6↓) | 9.24 (6/6↓) | 22.27 (6/6↓) | 51.72 (0/6↓) | 2.66 (4/6↓) |
| D' lookahead 1 (+1 hop) | 31.8 | 8.22 (6/6↓) | 144.17 (6/6↓) | 640.48 (4/6↓) | 19.34 (0/6↓) | 1.50 (0/6↓) | 1.24 (4/6↓) | 0.07 (6/6↓) | 9.62 (4/6↓) | 24.75 (2/6↓) | 50.84 (1/6↓) | 2.60 (3/6↓) |
| D'' lookahead 1, regla neutral | 37.6 | 10.86 (5/6↓) | 255.67 (5/6↓) | 673.37 (0/6↓) | 9.21 (6/6↓) | 0.33 (3/6↓) | 1.13 (5/6↓) | 0.12 (3/6↓) | 9.74 (4/6↓) | 20.94 (6/6↓) | 50.63 (2/6↓) | 2.67 (2/6↓) |
| F1 guarda de armónicos | 26.0 | 10.76 (6/6↓) | 234.83 (6/6↓) | 673.37 (0/6↓) | 14.88 (3/6↓) | 0.83 (0/6↓) | 1.31 (2/6↓) | 0.16 (1/6↓) | 9.54 (5/6↓) | 22.89 (4/6↓) | 51.03 (1/6↓) | 2.65 (4/6↓) |
| F2 confirmación arreglada | 26.0 | 13.19 (1/6↓) | 580.00 (0/6↓) | 175.08 (6/6↓) | 14.36 (4/6↓) | 7.00 (0/6↓) | 1.43 (0/6↓) | 0.12 (4/6↓) | 10.54 (2/6↓) | 22.86 (5/6↓) | 48.71 (4/6↓) | 2.18 (6/6↓) |
| F1+F2 | 26.0 | 6.04 (6/6↓) | 195.83 (4/6↓) | 137.37 (6/6↓) | 14.86 (3/6↓) | 2.50 (0/6↓) | 1.47 (1/6↓) | 0.13 (2/6↓) | 8.84 (5/6↓) | 22.34 (5/6↓) | 52.88 (1/6↓) | 2.13 (6/6↓) |
| F1+F2, +1 hop sin lookahead | 31.8 | 6.04 (6/6↓) | 195.83 (4/6↓) | 137.37 (6/6↓) | 12.47 (5/6↓) | 1.17 (0/6↓) | 1.28 (3/6↓) | 0.11 (3/6↓) | 9.19 (4/6↓) | 23.21 (3/6↓) | 52.07 (2/6↓) | 2.16 (6/6↓) |
| F1+F2, +2 hops sin lookahead | 37.6 | 6.04 (6/6↓) | 195.83 (4/6↓) | 137.37 (6/6↓) | 8.29 (6/6↓) | 0.17 (4/6↓) | 0.83 (6/6↓) | 0.03 (6/6↓) | 10.02 (3/6↓) | 19.72 (6/6↓) | 49.97 (3/6↓) | 2.25 (5/6↓) |
| F1+F2 + D' | 31.8 | 5.88 (6/6↓) | 191.33 (4/6↓) | 137.37 (6/6↓) | 18.55 (0/6↓) | 1.33 (0/6↓) | 1.43 (0/6↓) | 0.10 (5/6↓) | 9.33 (4/6↓) | 24.11 (2/6↓) | 51.68 (2/6↓) | 2.23 (5/6↓) |
| F1+F2 + D | 37.6 | 5.88 (6/6↓) | 191.33 (4/6↓) | 137.37 (6/6↓) | 9.43 (6/6↓) | 0.50 (2/6↓) | 1.32 (2/6↓) | 0.12 (5/6↓) | 8.78 (6/6↓) | 21.18 (6/6↓) | 53.00 (0/6↓) | 2.33 (5/6↓) |
| E1 marcas regulares | 26.0 | 10.99 (0/6↓) | 260.00 (0/6↓) | 673.37 (0/6↓) | 13.83 (4/6↓) | 6.67 (0/6↓) | 1.53 (0/6↓) | 0.18 (1/6↓) | 9.14 (6/6↓) | 22.55 (4/6↓) | 52.41 (0/6↓) | 2.60 (6/6↓) |

- **Errores de octava en la salida**: casi no existen en ninguna variante (0–1 cuadro de 6155 a más de
  6 st del tono cantado). Cuando el detector se equivoca de octava, el motor no transpone una octava:
  arma granos con épocas a la frecuencia equivocada y la voz sale **rota** (ni Praat ni Harvest leen un
  tono), sobre todo en el ataque: 14.9 % de los cuadros de los primeros 50 ms de cada nota.
- **Esperar 1–2 cuadros (B, C)**: no cambia el detector y no mejora fuera del ruido; B empeora la
  distancia a la nota en el ataque (23.3 → 26.1 c) y el ±10 c (6/6). C (una corrida): ataque roto
  13.2 %, salta-vuelve 0.30/s (control 0.10–0.17). Descartados.
- **Lookahead (D, E)**: con 1 análisis y +2 hops de latencia (D) baja el error del detector 11.0 → 8.2 %
  y los cuadros de armónico 260 → 144 (6/6), el ataque roto 14.9 → 9.6 % (6/6) y la distancia a la
  nota 9.8 → 9.2 c (6/6). Con 2 análisis (E, +23 ms) el detector empeora (9.4 %, bloqueo máx 911 ms,
  una corrida) y se descartó sin repetir.
- **De dónde viene la mejora del ataque**: el lookahead con solo +1 hop (D') deja el ataque PEOR que el
  baseline (19.3 %) con las mismas decisiones. En la traza: con 26 ms cada grano se arma para un instante
  de entrada ~5 ms posterior al centro del último cuadro analizado (100 % de los granos, un tercio más de
  un hop por delante: la corrección se extrapola o se retiene); con D' ~8 ms. El hop extra de margen es
  lo que pone el traspaso dry→tuned antes del ataque. (Los ataques rotos del baseline caen en el
  crossfade dry→tuned: tuned share mediana 0.89 vs 0.99 en ataques sanos; la cobertura de granos está
  bien, wsum 0.98.)
- **Regla de 2 lecturas**: cuando solo 2 de las 3 lecturas sirven, D toma la más baja. La regla neutral
  (D'', tomar la central) pierde casi toda la mejora del detector (10.9 %, 256 cuadros de armónico) y en
  `analyze.py` queda peor que D (ciclos rotos 0.85 vs 0.73/s, distancia 9.4 vs 8.8 c). Costo de la regla
  de D: suboctavas que antes no había (35 cuadros en 82 s; un episodio de 203 ms en 26.3 s, una
  re-sonorización donde una de las dos lecturas era la suboctava y el bloqueo pegajoso de F la sostuvo).
- Latencia agregada por D: 11.6 ms (26.0 → 37.6 ms). La reproducción la compensa (clips adelantados);
  verificado exportando desde la app a 44.1 y 48 kHz: 0 ms contra el original. El modo Low-Latency
  (14 ms) no cambia y decide sin lookahead.

## F — causa de los bloqueos de octava (detector)

Los bloqueos largos de octava (604 ms en 58.8 s, 569 ms en 57.8 s, 226 ms en 25.5 s) no vienen del
ataque. Dos mecanismos, reproducidos de forma determinista:

1. **YIN toma el primer mínimo bajo el umbral aunque el del período verdadero sea mucho más profundo**
   (10.9 s: d = 0.135 a 649 Hz vs 0.004 a 221 Hz; F1 sobre el 3.er armónico). Tono de prueba 220 Hz con
   el 3.er armónico dominante: el detector lee 663 Hz toda la nota.
2. **La confirmación de saltos > 7 st y la retención de outliers se pisan**: una confirma la lectura
   correcta, la otra la retiene, la lectura reemplazada reinicia la retención, y así sin fin. Tono de
   prueba (100 ms leídos en el armónico y después un La3 limpio): el detector queda en 662 Hz el resto
   de la nota aunque CADA lectura diga 220 Hz.

Arreglos medidos (tabla de arriba): F1 = tomar el múltiplo cuando su mínimo es mucho más profundo;
F2 = un salto confirmado no se vuelve a retener. Solos: F1 no cambia nada fuera del ruido; F2 empeora el
detector (13.2 %, 580 cuadros de armónico: el enredo también frenaba los errores). Juntos (F1+F2): error
del detector 11.0 → 6.0 % y bloqueo máximo 673 → 137 ms (6/6), discontinuidades 2.69 → 2.13/s (6/6).

**No se adoptaron.** La auditoría oficial (`analyze.py`) los marcó: con corrección 0 la salida dejó de
ser la entrada (null test 32.3 → 5.8 dB). Causa, con la traza: en 7.11–7.18 s la voz tiene doble período
(YIN lee 94 Hz); F1 vuelve consistente esa lectura de suboctava y F2 la deja pasar; las épocas pasan a
100 Hz y, cuando el detector vuelve a 190 Hz, las marcas de síntesis tardan ~0.5 s en realinearse con la
ruta seca (la corrección de fase es de media muestra por período). En ese tramo la correlación con la
entrada cae a 0.63. Una variante más conservadora (confirmar recién tras ~6 lecturas consistentes) mejora
la identidad pero no la recupera (14.6 dB, primeros 25 s). Arreglarlo exige tocar la síntesis
(realinear marcas tras un salto del detector): es otro componente y queda como siguiente experimento.
Los dos tonos de prueba quedaron como `it.fails` en `autopitch.test.ts` (bugs conocidos).

## E4 — micro-transición 0/1/2/3/5 ms

`transitionMs` del preset (Classic = 0). En el motor la corrección se calcula por cuadro de 5.8 ms y se
interpola linealmente entre cuadros: **ya hay una rampa mínima de un cuadro**; 1–3 ms dan alfa por
cuadro de 0.997 / 0.945 / 0.855, casi lo mismo que 0.

| transición | disc/s (archivo) | disc/s (ventana) | en cambio de nota | rotos al ataque | distancia a nota |
|---|---|---|---|---|---|
| 0 (actual) | 2.96 | 8.84 | 6 | 15.9 % | 9.1 c |
| 1 ms | 2.92 | 8.95 | 5 | 13.4 % | 9.3 c |
| 2 ms | 2.78 | 8.40 | 5 | 12.7 % | 9.4 c |
| 3 ms | 2.66 | 8.62 | 4 | 12.5 % | 9.6 c |
| 5 ms | 2.84 | 8.79 | 4 | 12.4 % | 9.9 c |

Todo dentro del rango del control. Las discontinuidades en cambios de nota son ~6 de 243. **Sin efecto
medible: se deja 0.**

## E5 — épocas vs cierres glóticos reales (ZFF)

Con el detector acertado: período de marcas dentro del 5 % en 95.8 % (1.5 % marcas perdidas, 0.3 % extra);
desfase vs ZFF mediana 7.5 % del período con sesgo fijo +6 % (inofensivo: constante); variación del
desfase ciclo a ciclo mediana 1.3 muestras, p95 9.6, solo 1.8 % de ciclos > 10 % del período.
Con el detector equivocado: 90 % de marcas extra. **Las épocas están bien; sus errores vienen del
detector**, no hacía falta tocar el seguimiento de épocas.

## E6 — crossfade dry/tuned 4/8/12/16 ms

Este cambio no altera ninguna decisión (solo la mezcla), así que acá la comparación es exacta, sin el
ruido del control:

| crossfade | disc/s (archivo) | disc/s (ventana) | en dry→tuned | en tuned→dry |
|---|---|---|---|---|
| 4 ms | 2.97 | 8.84 | 3 | 1 |
| 8 ms (actual) | 2.96 | 8.84 | 7 | 1 |
| 12 ms | 2.96 | 8.84 | 10 | 2 |
| 16 ms | 2.97 | 8.90 | 15 | 3 |

El total no cambia: el crossfade más largo solo hace que más discontinuidades que ya estaban caigan
"dentro" de la transición. **Sin relación: se deja 8 ms.**

## Reporte

**Componente principal de los problemas medidos**: el detector de tono (YIN + su post-proceso). Errores
contra Praat+Harvest en 7–15 % de los cuadros según la fase de la entrada, bloqueos de octava de hasta
0.9 s, y cuando se equivoca la síntesis arma granos basura (HNR 9.9 dB en esos tramos). Las épocas están
bien (E5). La síntesis deja flotar el tono más que Praat con la misma trayectoria (E1), pero tanto como
BandLab en el video. Las discontinuidades son sobre todo esquinas de pulsos glóticos que cualquier
re-síntesis de esta trayectoria produce (WORLD da la misma tasa); lo propio del motor es ~1/s.

**Cambio implementado** (solo este): lookahead de un análisis en la decisión de tono (mediana centrada
de 3 lecturas) + 2 hops de latencia (26 → 37.6 ms), `public/worklets/autopitch-processor.js`;
compensación de latencia exacta por frecuencia de muestreo (`resolveAutoPitch.ts`,
`AutoPitchEffect.ts`). Interfaz sin cambios: una sola perilla.

**Riesgo**: +11.6 ms de latencia al monitorear en vivo con el algoritmo normal (Low-Latency no cambia);
suboctavas ocasionales en re-sonorizaciones (ver E3). No verificado en un iPhone.

**Descartados por los experimentos**: esperar 1–2 cuadros, lookahead de 2, micro-transición 1–5 ms,
crossfade 4/12/16 ms, marcas regulares (E1: mejor bloqueo de nota pero más saltos y 6.7 cuadros a > 6 st),
y los arreglos del detector F1+F2 (rompen la identidad con corrección 0 sin un arreglo de síntesis).

### Auditoría final (`analyze.py` sin cambios) — baseline 5798b52 vs nuevo

Las corridas únicas varían tanto como el control; la comparación que vale es la de 6 corridas.

#### Archivo completo (82 s), corrida única

| etapa | null dB | nivel dB | HNR dB | jitter % | shimmer % | ciclos rotos/s | mod. F0 8–30 Hz c | baja conf. % | ±10 c % | dist. nota c | saltos >1 st/s | salta-vuelve/s | peine dB | discont./s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ORIGINAL | ∞ | 0.00 | 14.92 | 1.54 | 6.81 | 0.59 | 55.29 | 0.22 | 17.08 | 31.60 | 3.35 | 0.93 | 0.00 | 1.16 |
| 1 EXPORT app sin procesar | 83.52 | -0.00 | 14.92 | 1.54 | 6.81 | 0.59 | 55.28 | 0.22 | 17.08 | 31.60 | 3.35 | 0.93 | 0.00 | 1.17 |
| 2 DETECCION baseline | 32.30 | -0.00 | 14.90 | 1.55 | 6.77 | 0.59 | 55.28 | 0.43 | 17.15 | 31.51 | 3.45 | 0.96 | 0.00 | 1.18 |
| 2 DETECCION nuevo | 26.40 | -0.00 | 14.90 | 1.53 | 6.84 | 0.53 | 55.30 | 0.40 | 17.08 | 31.64 | 3.38 | 0.93 | 0.00 | 1.18 |
| 3 MINIMO baseline | -2.45 | -0.03 | 14.81 | 1.64 | 6.74 | 0.56 | 50.98 | 0.65 | 17.70 | 30.43 | 3.70 | 0.96 | 0.13 | 1.72 |
| 3 MINIMO nuevo | -2.96 | -0.02 | 14.79 | 1.63 | 6.82 | 0.43 | 55.21 | 0.75 | 17.46 | 30.47 | 3.60 | 0.93 | 0.12 | 1.72 |
| 4 CLASSIC baseline 5798b52 | -21.20 | -0.21 | 14.35 | 1.95 | 6.77 | 0.91 | 46.06 | 2.48 | 54.12 | 8.55 | 6.30 | 1.66 | 1.95 | 2.97 |
| 4 CLASSIC nuevo | -29.01 | -0.19 | 14.40 | 1.98 | 6.95 | 0.75 | 43.73 | 2.17 | 54.64 | 8.20 | 6.50 | 1.78 | 1.85 | 2.72 |
| 4b CLASSIC app nuevo 44.1k | -21.21 | -0.22 | 14.13 | 2.01 | 7.10 | 0.87 | 52.96 | 1.77 | 49.27 | 10.25 | 6.21 | 1.53 | 1.48 | 2.47 |
| 5 F detector hj (no adoptado) | -21.26 | -0.21 | 14.26 | 1.98 | 7.01 | 0.60 | 41.47 | 2.73 | 53.88 | 8.58 | 6.37 | 1.51 | 1.84 | 2.11 |
| 6 hj + lookahead (no adoptado) | -28.83 | -0.20 | 14.28 | 1.99 | 7.15 | 0.72 | 42.63 | 2.20 | 55.33 | 8.16 | 6.50 | 1.69 | 1.81 | 2.34 |
| 7 hj + margen sin lookahead (no adoptado) | -28.77 | -0.17 | 14.62 | 1.81 | 6.86 | 0.94 | 51.87 | 2.55 | 52.06 | 9.30 | 6.51 | 1.64 | 1.87 | 2.28 |
| 8 E1 marcas regulares (no adoptado) | -23.57 | -0.22 | 14.22 | 1.92 | 7.07 | 0.59 | 35.50 | 1.99 | 55.73 | 7.85 | 6.60 | 1.93 | 2.06 | 2.75 |

#### Ventana 5.6–23.7 s con BandLab, corrida única

| etapa | null dB | nivel dB | HNR dB | jitter % | shimmer % | ciclos rotos/s | mod. F0 8–30 Hz c | baja conf. % | ±10 c % | dist. nota c | saltos >1 st/s | salta-vuelve/s | peine dB | discont./s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ORIGINAL | ∞ | 0.00 | 15.21 | 1.55 | 5.96 | 0.43 | 49.97 | 0.29 | 17.74 | 31.35 | 3.15 | 1.00 | 0.00 | 3.20 |
| 1 EXPORT app sin procesar | 84.83 | -0.00 | 15.21 | 1.55 | 5.96 | 0.43 | 49.97 | 0.29 | 17.74 | 31.35 | 3.15 | 1.00 | 0.00 | 3.20 |
| 2 DETECCION baseline | 32.45 | -0.00 | 15.20 | 1.52 | 5.93 | 0.43 | 50.30 | 0.72 | 17.80 | 31.30 | 3.16 | 1.08 | 0.00 | 3.20 |
| 2 DETECCION nuevo | 36.14 | -0.00 | 15.21 | 1.54 | 5.98 | 0.43 | 50.01 | 0.57 | 17.68 | 31.39 | 3.22 | 1.00 | 0.00 | 3.20 |
| 3 MINIMO baseline | -3.26 | -0.02 | 15.08 | 1.65 | 6.13 | 0.29 | 50.70 | 0.72 | 17.90 | 30.51 | 3.65 | 0.93 | 0.15 | 5.41 |
| 3 MINIMO nuevo | -3.70 | -0.02 | 15.05 | 1.64 | 6.03 | 0.29 | 49.72 | 0.72 | 17.97 | 30.45 | 3.51 | 0.93 | 0.16 | 5.14 |
| 4 CLASSIC baseline 5798b52 | -19.94 | -0.25 | 14.70 | 1.91 | 5.93 | 0.80 | 30.97 | 2.86 | 56.42 | 7.67 | 6.02 | 1.23 | 2.01 | 8.84 |
| 4 CLASSIC nuevo | -29.57 | -0.23 | 14.67 | 1.94 | 6.29 | 0.58 | 32.04 | 2.65 | 56.50 | 7.79 | 6.58 | 1.59 | 2.02 | 8.29 |
| 4b CLASSIC app nuevo 44.1k | -17.97 | -0.24 | 14.41 | 2.05 | 6.17 | 0.65 | 30.16 | 2.22 | 51.66 | 9.55 | 5.70 | 1.30 | 1.55 | 7.18 |
| 5 F detector hj (no adoptado) | -19.53 | -0.23 | 14.42 | 2.03 | 6.14 | 0.44 | 31.27 | 3.15 | 56.58 | 7.64 | 6.25 | 1.38 | 1.97 | 6.13 |
| 6 hj + lookahead (no adoptado) | -35.50 | -0.21 | 14.42 | 2.11 | 6.28 | 0.72 | 32.20 | 2.58 | 58.16 | 7.18 | 6.90 | 1.94 | 2.00 | 6.80 |
| 7 hj + margen sin lookahead (no adoptado) | -22.97 | -0.18 | 14.80 | 1.88 | 6.25 | 1.09 | 55.76 | 3.15 | 52.83 | 8.93 | 7.33 | 1.89 | 1.96 | 7.07 |
| 8 E1 marcas regulares (no adoptado) | -23.22 | -0.26 | 14.55 | 1.83 | 6.28 | 0.36 | 32.33 | 2.36 | 57.39 | 7.49 | 6.96 | 1.65 | 2.03 | 8.23 |
| BandLab Classic (video) | -27.58 | -1.02 | 13.94 | 1.76 | 5.64 | 0.78 | 47.16 | 1.93 | 53.02 | 8.87 | 7.53 | 1.42 | 1.94 | 2.38 |

#### Classic 100 %, 6 corridas (entrada corrida 0/1/37/64/128/300 muestras) — Archivo completo

| métrica | baseline 5798b52 media [mín–máx] | nuevo media [mín–máx] | nuevo < baseline |
|---|---|---|---|
| HNR dB | 14.19 [14.08–14.35] | 14.35 [14.20–14.41] | 0/6 |
| jitter % | 2.00 [1.95–2.06] | 1.95 [1.91–1.99] | 4/6 |
| shimmer % | 6.95 [6.77–7.19] | 7.00 [6.91–7.17] | 2/6 |
| ciclos rotos/s | 0.94 [0.81–1.03] | 0.73 [0.69–0.78] | 6/6 |
| mod. F0 8–30 Hz c | 49.29 [43.11–55.92] | 47.12 [43.73–51.46] | 4/6 |
| baja conf. % | 2.14 [1.74–2.48] | 2.15 [1.56–2.49] | 4/6 |
| ±10 c % | 51.49 [48.09–54.12] | 52.95 [50.83–54.64] | 1/6 |
| dist. nota c | 9.48 [8.55–10.89] | 8.82 [8.20–9.67] | 6/6 |
| saltos >1 st/s | 6.32 [6.17–6.48] | 6.37 [6.04–6.95] | 3/6 |
| salta-vuelve/s | 1.66 [1.60–1.78] | 1.63 [1.31–1.87] | 3/6 |
| peine dB | 1.78 [1.53–1.95] | 1.73 [1.51–1.85] | 5/6 |
| discont./s | 2.70 [2.53–2.97] | 2.66 [2.52–2.72] | 4/6 |

#### Classic 100 %, 6 corridas (entrada corrida 0/1/37/64/128/300 muestras) — Ventana 5.6–23.7 s

| métrica | baseline 5798b52 media [mín–máx] | nuevo media [mín–máx] | nuevo < baseline |
|---|---|---|---|
| HNR dB | 14.55 [14.29–14.70] | 14.64 [14.50–14.69] | 1/6 |
| jitter % | 1.93 [1.91–2.00] | 1.91 [1.87–1.95] | 3/6 |
| shimmer % | 6.21 [5.93–6.50] | 6.25 [6.14–6.38] | 3/6 |
| ciclos rotos/s | 0.54 [0.29–0.80] | 0.49 [0.36–0.58] | 4/6 |
| mod. F0 8–30 Hz c | 35.01 [30.73–46.69] | 36.46 [29.74–47.59] | 2/6 |
| baja conf. % | 2.39 [1.94–2.86] | 2.22 [1.72–2.79] | 4/6 |
| ±10 c % | 52.86 [49.64–56.42] | 53.44 [51.04–56.50] | 2/6 |
| dist. nota c | 9.01 [7.67–10.13] | 8.64 [7.79–9.63] | 3/6 |
| saltos >1 st/s | 6.14 [5.50–6.58] | 5.94 [5.34–6.58] | 5/6 |
| salta-vuelve/s | 1.46 [1.23–1.73] | 1.32 [0.94–1.59] | 5/6 |
| peine dB | 1.80 [1.51–2.01] | 1.81 [1.57–2.02] | 3/6 |
| discont./s | 7.72 [6.91–8.84] | 7.67 [7.07–8.29] | 5/6 |


**Qué mejoró (6/6 en el archivo completo)**: ciclos glotales rotos 0.94 → 0.73/s, distancia a la nota
9.5 → 8.8 c, HNR 14.2 → 14.4 dB. En la ventana: saltos > 1 st y salta-vuelve más bajos en 5/6.
**Qué empeoró**: nada de forma consistente; shimmer +0.05 pp (4/6). Null test con corrección 0: 15
ventanas de 50 ms bajo 20 dB en el baseline, 16 en el nuevo (casi las mismas; la nueva en 26.3 s es la
suboctava descrita en E3).

**Qué no se puede determinar sin escucha**: si suena mejor, si el ataque se oye más limpio, si hay más o
menos sonido metálico, y si la diferencia con BandLab se oye. La referencia de BandLab es una grabación
de pantalla AAC (el códec cambia justo HNR y discontinuidades).

