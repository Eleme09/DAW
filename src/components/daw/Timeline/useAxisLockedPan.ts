"use client";

import { useEffect, useRef } from "react";

const LOCK_THRESHOLD_PX = 6;
/** Per-frame velocity multiplier for the fling after you lift your finger. */
const FRICTION = 0.94;
const MIN_FLING_VELOCITY = 0.05; // px per ms
const STALE_SAMPLE_MS = 80;

/**
 * One-finger panning for the phone Studio timeline that behaves like
 * BandLab's (and fixes what the user's screen recording of ours showed):
 *
 * - The gesture locks to ONE axis after a few px - horizontal moves through
 *   the song, vertical moves through the tracks - instead of iOS's free
 *   diagonal scroll, which dragged the ruler and track headers around.
 * - No rubber-band bounce: the native scroll is off (`touch-action: none`
 *   on the container), so the sticky ruler/header can never be pulled off
 *   their place and leave black gaps.
 * - A fling keeps going with friction, on the locked axis only.
 *
 * Two fingers are left to usePinchZoom. Elements marked `data-no-pan`
 * (a selected region, its trim circles, the cycle bar) own their drags.
 * A click right after a pan is swallowed so lifting the finger doesn't
 * also select/deselect whatever was under it.
 *
 * A horizontal pan is a "scrub" (moving through the song): `onScrubStart`
 * fires when the gesture locks to the horizontal axis and `onScrubEnd` once
 * the finger is up AND the fling has stopped (or the touch ends without
 * moving). Studio uses them to pause playback while you scrub and carry on
 * from the new spot, like dragging a video's progress bar.
 */
export interface PanScrubHandlers {
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

export function useAxisLockedPan(containerRef: React.RefObject<HTMLElement | null>, enabled: boolean, handlers: PanScrubHandlers = {}): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const pointers = new Set<number>();
    let active: {
      id: number;
      startX: number;
      startY: number;
      scrollLeft: number;
      scrollTop: number;
      axis: "x" | "y" | null;
      samples: { t: number; x: number; y: number }[];
    } | null = null;
    let momentumFrame = 0;
    let suppressClick = false;
    let scrubbing = false;
    /** A region picked up by a long press takes over the finger (CompactClipView). */
    const onCancelPan = () => {
      active = null;
      endScrub();
    };

    const startScrub = () => {
      if (scrubbing) return;
      scrubbing = true;
      handlersRef.current.onScrubStart?.();
    };
    const endScrub = () => {
      if (!scrubbing) return;
      scrubbing = false;
      handlersRef.current.onScrubEnd?.();
    };

    const stopMomentum = () => {
      if (momentumFrame) cancelAnimationFrame(momentumFrame);
      momentumFrame = 0;
    };

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      pointers.add(e.pointerId);
      stopMomentum();
      if (pointers.size > 1) {
        active = null; // pinch - usePinchZoom handles it
        return;
      }
      if ((e.target as HTMLElement).closest("[data-no-pan]")) return;
      active = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: el!.scrollLeft,
        scrollTop: el!.scrollTop,
        axis: null,
        samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
      };
      suppressClick = false;
    }

    function onPointerMove(e: PointerEvent) {
      if (!active || e.pointerId !== active.id) return;
      const dx = e.clientX - active.startX;
      const dy = e.clientY - active.startY;
      if (!active.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_THRESHOLD_PX) return;
        active.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        suppressClick = true;
        if (active.axis === "x") startScrub();
      }
      if (active.axis === "x") el!.scrollLeft = active.scrollLeft - dx;
      else el!.scrollTop = active.scrollTop - dy;
      active.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      if (active.samples.length > 8) active.samples.shift();
    }

    function onPointerUp(e: PointerEvent) {
      pointers.delete(e.pointerId);
      if (!active || e.pointerId !== active.id) {
        if (pointers.size === 0) endScrub();
        return;
      }
      const { axis, samples } = active;
      active = null;
      if (!axis || samples.length < 2) {
        endScrub();
        return;
      }
      const last = samples[samples.length - 1];
      // Finger held still before lifting = no fling (the last samples are
      // from a moment ago, their speed is stale).
      if (e.timeStamp - last.t > STALE_SAMPLE_MS) {
        endScrub();
        return;
      }
      const first = samples.find((s) => last.t - s.t <= 100) ?? samples[0];
      const dt = Math.max(1, last.t - first.t);
      let velocity = axis === "x" ? -(last.x - first.x) / dt : -(last.y - first.y) / dt;
      if (Math.abs(velocity) < MIN_FLING_VELOCITY) {
        endScrub();
        return;
      }
      let prev = performance.now();
      const step = (now: number) => {
        const elapsed = now - prev;
        prev = now;
        const before = axis === "x" ? el!.scrollLeft : el!.scrollTop;
        if (axis === "x") el!.scrollLeft += velocity * elapsed;
        else el!.scrollTop += velocity * elapsed;
        const moved = (axis === "x" ? el!.scrollLeft : el!.scrollTop) - before;
        velocity *= Math.pow(FRICTION, elapsed / 16.7);
        // Hit the start/end of the song or the tracks: nothing left to coast through.
        const stuck = Math.abs(velocity * elapsed) > 0.5 && Math.abs(moved) < 0.01;
        momentumFrame = !stuck && Math.abs(velocity) > MIN_FLING_VELOCITY ? requestAnimationFrame(step) : 0;
        if (!momentumFrame) endScrub();
      };
      momentumFrame = requestAnimationFrame(step);
    }

    function onPointerCancel(e: PointerEvent) {
      pointers.delete(e.pointerId);
      if (active?.id === e.pointerId) active = null;
      if (pointers.size === 0) endScrub();
    }

    function onClickCapture(e: MouseEvent) {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("daw-cancel-pan", onCancelPan);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      stopMomentum();
      endScrub();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("daw-cancel-pan", onCancelPan);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, [containerRef, enabled]);
}
