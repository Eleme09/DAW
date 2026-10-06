# Qué le falta a la app para venderla (análisis 2026-10-06)

Hecho revisando el código y lo probado en esta sesión. Lo que no pude comprobar va marcado como **no verificado**.

## 1. Bloqueantes: sin esto no se puede cobrar

1. **Probarla en un iPhone real.** Todo lo de audio se midió en Chromium y en Node. En tu iPhone hubo cortes, y no sé si ya se arreglaron. Si no suena estable en el teléfono, lo demás no importa. Falta medir:
   - CPU por pista: cada pista lleva su propia reverb y su propio delay; no hay bus compartido.
   - Latencia al monitorear.
   - Comportamiento con Bluetooth y en segundo plano.
2. **Quitar lo que es de BandLab y de artistas.** Hoy la app copia:
   - de BandLab: la distribución, el nombre "AutoPitch", los 25 nombres de sus presets (Classic, Duet, Big Harmony, Modern Rap, Play Card, Simulacrum, Gorgon…) y sus descripciones traducidas de su FAQ;
   - de artistas: los preajustes Fx muestran "Inspirado en Yeat / Ken Carson / Travis Scott / Future".

   Para uso personal da igual. Para vender es riesgo legal (marca, textos con derechos, uso del nombre de artistas). Hay que renombrar y reescribir todo eso con identidad propia, como se hizo ahora con los efectos.
3. **Cuentas y nube.** Todo vive en el navegador (IndexedDB). Si el usuario borra Safari o cambia de teléfono, pierde sus canciones. Supabase está solo de andamio: el esquema no está aplicado y no hay login.
4. **Que sea una app de tienda o, al menos, una PWA completa.**
   - Hoy es una web.
   - El manifiesto dice "Personal AI DAW" y el ícono es solo SVG (iOS pide PNG).
   - No hay service worker: no funciona sin internet.
   - Para App Store / Play hay que envolverla (Capacitor o similar) y volver a probar el audio dentro del envoltorio.
5. **Cobro.** No hay pagos, suscripción ni límites entre gratis y Pro.
6. **Costos del asistente IA.** Cada pregunta al asistente cuesta dinero de API. Con usuarios de pago hace falta controlarlo: límite por usuario y que el servidor pague y cuente cada uso.
7. **Papeles.** Faltan política de privacidad, términos y el texto del permiso de micrófono. El asistente manda datos a un servicio externo; hay que decirlo.

## 2. Lo que un usuario espera y no está

- **Exportar MP3/M4A y compartir directo** (WhatsApp, Instagram, TikTok). Hoy solo hay WAV, que pesa mucho y no se manda fácil.
- **Video para redes**: la canción con forma de onda o portada animada en formato vertical. Para raperos que publican en Reels/TikTok es probablemente la función que más usuarios trae. BandLab tiene algo parecido.
- **Masterización de un toque** (tema 5 pendiente): estilos tipo cálido, brillante o fuerte, con intensidad. Hoy hay un asistente de mastering por reglas, no un botón final claro.
- **Plantillas de inicio**: "Graba tu primer tema", con beat de ejemplo, pista de voz armada y cadena lista. Reduce el abandono del primer día.
- **Beats y loops incluidos.** Sin beat propio no se puede empezar. Hay generador de beats por reglas, pero no una biblioteca de loops/beats de calidad.
- **Afinación manual por nota** (estilo Melodyne): diferencial premium. Pendiente (#75).
- **Biblioteca de proyectos completa** (tema 8): carpetas, buscar, duplicar, versiones.
- **Escritorio**: la vista de computadora sigue con el rack viejo de efectos. Hay que unificarla o decir que es solo para móvil.

## 3. Calidad técnica

- **Errores y analítica**: no hay reporte de fallos (Sentry o similar) ni métricas. Con usuarios reales no sabrías qué falla en sus teléfonos.
- **Pruebas automáticas de la interfaz**: los scripts de Chromium de esta sesión viven fuera del repo y no hay CI. Hay que pasarlos al repo y correrlos en cada cambio.
- **Bugs conocidos del afinador** (documentados en PROGRESS):
  - lee el 3.er armónico en algunas vocales;
  - una octava equivocada puede quedar pegada ~0.6 s;
  - el lookahead metió una suboctava de 0.2 s en una prueba.
- **Picos**: con tomas muy calientes, los presets con armonías pasan de 0 dBFS a la salida del AutoPitch. Sin un limitador en el master, puede recortar al final.
- **Android de gama baja**: nunca probado.
- **Idioma**: mezcla de español con nombres en inglés (Hip Hop, Hyperpop, nombres de presets). Para crecer fuera de LatAm hace falta versión en inglés.

## 4. Marca y diseño

- **Nombre, logo e íconos**: "Personal AI DAW" no es una marca.
- **Coherencia visual**: Fx ya tiene identidad propia (cósmica). El inicio, el timeline y la mezcla siguen siendo copia visual de BandLab. Hay que pasar todo por el mismo lenguaje.
- **Íconos del AutoPitch**: siguen dibujados a partir de los de BandLab.

## 5. Negocio (para discutir, no son datos verificados)

- **Posicionamiento posible**: "el estudio para rap y trap latino desde el celular, pensado para grabar con audífonos". Las cadenas para tomas de celular son un diferencial real frente a apps genéricas.
- **Modelo posible**:
  - **Gratis**: pocos proyectos, exportar MP3, presets básicos.
  - **Pro (mensual)**: todos los presets y efectos, WAV y pistas separadas, asistente IA, nube, video para redes.

  No tengo precios verificados de la competencia (BandLab es gratis; Voloco y otras cobran suscripción). Hay que revisarlos antes de fijar el tuyo.

## Orden recomendado

1. iPhone real: cortes, CPU y latencia. Si hace falta, bus compartido de reverb/delay.
2. Identidad propia: renombrar presets de AutoPitch, quitar textos de BandLab y nombres de artistas, nombre de marca e íconos.
3. Cuentas + nube + exportar MP3 + compartir.
4. Masterización de un toque + plantillas de inicio + beats incluidos.
5. App de tienda (envoltorio) + pagos + reporte de errores. Después, video para redes y anuncios.
