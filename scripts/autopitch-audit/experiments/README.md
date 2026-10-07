# Experimentos del AutoPitch (E1–E6 y variantes)

Reporte: `../EXPERIMENTOS-2026-10-06.md`. Resultados crudos: `results/`.

- `make_variants.py baseline.js out/` — genera cada variante desde el motor baseline por sustitución
  exacta de texto (cada una cambia un solo mecanismo; falla si un ancla no existe).
- `run_variant.sh` — render con traza (`src/audio-engine/autopitch/pipelineTrace.test.ts`) y análisis
  por corrida: `detector_vs_references.py` (detector vs Praat+Harvest), `e3_output_pitch.py` (tono de
  la SALIDA vs el cantado: octava, cuadros rotos, saltos, salta-vuelve, distancia a la nota; global y
  primeros 50 ms de cada nota), `e2_discontinuities.py` (discontinuidades por causa).
- `multishift.py` — media y rango sobre 6 corridas con la entrada corrida 0/1/37/64/128/300 muestras.
  **Hace falta**: cualquier cambio de una decisión desplaza la fase de todas las marcas de síntesis y
  las métricas de una sola corrida varían tanto como el efecto que se busca medir.
- `e1_reference_synthesis.py`, `e1b_synthesis_by_region.py` — misma trayectoria de decisión
  sintetizada por Praat y WORLD (separa decisión de síntesis).
- `e5_epochs_vs_gci.py` — épocas del motor vs cierres glóticos (ZFF y Praat).
- La auditoría oficial sigue siendo `../analyze.py` (sin cambios entre versiones).

Requisitos Python: `praat-parselmouth pyworld pyloudnorm numpy scipy`.

Ejemplo (variante `look1`, entrada corrida 37 muestras):

```bash
python make_variants.py baseline.js variants/
AUDIT_DIR=/tmp/ap PY=venv/bin/python ./run_variant.sh look1_s37 variants/look1.js voz_s37.wav
cd /tmp/ap && python .../multishift.py base look1
```

- `where_off.py voz.wav salida.wav traza.json [clave]` — cuántos cuadros de la salida quedan a ±10 cents de
  la nota, separados en notas sostenidas, cambios de nota (±60 ms) y ataques (60 ms), con el perfil en el
  tiempo. **Usar una entrada sin silencio digital** (sumar ruido de −120 dB): en silencio el worklet duerme,
  su contador de muestras se detiene y la traza deja de coincidir con el tiempo del archivo.
  La traza acepta `AUTOPITCH_TRACE_PRESET=hardTune` (por defecto `classic`).
