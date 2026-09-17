"use client";

import { useEffect, useRef } from "react";
import { HEADER_WIDTH } from "./constants";

/** Two-finger pinch-to-zoom on `containerRef`'s content, anchored so the
 * point between the fingers stays under them instead of the timeline
 * visually jumping on every pinch (a naive "zoom always from the left
 * edge" implementation). Native pointer listeners on the DOM node itself
 * (not React's synthetic handlers) so tracking an arbitrary number of
 * simultaneous touches by pointerId is straightforward. Requires the
 * container's CSS `touch-action` to exclude pinch-zoom (e.g. `pan-x
 * pan-y`), or the browser's own page-zoom gesture fights this one. */
export function usePinchZoom(
  containerRef: React.RefObject<HTMLElement | null>,
  value: number,
  onChange: (value: number) => void
): void {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const startDistance = useRef(0);
  const startValue = useRef(value);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  }, [value, onChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function distanceOf(pts: { x: number; y: number }[]): number {
      const [a, b] = pts;
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType !== "touch") return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        startDistance.current = distanceOf([...pointers.current.values()]);
        startValue.current = valueRef.current;
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size !== 2 || startDistance.current <= 0 || !el) return;

      const pts = [...pointers.current.values()];
      const distance = distanceOf(pts);
      const ratio = distance / startDistance.current;
      const nextValue = startValue.current * ratio;

      const rect = el.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2;
      const localX = midX - rect.left;
      const timeAtMid = (el.scrollLeft + localX - HEADER_WIDTH) / valueRef.current;

      onChangeRef.current(nextValue);
      // The store setter clamps nextValue to [MIN,MAX]; re-reading the
      // actually-applied value isn't available synchronously here, so this
      // anchors using the requested value - a tiny drift right at the zoom
      // extremes, harmless since the clamp itself is what stops the zoom.
      el.scrollLeft = Math.max(0, timeAtMid * nextValue + HEADER_WIDTH - localX);
    }

    function endPointer(e: PointerEvent) {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) startDistance.current = 0;
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endPointer);
    el.addEventListener("pointercancel", endPointer);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endPointer);
      el.removeEventListener("pointercancel", endPointer);
    };
  }, [containerRef]);
}
