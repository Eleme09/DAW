# REFERENCIAS VISUALES — Instrucciones para Claude Code

> Este documento **no describe** el diseño. Te dice **qué mirar**. En la carpeta `referencias/` hay capturas reales. Ábrelas con la herramienta `Read` antes de escribir una sola línea de interfaz. Si tienes navegador disponible, abre también los enlaces del punto 4.

---

## 1. MIRA ESTAS IMÁGENES PRIMERO

Todas son de **BandLab Studio en iPhone**, que es el competidor directo. Están en `referencias/`.

| Archivo | Qué tienes que sacar de ahí |
|---|---|
| `01-pistas-barra-contextual.jpg` | Estructura de la sesión: cinco pistas, cada una con su color, forma de onda grande y saturada sobre negro, chip de efectos bajo el nombre. Abajo, la **barra contextual de pista**: entrada, Fx, AutoPitch, herramienta, auriculares. Y el transporte con el botón rojo grande. Fíjate en la **densidad**: cabe mucho y no agobia. |
| `02-panel-efecto-puerta.jpg` | Anatomía de un panel de efecto: cabecera con interruptor, información y borrar; parámetro = etiqueta a la izquierda, **valor en caja a la derecha**, slider debajo ocupando todo el ancho. Arriba, el **rack horizontal** de la cadena y un control global de mezcla. |
| `03-panel-efecto-pitch.jpg` | Otro efecto con el mismo esqueleto. El subtítulo bajo el nombre dice el tipo ("Vintage Aural Exciter"). Los desplegables van a la derecha, no ocupan una línea propia. A la izquierda se ve una **escala de frecuencias vertical** del EQ. |
| `04-clip-acciones-menu.jpg` | **Lo más importante de todo.** Al tocar un clip aparece una barra flotante pegada a él: borrar, duplicar, dividir, bucle, IA, más. Y el menú: Cambio, Ganancia, Normalizar, Transponer, Expansión de tiempo, Fade, Eliminación de ruido, Revertir. Esto es lo que hay que replicar en comportamiento. |
| `05-mezclador-linea.jpg` | El mezclador **no son columnas verticales**. Es una lista: número, nombre, chip Fx, M, S, menú, fader horizontal con medidor y mando de panorama. Abajo, AutoMix con etiqueta IA y Masterización con interruptor. |
| `06-masterizacion-presets.jpg` | Presets de masterización como **tarjetas con icono vectorial a color** y nombre corto: Universal, Fuego, Claridad, Cinta. El activo lleva borde. Así se presenta una función de IA. |
| `07-nueva-pista.jpg` | Hoja de nueva pista: icono redondo a color + nombre + **una línea que explica para qué sirve**, en lenguaje humano. Voz/Audio, Guitarra, Bajo, Looper, Instrumentos virtuales, Sampler, Caja de ritmos. |
| `08-autopitch-mando.jpg` | El **mando radial** de afinación: círculo grande con marcas radiales de color que varían según el estilo, etiqueta debajo, selector de tonalidad arriba, familias en píldoras y estilos con icono abajo. Es el control más vistoso de toda su app. |
| `09-preajustes-portada.jpg` | Preajustes de efectos con **arte de portada** (imágenes), pestañas Mis preajustes / Nuevo / Recomendado, y botones "Generar IA" y "Crear". |
| `10-menu-pista.jpg` | Menú de pista que **hereda el color de cada pista**: Efectos, Duplicar, Subir, Bajar, Contraer, Congelar, Renombrar, Cambiar color, Exportar como audio, Eliminar. |
| `11-proyecto-versiones.png` | Pantalla de proyecto: versión actual, historial de versiones con fecha, y acciones (publicar, descargar, masterizar, abrir en Studio). |
| `12-biblioteca.png` | Biblioteca de proyectos: lista simple con miniatura, nombre, autor y fecha relativa ("Hace 3 días"). |
| `00-hoja-contacto-*.jpg` | Tres hojas de contacto con los recorridos completos, por si necesitas ver la secuencia de una interacción. |

**Cómo usarlas:** son referencia de **estructura, densidad, jerarquía y comportamiento**. NO de identidad visual. Nuestra identidad es la del archivo `estudio-ui.html` (chasis monocromo de grafito y hueso, color sólo en la señal). Si copias la apariencia de BandLab, el resultado es un clon barato y el proyecto no sirve.

---

## 2. LA REFERENCIA DE IDENTIDAD ES NUESTRA

Archivo `estudio-ui.html`. Ábrelo y léelo entero. De ahí salen:

- Paleta: chasis `#0A0A0B` / `#111112` / `#18181A`, líneas `#26262A`, hueso `#F2EDE4` / `#9A968E` / `#5E5B57`, grabación `#E5243B`, señal viva `#8FB89A`, y cinco colores de señal desaturados (`#E8C15C`, `#C97064`, `#7FA8C9`, `#B294C4`, `#6E6E74`).
- Tipografía: **Bricolage Grotesque** (títulos y cifras grandes), **Instrument Sans** (interfaz), **DM Mono** (todo valor medido).
- Radios de 2–3 px. Nada de 14 px: las esquinas muy redondeadas hacen que parezca app de consumo.
- El color de pista aparece como **barra de 3 px en el canto de la cabecera**, no tiñendo el fondo entero.
- Cinco pantallas construidas: Voz, Sesión, Efecto, Afinación, Mezcla.
- La sección "Anatomía de un plugin profesional": diez zonas que comparten los quince efectos.

---

## 3. QUÉ SE TOMA DE CADA DAW (y qué se deja)

### Pro Tools — precisión de grabación y edición

**Se toma:** monitorización de entrada como botón propio por pista (el botón `I`); tomas apiladas y comping; fundidos, crossfades y ganancia de clip independiente del fader; regla en compases con cabeza de reproducción fina; envíos a un bus de reverb compartido; nomenclatura seria (pista, clip, toma, bus).

**No se toma:** ventanas separadas de edición y mezcla; automatización por nodos; Elastic Audio; playlists de edición; todo el sistema de I/O configurable. Son de escritorio y no aportan a una voz grabada en un teléfono.

### FL Studio — creación musical

**Se toma:** el modelo de **patrones** (un bloque musical que se coloca en el arreglo); el browser de sonidos con previsualización; la cadena de efectos visible y reordenable en el canal.

**No se toma (todavía):** piano roll completo, step sequencer, sintetizadores propios, arreglador de escenas. Son meses de trabajo que no mejoran ni una toma de voz. Se cubren con bucles y beats prehechos hasta que el núcleo funcione.

### BandLab — ergonomía móvil

**Se toma:** tocar el objeto abre sus opciones; barra contextual de pista siempre visible; presets de un toque con nombre de músico; AutoPitch con tonalidad, familias y estilos por sonido; masterización como acción única con presets; proyectos en nube con historial de versiones; arranque en menos de 30 segundos.

**No se toma:** el aspecto (multicolor plano, esquinas muy redondeadas); la red social y el muro de descubrimiento; Video Mix; el muro de pago con corona en cada esquina.

---

## 4. ENLACES PARA MIRAR (si tienes navegador)

- BandLab AutoPitch, los 24 efectos y sus controles — https://blog.bandlab.com/autopitch-vocal-effects-guide/
- BandLab AutoPitch, guía de uso — https://help.bandlab.com/hc/en-us/articles/360034710974-Using-AutoPitch
- BandLab Studio móvil, vídeo oficial — https://blog.bandlab.com/studio-video-tutorial-mobile/
- BandLab, guía de producción vocal — https://blog.bandlab.com/vocal-production-guide-bandlab/
- Pro Tools, ventana de edición (Avid) — https://www.avid.com/pro-tools/user-guide/edit-window
- FL Studio, interfaz general — https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/basics_interface.htm
- FL Studio Mobile, manual completo — https://www.image-line.com/fl-studio-learning/fl-studio-mobile-online-manual
- FL Studio Mobile, mezclador — https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/plugins/FL%20Studio%20Mobile_Mixer.htm

Para los plugins, mira las páginas de producto de FabFilter (Pro-Q, Pro-C, Pro-L, Pro-G, Pro-DS), iZotope (Ozone) y Soundtoys (Decapitator, EchoBoy). Fíjate sólo en **qué dibujan y qué se puede arrastrar**. Nombres, colores y aspecto de marca no se copian: nuestros efectos llevan nombre en español y la identidad de `estudio-ui.html`.

---

## 5. EL FILTRO PARA TODO LO DEMÁS

Una sola pregunta antes de construir cualquier cosa:

> **¿Sirve para que una voz grabada en un teléfono suene bien sin que el usuario sepa mezclar?**

Si la respuesta es no, se aplaza. Aunque Pro Tools, FL Studio y BandLab lo tengan los tres.

Orden de prioridad, de arriba abajo:

1. Grabar bien: monitorización, medidor de entrada, latencia compensada, tomas.
2. Afinar: corrección con tonalidad, estilos, comparación.
3. Mezclar solo: cadena vocal automática con IA, antes/después con volumen igualado, explicación en una frase de qué cambió.
4. Sonar publicable: masterización con objetivo de sonoridad, exportación.
5. Todo lo demás.
