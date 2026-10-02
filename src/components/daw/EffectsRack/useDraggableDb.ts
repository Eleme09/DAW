"use client";

import { useEffect, useRef } from "react";

/**
 * Makes a dB-axis canvas (the scrolling-level-history charts shared by
 * Clipper/NoiseGate/Limiter and friends) drag-settable: pointer position
 * maps straight to a dB value using the same `h - frac*h` convention those
 * charts already draw their threshold/ceiling line with - so the line
 * really is the control (zona 2/3 of "Cabina v2"), not a static readout
 * sitting next to a slider that's doing the actual work.
 *
 * Listeners are attached once (stable `canvasRef`, not every render) and
 * read `min`/`max`/`onChange` through refs kept fresh in a separate effect
 * - same split `usePinchZoom.ts` uses, and for the same reason: these
 * panels re-render on every `useRafLoop` tick (for the live level trace),
 * so an effect keyed to `[min, max, onChange]` would tear down and rebuild
 * the listeners ~60 times a second, dropping `draggingRef` mid-gesture.
 */
export function useDraggableDb(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  min: number,
  max: number,
  onChange: (db: number) => void
): void {
  const rangeRef = useRef({ min, max });
  const onChangeRef = useRef(onChange);
  const draggingRef = useRef(false);

  useEffect(() => {
    rangeRef.current = { min, max };
    onChangeRef.current = onChange;
  }, [min, max, onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function valueFromClientY(clientY: number): number {
      const rect = canvas!.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
      const { min, max } = rangeRef.current;
      return min + frac * (max - min);
    }

    function onPointerDown(e: PointerEvent) {
      draggingRef.current = true;
      canvas!.setPointerCapture(e.pointerId);
      onChangeRef.current(valueFromClientY(e.clientY));
    }
    function onPointerMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      onChangeRef.current(valueFromClientY(e.clientY));
    }
    function endDrag() {
      draggingRef.current = false;
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
    };
  }, [canvasRef]);
}
