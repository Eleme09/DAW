import { useEffect, useRef } from "react";

/** Runs `callback` every animation frame while `enabled` is true. */
export function useRafLoop(callback: () => void, enabled: boolean): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return;
    let frame: number;
    const tick = () => {
      callbackRef.current();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);
}
