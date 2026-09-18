/** Starting zoom level and its bounds - the live value lives in
 * projectStore's `pixelsPerSecond` (view state, not project data, same
 * category as snapResolution), never read as a static constant anymore.
 * Every Timeline-family component reads that store field directly instead
 * of importing a fixed number, so there's exactly one time->pixel scale
 * for the whole timeline at any moment, not one per file. */
export const DEFAULT_PIXELS_PER_SECOND = 80;
export const MIN_PIXELS_PER_SECOND = 20;
export const MAX_PIXELS_PER_SECOND = 400;
/** Was 118 - TrackHeader packed its 5 controls (M/S/armar/monitor/más) plus
 * the name into a single row instead of two stacked ones (FASE B, densidad
 * visual tipo BandLab), so the row itself needs less height. Still leaves
 * TRACK_HEIGHT - 8 = 56px for a clip's waveform/notes, enough to read. */
export const TRACK_HEIGHT = 64;
export const HEADER_WIDTH = 192;
export const RULER_HEIGHT = 28;
export const MIN_TIMELINE_SECONDS = 60;
