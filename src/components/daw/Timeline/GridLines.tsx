"use client";

interface GridLinesProps {
  width: number;
  pixelsPerSecond: number;
}

/** Faint vertical second-lines - shared by a track's own clip lane and the
 * empty scroll space below the last track, so scrolling past your last
 * track continues into visible grid instead of a flat dead zone. Must be
 * rendered inside a `position: relative` parent with a real height (not
 * `height: auto`) - it positions each line with `h-full` off that parent. */
export function GridLines({ width, pixelsPerSecond }: GridLinesProps) {
  return (
    <>
      {Array.from({ length: Math.ceil(width / pixelsPerSecond) }, (_, i) => (
        <div key={i} className="pointer-events-none absolute top-0 h-full border-l border-surf" style={{ left: i * pixelsPerSecond }} />
      ))}
    </>
  );
}
