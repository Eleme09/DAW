# Auditoría A/B del AutoPitch

Mide, etapa por etapa y contra el archivo ORIGINAL, qué le hace el pipeline a una voz real. No sustituye la escucha: da números y extractos igualados en volumen para que una persona compare.

- `src/audio-engine/autopitch/pipelineAudit.test.ts`: renderiza con el worklet real (`detect` = corrección 0, `min` = 10 %, `full` = Classic 100 %). Se salta si no hay `AUTOPITCH_AUDIT_INPUT`.
- `analyze.py`: formato (sample rate, bits, canales, duración), nivel (RMS, LUFS BS.1770, peak, true peak, crest, clipping, DC, correlación L/R), null test (SNR), espectro (energía por banda, centroide, planitud, flujo, ZCR), F0 con Praat (error vs original y vs la escala, saltos, idas y vueltas, cuadros de baja confianza, modulación artificial 8–30 Hz), jitter/shimmer/HNR, formantes F1–F3, y medidas de artefactos (ciclos glotales rotos, filtro peine, modulación granular, transitorios, discontinuidades y su relación con los bloques de 128 muestras, aliasing arriba de 16 kHz, contraste armónico). Marca automáticamente lo que cambia de forma anormal y escribe `metrics.json` + extractos WAV.

Requisitos: `pip install praat-parselmouth pyloudnorm numpy scipy`. Uso: ver el final de `REPORTE-2026-10-06.md`.

Experimentos por componente (decisión vs síntesis, discontinuidades por causa, octava al ataque, micro-transición, épocas vs cierres glóticos, crossfade) y variantes del motor medidas en 6 corridas: `experiments/` y `EXPERIMENTOS-2026-10-06.md`.
