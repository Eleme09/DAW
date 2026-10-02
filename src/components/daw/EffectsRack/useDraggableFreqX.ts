"use client";

import { useEffect, useRef } from "react";

/**
 * Log-frequency twin of `useDraggableDbX.ts`: for the spectrum charts that
 * plot Hz along X on a log scale (DeEsserPanel's/ExciterPanel's crossover
 * line - both already draw it with `Math.log10(freq/min)/Math.log10(max/min)`,
 * the standard "equal screen-space per octave" mapping any frequency axis
 * needs, since a linear Hz axis would cram the whole low end into a sliver
 * and waste most of the width on treble no one's listening to critically).
 * Same stable-listener-plus-refs structure as the other `useDraggableDb*`
 * hooks, for the same reason (these panels redraw continuously from a live
 * analyser).
 */
export function useDraggableFreqX(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  freqMin: number,
  freqMax: number,
  onChange: (freq: number) => void
): void {
  const rangeRef = useRef({ freqMin, freqMax });
  const onChangeRef = useRef(onChange);
  const draggingRef = useRef(false);

  useEffect(() => {
    rangeRef.current = { freqMin, freqMax };
    onChangeRef.current = onChange;
  }, [freqMin, freqMax, onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function valueFromClientX(clientX: number): number {
      const rect = canvas!.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const { freqMin, freqMax } = rangeRef.current;
      return freqMin * Math.pow(freqMax / freqMin, frac);
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
