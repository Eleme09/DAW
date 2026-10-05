# BandLab — referencia investigada (no inventada)

Este documento es la base para reconstruir el DAW como BandLab. Todo lo que dice abajo
sale de fuentes reales, no de memoria ni suposición:

- **El centro de ayuda oficial completo de BandLab** (171 artículos, descargados por su API pública
  `help.bandlab.com/api/v2/help_center/...`; se leyeron completos los 77 de Studio: grabación, edición,
  efectos, mezcla, masterización, importar/exportar, proyectos, solución de problemas).
- Capturas oficiales de App Store / Google Play (pantallas Studio, Mix, Vocals, Mastering, Splitter).
- Blog oficial de BandLab (rediseño 10.0, guía de producción vocal) y reseña de Sound on Sound (2016).
- Guías de terceros de productores que usan BandLab en el teléfono (presets vocales).

**Lo que NO se pudo**: ver videos de YouTube/TikTok (este entorno no los reproduce) ni entrar al Studio
web en vivo (bloqueado por la red de este entorno). Si alguna parte necesita confirmación visual, se
pide un video/captura al usuario en vez de inventarla.

---

## 1. Estructura de la app (de afuera hacia adentro)

1. **Fuera del Studio**: Home / **Create** / **Library**.
   - *Library*: lista de proyectos. Cada proyecto tiene `⋯` → borrar (se recupera hasta 30 días),
     ajustes, descargar mezcla, historial de versiones.
   - *Create*: "Open Studio" + herramientas sueltas (Mastering, Splitter, Metronome, Tuner,
     AudioStretch, VoiceTrainer).
2. **Dentro del Studio: UNA sola pantalla**, no pestañas. La línea de tiempo siempre está ("Timeline is
   now present in every screen", BandLab 10.0). Todo lo demás se abre *sobre* ella o *debajo* de ella.

## 2. La pantalla del Studio (móvil)

- **Arriba**: salir (←), selector segmentado de 3 íconos, nube (guardar/publicar). Botón **Add Track**
  arriba a la izquierda, debajo de salir. **Settings (engranaje)** contiene: tempo, tonalidad, compás,
  metrónomo (sonido, volumen, **cuenta atrás configurable**), dispositivo de entrada, **Latency Fix**
  (test de latencia), Audio Safe Mode, tutoriales, reportar problema.
- **Regla de tiempo**: tiempo actual a la izquierda, **barra de ciclo roja** (tocar = activar loop,
  arrastrar asas = rango; cuando está activa la grabación siempre arranca al inicio del ciclo),
  imán de **snap-to-grid**.
- **Pistas**: cabecera (ícono, nombre, píldora Fx con el nombre del preset) + carril con regiones.
  Máx. 16 pistas, 15 minutos.
- **Abajo, paneles de la pista seleccionada**: pestaña **AutoPitch** (justo encima del botón grabar),
  pestaña **Fx/Effects** (librería de presets), pestaña **Editor/Source** (ganancia, pitch, velocidad
  de región; Retune).
- **Fila de transporte (abajo del todo)**: Mix View (ícono de faders), deshacer, volver al inicio,
  **GRABAR (círculo rojo grande)**, reproducir, rehacer, metrónomo/herramientas.
- **Mix View** (desde el ícono de faders, no una pestaña aparte): tiras de canal de color sólido con
  `+Fx`, `M`, `S`, `⋯` (Freeze, Exportar pista como audio, borrar), pan L/R; **AutoMix**; fila de
  **Mastering**; volumen master **debajo** de las pistas.

## 3. Cómo se toca una región (clip) — el modelo de interacción clave

1. **Tocar** la región → queda seleccionada: aparecen **círculos blancos** en inicio y fin (arrastrar =
   recortar/extender) y un ícono de **loop** arriba a la derecha.
2. Aparece la **barra de acciones de región** (Region Action Menu) con acciones rápidas en íconos:
   Borrar, Copiar, Pegar (en el cabezal), Slice (cortar en el cabezal), Loop, y **`⋯`**.
3. **`⋯`** abre el resto: Fade, Normalize, Reverse, **Shift** (±300 ms, para corregir latencia),
   Gain, **Transpose**, Timestretch, Denoise, Voice Cleaner, Splitter, Audio-to-MIDI, Merge,
   Remove Takes.
4. Cada acción con valor (Fade, Gain, Transpose, Shift, Loop ×4/×8/×16) **abre un deslizador abajo y
   un botón ✓ (Check)** para aplicar. No una hoja gigante con todo junto.
5. **Mantener presionado en un espacio vacío** = selección múltiple arrastrando (incluso entre pistas).
6. **Arrastrar** la región = moverla. Renombrar regiones solo existe en web.

## 4. Grabar

1. Add Track → **Voice/Audio**.
2. Settings → dispositivo de entrada; metrónomo y cuenta atrás.
3. **Monitoring** se activa por pista (ícono de audífonos). Recomiendan audífonos con cable; Bluetooth
   tiene latencia "impracticable" para grabar.
4. Botón grabar. Con **Cycle** activo, cada pasada crea una **toma (Take)** dentro de la misma región;
   botón **Takes** en la región muestra los carriles de tomas; tocar una toma la activa (comping).
5. Latencia: **Latency Fix** mide con el parlante y el micrófono (0–30 ms = manejable); BandLab
   compensa automáticamente la posición de lo grabado; **Shift** corrige regiones ya grabadas.
6. Ganancia de entrada recomendada: picos entre **−12 y −6 dB**.

## 5. AutoPitch (el "autotune")

- Por pista de voz, pestaña encima del botón grabar. Se graba **con** el efecto en tiempo real.
- **Efectos en 4 categorías**: Essentials (Classic, Duet, Big Harmony, Natural, Third, Chip),
  Hip Hop (Modern Rap, Stone, Yummy, Play Card, Ocean, Telephone), Hyperpop (Simulacrum, Ultrashift,
  Hyper, Bitz, Amped, AppleX), Sci-Fi (Robot, Futurescape, Krafty, Gorgon, Halo, Drone).
  Muchos son **armonías** (tercera abajo, cuarta arriba, octava abajo) mezcladas con la voz.
- **Level** (perilla de intensidad), **Key + escala** (arriba a la derecha), **AutoDetect Key**.
- Ajustes avanzados: algoritmo (Original / **Low-Latency** / **Formant-Preserving**), **Harmony Mix**.

## 6. Efectos

- Por pista: pestaña Fx → **librería de presets** (50+ vocales, 40+ guitarra, 20+ bajo) o
  **Add Effect** manual. Máx. 10 efectos por pista.
- Presets propios: `⋯` → Save As. **One Knob** (Brighter, Echo, Punchy, Room): una perilla que mueve
  una cadena entera.
- **Visual EQ**: 3 nodos que se arrastran (frecuencia + ganancia a la vez), pellizcar = ancho (Q),
  doble toque = desactivar nodo, espectro en tiempo real.
- Limpieza: **Denoise** (gratis, ruido constante) y **Voice Cleaner** (Noise Remover + DeReverb +
  AutoEQ, cada uno activable).

## 7. Automatización

- Botón **Automation** encima de las cabeceras de pista: muestra/oculta los carriles.
- Debajo de cada pista, un desplegable elige el parámetro (Volumen, Pan o un parámetro de un efecto
  ya cargado).
- Tocar la línea = agregar punto; arrastrar = mover; mantener en vacío = seleccionar varios;
  **doble toque = borrar**.

## 8. Masterización

- Desde Mix View → **Mastering**. Presets: **Universal** (dinámica orgánica + realce tonal),
  **Fire** (graves empujados sin tapar la voz), **Clarity** (agudos aireados + expansión ligera),
  **Tape** (saturación de cinta cálida); de pago: Natural, Cinematic, Spatial, Punch.
- **Input Gain** o **Auto Gain**, **Intensidad** (Light / Normal / Heavy), **EQ de master**
  Low/Mid/High, **Apply**.
- Regla de BandLab: la mezcla previa al master debe quedar entre **−8 y −4 dB** y sin clipear.

## 9. Importar / exportar / video

- Importar: Add Track → **Import Track** (selector de archivos). Formatos: MP3, **MP4 (video)**, WAV,
  M4A, AAC, OGG → del video se usa el audio.
- Exportar: mezcla (M4A/WAV), **cada pista por separado** (Mix View → `⋯` de la pista → Export as
  Audio), y video.

## 10. Flujo real de productores en el teléfono (fuentes de terceros)

- La mayoría graba con el mic del teléfono o AirPods → las cadenas vocales llevan **más limpieza de
  graves, más compresión y más reverb** que una cadena de estudio.
- Orden típico: **EQ (corte de graves 80–100 Hz) → compresor (3:1–5:1, ataque 1–30 ms, release
  30–200 ms, 3–6 dB de reducción) → de-esser → reverb/delay**.
- Presets "estilo artista" (Juice WRLD, Travis Scott, Don Toliver, Drake…) = la misma cadena con
  distintos valores, no efectos nuevos.

---

## 11. Diferencias con nuestro DAW (estado actual, honesto)

| BandLab | Nuestro DAW hoy |
|---|---|
| Studio = una sola pantalla con la línea de tiempo siempre | 5 pestañas abajo (Voz/Biblioteca/Sesión/Mezcla/FX) que reemplazan toda la pantalla |
| Panel de la pista seleccionada abajo (AutoPitch / Fx / Editor) | Efectos y voz en pestañas separadas |
| Mix View se abre desde el ícono de faders | Pestaña "Mezcla" |
| Tocar región → asas + barra de acciones + `⋯` + deslizador con ✓ | Tarjeta flotante con todos los controles juntos |
| Settings (engranaje) con tempo, tonalidad, metrónomo, cuenta atrás, entrada, latencia | Repartido en la hoja "⋯" del transporte |
| Add Track → Voz / Importar archivo (incl. video) / Sonidos | "+ Nueva pista" e importar en Biblioteca, por separado |
| AutoPitch con presets por categoría + key + nivel, grabando con él | Afinación como efecto insertado, presets sin categorías |
| Mastering con 4 presets + intensidad + EQ de 3 bandas | Asistente de LUFS dentro de "Mezcla IA" |
| Ciclo rojo en la regla + tomas por región | Región de loop + selector de tomas |
| Deshacer/rehacer siempre en el transporte | Escondidos en el "⋯" en móvil |

## 12. Plan de reestructuración (orden de trabajo)

1. **Studio de una sola pantalla (móvil)**: barra superior (salir, Add Track, nombre, Settings,
   guardar/exportar), línea de tiempo siempre, panel de pista seleccionada abajo, fila de transporte
   abajo (Mix View, deshacer, inicio, GRABAR, reproducir, rehacer). Se eliminan las 5 pestañas.
2. **Modelo de región**: selección con asas, barra de acciones, `⋯`, deslizador con ✓.
3. **Add Track**: Voz / Importar archivo (audio o video) / desde muestras guardadas.
4. **Settings**: tempo, tonalidad, compás, metrónomo, cuenta atrás, entrada, prueba de latencia.
5. **Mix View + Mastering** con presets Universal / Fire / Clarity / Tape + intensidad + EQ 3 bandas.
6. **Panel AutoPitch** con presets por categoría (incluidas armonías), key, nivel, AutoDetect.
7. **Automatización** al estilo BandLab (botón global, desplegable por pista, doble toque borra).
8. **Ciclo + tomas** al estilo BandLab.

## 13. Región (clip) — confirmado con videos del usuario (iPhone, BandLab en español)

- **Tocar región**: contorno blanco + bolita blanca en cada extremo (recortar/extender). Barra flotante oscura sobre la pista de arriba: **Eliminar · Copiar · Dividir (]|[) · Loop · Armonizar (Ai, Premium) · ⋯**. ⋯ se vuelve **^** y despliega: **Cambio › · Ganancia › · Normalizar 👑 · Transponer › · Expansión de tiempo › · Fade ›** | **Eliminación de ruido · Revertir**.
- **Acción con valor**: el transporte se reemplaza por un panel: valor arriba ("+114 ms", "+24.0 dB", "±0 semitonos"), deslizador (relleno morado desde cero, bola blanca), fila **▶ · nombre · ✓**. Cambio = ±300 ms (oficial). Ganancia llega a +24 dB. Transponer ±12. Expansión de tiempo: selector **0.50x / 1.00x / 2.00x** (2x = más rápido/corto). Fade: deslizador de dos bolitas y líneas blancas diagonales sobre la región.
- **Eliminación de ruido / Revertir**: inmediatos, aviso "Éxito". Deshacer = flecha a la izquierda de GRABAR.
- **Loop (centro de ayuda)**: 4, 8 o 16 veces desde el menú inferior; botón para desactivar; ✓ aplica. Dividir: en la línea de reproducción. Copiar → tocar donde pegar → Pegar.
- **Armonizar**: función de BandLab Max ("AI Harmonizer"); no hay documentación pública de su pantalla. Se implementó como un armonizador estándar (Antares Harmony Engine / Waves Harmony): tonalidad detectada + voces por intervalo diatónico + humanizar; cada voz en su pista.

## 14. Grabar y desplazarse — confirmado con videos del usuario (tema 2)

- **Botón del micrófono (fila inferior)**: abre el editor de la pista seleccionada: la pista sola y grande, línea de reproducción fija al centro, cabecera `nombre · 👑 Takes · ⓘ · ✕`, y debajo herramientas de voz `Retune 👑` y `Limpiador de voz 👑`.
- **Mientras graba**: la toma nueva crece en un tono pálido del color de la pista con la onda dibujándose en vivo; el botón GRABAR pasa a ser un círculo oscuro con un cuadrado rojo; reproducir y deshacer quedan desactivados; el ícono de audífonos se ilumina.
- **Barra de ciclo**: barra roja en la parte de arriba de la regla (rojo oscuro = apagado, rojo brillante = encendido). Con ciclo, la reproducción vuelve al inicio del ciclo; grabando, cada vuelta es una toma (centro de ayuda: Composite Recording).
- **Solo/Mute**: las pistas que no suenan (silenciadas, o porque otra está en solo) se ven en gris en la línea de tiempo.
- **Desplazamiento**: horizontal = moverse en la canción (con inercia), vertical = moverse entre pistas; la regla y la columna de pistas se quedan quietas. La vista de Mezcla entra deslizándose desde la izquierda.

## 15. AutoPitch — confirmado con videos del usuario (tema 4) + FAQ oficial

- **Abrir**: píldora AutoPitch de la fila inferior. Con el panel abierto, las pistas se ocultan y queda la regla arriba. Cabecera: `🎤 pista · [La mayor ˅] · [ajustes] · ✕`. Debajo: perilla grande (aro según categoría: Essentials ticks azules, Hip Hop llama roja, Hyperpop picos naranja, Sci-Fi onda turquesa), etiqueta "Lo más intenso" arriba del todo (en inglés "Heaviest"; "Heavy" a ~2/3; "Off" apagado). Al tocarla muestra "NN %". Pestañas Essentials/Hip Hop/Hyperpop/Sci-Fi y fila de círculos con ícono + nombre; el seleccionado en blanco. Cambiar de pestaña selecciona el primer efecto de esa categoría. La píldora muestra "On" + el ícono del efecto; tocarla con el panel abierto apaga/enciende (perilla gris, "Off").
- **Tonalidad**: fila de notas (Do … Si, desplazable), fila de escalas (Personalizado 👑, Cromática, Mayor, Menor, Pentatónica mayor, Pentatónica menor), botón "Detectar automáticamente la clave" → "Detectando clave..." + Cancelar → ✓ "Clave de pista detectada: E major" + Hecho. Personalizado: teclado de 12 notas para activar/desactivar.
- **Ajustes de AutoPitch** (botón de controles): Harmony Mix (0–100 %) y Algorithm (Original / Low-Latency / Formant-Preserving). En BandLab ambos son de pago; aquí no hay suscripción.
- **Qué hace cada efecto** (FAQ oficial, help.bandlab.com artículo 29099155628953): Classic = corrección clásica; Duet = armonía de dos tonos; Big Harmony = coro grande en la tonalidad; Natural = sutil pop moderno; Third = tercera abajo; Chip = capa aguda modulada tipo ardilla; Modern Rap = octava abajo; Stone = cuarta arriba; Yummy = quinta abajo (mumble rap); Play Card = octava y cuarta justa abajo + compresión fuerte; Ocean = tercera abajo cálida/soñadora; Telephone = lo-fi radio; Simulacrum = variación de Big Harmony; Ultrashift = quinta justa arriba + cuarta abajo; Hyper = distorsión + Duet; Bitz = bit-crush; Amped = filo robótico + distorsión suave + chorus estéreo; AppleX = cálido + tercera abajo sutil, muy ancho; Robot = vocoder; Futurescape = chorus + armonías; Krafty = autofilter + wah (electrónica icónica); Gorgon = una octava abajo + realces; Halo = acordes tipo sintetizador; Drone = capa de drone brillante y grave. BandLab NO publica el DSP: los números de cada receta son nuestros.
- **Medido en el audio del video del usuario**: con Classic al 100 % las notas quedan planas en escalones; al 61 %/17 % la voz se desliza entre notas (el nivel controla sobre todo la velocidad). Duet/Simulacrum abren mucho el estéreo (armonías paneadas); Modern Rap agrega una línea una octava abajo al centro.
- **Antares Auto-Tune** (manual de Auto-Tune Realtime Advanced): Retune Speed en ms (0 = efecto Auto-Tune, 10–50 natural), Flex-Tune (solo corrige cerca de la nota), Humanize (más lento solo en la parte sostenida de notas largas), Tracking (qué tan periódica debe ser la señal), Natural Vibrato. **Waves Tune Real-Time** (manual): Speed (15 ms por defecto) y Note Transition (120 ms) separados, Tolerance Cents/Time antes de pasar a la nota vecina, Correction % (no es mezcla seco/procesado), Formant corregido, Range por tipo de voz.

## 16. Letra y Ajustes (pestañas de arriba) — video del usuario (tema 4)

- Selector superior de 3: **onda** (Studio), **pluma** (letra/notas: regla arriba y página en blanco "Añade aquí letra/notas..."), **engranaje** (página de ajustes, sin regla). Con letra o ajustes se oculta la fila de la pista; el transporte queda.
- Ajustes de BandLab: Suscripción; **Ajustes del proyecto** (Tempo con − / número / + y "Pulsa Tempo", Marca de tiempo 4/4, Clave del proyecto); **Ajustes de Studio** (Mostrar acceso directo a los sonidos, Contar Off, Volumen de metrónomo 98 %, Overdub de MIDI, Cuantificar grabaciones MIDI, Dispositivo de entrada con rueda "Micrófono del iPhone", Canal de entrada); Captura de pantalla (marca de agua); Herramientas (Tuner); Ayuda. Por pedido del usuario se copió solo lo que este DAW usa (sin MIDI, sonidos, marca de agua, tuner ni ayuda) y se agregó Exportar.
