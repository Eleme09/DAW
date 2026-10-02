"use client";

import { useEffect, useRef } from "react";

/**
 * Horizontal-axis twin of `useDraggableDb.ts`: for the charts that plot dB
 * along X (CompressorPanel's threshold marker, DeEsserPanel's frequency
 * band) rather than Y (Clipper/NoiseGate/Limiter's ceiling/threshold
 * line). Same `frac * w` convention those charts already draw with (left =
 * `min`, right = `max` - no Y-axis flip needed here, unlike the vertical
 * version), same stable-listener-plus-refs structure so a live meter's own
 * `useRafLoop` re-renders don't tear the drag down mid-gesture.
 */
export function useDraggableDbX(
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

    function valueFromClientX(clientX: number): number {
      const rect = canvas!.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const { min, max } = rangeRef.current;
      return min + frac * (max - min);
    }

    function onPointerDown(e: PointerEvent) {
      draggingRef.current = true;
      canvas!.setPointerCapture(e.pointerId);
      onChangeRef.current(valueFromClientX(e.clientX));
    }
    function onPointerMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      onChangeRef.current(valueFromClientX(e.clientX));
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
