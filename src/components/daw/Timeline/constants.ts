/** Starting zoom level and its bounds - the live value lives in
 * projectStore's `pixelsPerSecond` (view state, not project data, same
 * category as snapResolution), never read as a static constant anymore.
 * Every Timeline-family component reads that store field directly instead
 * of importing a fixed number, so there's exactly one time->pixel scale
 * for the whole timeline at any moment, not one per file. */
export const DEFAULT_PIXELS_PER_SECOND = 80;
export const MIN_PIXELS_PER_SECOND = 20;
export const MAX_PIXELS_PER_SECOND = 400;
export const TRACK_HEIGHT = 118;
export const HEADER_WIDTH = 192;
export const RULER_HEIGHT = 28;
export const MIN_TIMELINE_SECONDS = 60;
