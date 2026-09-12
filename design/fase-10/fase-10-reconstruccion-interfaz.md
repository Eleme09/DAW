# FASE 10 — RECONSTRUCCIÓN DE INTERFAZ (bloqueante, reemplaza a la Fase 9)

> Esta fase tiene una **referencia visual obligatoria**: el archivo `estudio-ui.html` que acompaña a este documento. No es inspiración. Es el destino. Léelo entero antes de escribir una línea.

---

## 1. ESTADO MEDIDO HOY (12/09/2026, deploy en producción)

Lo que sí mejoró desde la última auditoría:

| Medida | Antes | Ahora |
|---|---|---|
| `<canvas>` | 0 | 2 |
| `input[type=range]` nativos | 20 | 0 |
| `<select>` nativos | 5 | 0 |
| Botones < 44 px | 25 / 68 | 4 / 35 |

Lo que sigue roto y es inaceptable:

1. **Bug de desplazamiento.** El contenedor raíz (`flex h-screen flex-col overflow-hidden`) mide **1207 px dentro de una ventana de 1026 px**. Hay barra de scroll horizontal en el cuerpo de la app. Un DAW con scroll lateral en su propio marco no se puede usar. Corregir el ancho del contenedor raíz y de la barra superior; el único scroll horizontal permitido es el de la línea de tiempo.
2. **Toda la interfaz está en inglés.** "Export", "Save Project", "No tracks yet", "Start with one of these", "Add Track", "Snap". El usuario objetivo es hispanohablante. **Traducir el 100% de la interfaz al español**, con vocabulario de músico, no traducción literal: *Grabar, Reproducir, Nueva pista, Compás, Ajuste a rejilla, Exportar, Mezcla, Afinación, Efectos, Tomas, Fundido, Ganancia, Normalizar, Transponer*.
3. **La interfaz sigue siendo genérica.** Tipografía por defecto de Next.js (Geist), botones que son rectángulos grises con texto, cero color, cero iconografía, cero dibujo. Un usuario que viene de FL Studio o BandLab lo abre y lo cierra en cinco segundos.
4. **Duplicación de controles.** "+ Add Track" aparece dos veces en la misma pantalla (estado vacío y barra inferior). Un control, un sitio.

---

## 2. LA REFERENCIA ES UN ARCHIVO, NO UNA DESCRIPCIÓN

Se adjunta `estudio-ui.html`: seis pantallas construidas y funcionando (Sesión, Clip, Mezcla, Efectos, Afinación, Nueva pista), con formas de onda dibujadas en canvas, curva de EQ sobre espectro, mando radial de afinación, color por pista y copia en español.

**Instrucciones sobre ese archivo:**

- Léelo completo. Extrae de él los tokens de color, la escala tipográfica, los tamaños, los radios, las densidades y el conjunto de iconos SVG.
- Reproduce esas seis pantallas en la app real, conectadas al motor de audio existente.
- Si una decisión visual del archivo choca con algo ya construido, **gana el archivo**.
- No "te inspires". No propongas una alternativa. Reprodúcelo y luego amplíalo al resto de pantallas con el mismo sistema.

Puntos no negociables que salen de ahí:

- **Tipografía**: Archivo para interfaz, JetBrains Mono para todo número (tiempo, dB, Hz, compás). Nunca la fuente por defecto.
- **Color por pista**: seis colores fijos. El color de una pista viaja a su cabecera, su forma de onda, sus chips, su fila del mezclador y su menú contextual. Fondo de cabecera = color al 14 % de opacidad.
- **Forma de onda dibujada en canvas en todos los clips.** Sin esto no hay producto.
- **Transporte inferior** con botón de grabación rojo, circular, de 52 px, centrado.
- **Barra contextual de pista** siempre visible: entrada, efectos, afinación, herramienta de corte y monitorización.
- **Hojas deslizables** en vez de cambiar de pestaña.
- **Iconos SVG propios** en todo. Cero emojis en la interfaz.

---

## 3. CADA EFECTO SE MODELA SOBRE EL MEJOR DE SU CATEGORÍA

Para cada efecto, estudia el producto de referencia y **replica su modelo de interacción y su información en pantalla**: qué se dibuja, qué se puede arrastrar, qué se lee sin tocar nada.

| Efecto | Referencia del sector | Qué hay que replicar |
|---|---|---|
| Ecualizador | FabFilter Pro-Q | Curva sobre espectro en vivo, nodos arrastrables en frecuencia/ganancia, Q por gesto, rejilla etiquetada |
| Compresor | FabFilter Pro-C / Waves CLA | Curva de transferencia con punto de operación en vivo + medidor de reducción de ganancia |
| Limitador | FabFilter Pro-L | Medidor de sonoridad (LUFS) y de reducción, techo visible |
| Puerta de ruido | FabFilter Pro-G | Umbral dibujado sobre la señal entrante, indicador de apertura |
| De-esser | FabFilter Pro-DS | Banda de detección visible sobre el espectro |
| Reverberación | Valhalla Room / Pro-R | Cola de decaimiento dibujada, tamaño de espacio como gráfico |
| Delay | Soundtoys EchoBoy | Ecos sobre rejilla de tempo, divisiones musicales, realimentación visual |
| Saturación | Soundtoys Decapitator | Curva de distorsión + comparación de espectro antes/después |
| Imagen estéreo | iZotope Ozone Imager | Vectorscopio y correlación estéreo |
| Masterización | iZotope Ozone | Módulos encadenados + asistente que propone y el usuario aplica |
| Sintetizador | Vital / Surge (código abierto) | Forma de onda dibujada, envolventes editables con nodos, filtro con curva |
| Sampler | Koala Sampler | Forma de onda con marcadores de inicio/fin/bucle, pads, troceado por gesto |
| Afinación | Auto-Tune Pro / Melodyne | Nota detectada vs. objetivo en vivo, teclado de escala, corrección gráfica |

**Límite legal, y es real:** se replica **cómo funciona y qué muestra**, nunca la apariencia de marca. Prohibido copiar el aspecto distintivo, los colores propios, los logotipos, los nombres comerciales o el arte de un plugin concreto. Nada en la app se llama "Pro-Q", "Auto-Tune" ni lleva su imagen. Nuestros efectos tienen nombres propios en español y la identidad visual del archivo de referencia. Vital y Surge son de código abierto y sirven además como referencia técnica legítima del procesamiento.

---

## 4. AFINACIÓN: LOS MODOS QUE HAY QUE IMPLEMENTAR

No es un efecto: es una familia. El panel de Afinación debe ofrecer estos modos, seleccionables:

1. **Corrección por escala** — el modo base. Tonalidad, escala, velocidad de corrección (retune), intensidad, humanize, preservación de formantes.
2. **Corrección dura** — velocidad de retune a cero. El sonido "trap / T-Pain". Preset propio, de un toque.
3. **Corrección natural** — retune lento, conserva vibrato y transiciones. Para que no se note.
4. **Corrección gráfica** — editar la curva de afinación nota a nota sobre la forma de onda, arrastrando. Es lo que hace Melodyne y lo que separa una herramienta seria de un juguete.
5. **Cambio de tono fijo** — transposición en semitonos, con y sin corrección de formantes.
6. **Formantes / timbre** — modificar el carácter de la voz sin cambiar la nota.
7. **Armonizador** — genera voces adicionales en terceras, quintas u octavas dentro de la escala.
8. **Doblaje** — duplica la toma con micro-variaciones de tiempo y afinación.
9. **Vocoder / robot** — efecto extremo, como preset diferenciado.
10. **Control por notas** — la corrección sigue notas escritas en el piano roll en vez de la escala.

Todos comparten un mismo panel: mando radial de intensidad, tonalidad y escala arriba, familias en píldoras y estilos con icono debajo, y desviación en cents en vivo. Es un insert más de la cadena: se guarda, se automatiza, se hace bypass.

---

## 5. GRABAR TIENE QUE FUNCIONAR ANTES QUE NADA

Prioridad absoluta, por encima de cualquier función nueva. Una app de música en la que grabar no funciona bien no tiene ningún otro mérito que valga.

- Control de **monitorización** de tres estados por pista (apagada / automática / siempre).
- Conmutadores para **apagar** cancelación de eco y supresión de ruido. Hoy se aplican sin que el usuario decida y destruyen una toma musical.
- **Medidor de entrada** con detección de saturación antes de pulsar grabar.
- **Cuenta atrás** y metrónomo audible con acento.
- **Compensación de latencia** medida y aplicada a la toma grabada.
- **Tomas** apiladas en la misma pista y comping para armar la definitiva.
- Aviso de realimentación si se monitoriza por altavoz.

Criterio de cierre de esta sección: grabar una voz sobre un beat desde un teléfono, escucharse mientras se graba, elegir la mejor toma y que quede alineada. Si eso falla, la fase no avanza.

---

## 6. ORDEN DE TRABAJO

Una subfase por sesión. No se pasa a la siguiente sin cumplir su criterio.

**10A — Higiene.** Arreglar el desbordamiento del contenedor raíz. Traducir el 100 % de la interfaz al español. Eliminar controles duplicados. *Criterio: cero scroll horizontal en el cuerpo, cero texto en inglés.*

**10B — Sistema.** Tokens, tipografía (Archivo + JetBrains Mono), paleta de pista, set de iconos SVG, componentes base (mando, fader, medidor, hoja, chip, píldora, control segmentado) extraídos del archivo de referencia. *Criterio: los seis componentes existen y están usados; ninguna fuente por defecto.*

**10C — Sesión.** Reconstruir la línea de tiempo según la pantalla 1: color por pista, formas de onda en canvas, regla en compases, barra contextual, transporte. *Criterio: comparación lado a lado con la referencia sin diferencias estructurales.*

**10D — Grabación.** Todo el punto 5. *Criterio: el de cierre del punto 5.*

**10E — Clip y hojas.** Pantalla 2: tocar el clip abre acciones y ajustes sin cambiar de pestaña. *Criterio: ninguna operación sobre algo visible exige navegar.*

**10F — Efectos.** Pantalla 4 + un efecto por lote, cada uno con su visualización según la tabla del punto 3. *Criterio: ningún panel sin dibujo.*

**10G — Afinación.** Pantalla 5 + los diez modos del punto 4.

**10H — Mezcla y nueva pista.** Pantallas 3 y 6.

**10I — Auditoría.** Pantalla por pantalla contra la referencia, en un teléfono real.

---

## 7. CÓMO SE REPORTA

Al cerrar cada subfase:

- Valores medidos, no afirmaciones ("canvas: 14", "textos en inglés: 0", "overflow horizontal: 0").
- Captura de cada pantalla tocada.
- Qué quedó fuera y por qué.

Si algo del archivo de referencia no se puede reproducir por una limitación real, dilo con el motivo técnico concreto. No lo sustituyas en silencio por una versión más simple.
