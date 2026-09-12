"use client";

import { useEffect, useRef, useState } from "react";

export interface CurvePoint {
  id: string;
  /** Normalized 0..1 within the plotting area - the caller (EQ/ADSR/
   * compressor wrapper) maps its real domain (Hz, dB, seconds, ...) to/from
   * this range, so this component stays domain-agnostic. */
  x: number;
  y: number;
}

interface CurveEditorProps {
  width: number;
  height: number;
  points: CurvePoint[];
  onPointsChange: (points: CurvePoint[]) => void;
  /** Tap/click on empty canvas - omit to make the curve read-only/fixed-node-count (e.g. ADSR). */
  onAddPoint?: (x: number, y: number) => void;
  /** Double-click/tap an existing point - omit to make points undeletable. */
  onRemovePoint?: (id: string) => void;
  /** Drawn behind the curve every redraw - grid, frequency/dB labels, a
   * spectrum analyzer, whatever domain-specific backdrop the caller needs.
   * Keep it cheap; it reruns on every point drag. */
  drawBackground?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  curveColor?: string;
  pointColor?: string;
  /** "linear" connects points with straight segments (ADSR/automation-shaped
   * curves); "smooth" uses a Catmull-Rom spline (a filter/compressor
   * response should read as continuous, not a polyline). */
  curveStyle?: "linear" | "smooth";
  nodeRadius?: number;
  /** False for callers (EQ) that draw their own mathematically-accurate
   * curve in `drawBackground` and only want this component's node
   * dragging/hit-testing, not its generic point-interpolated curve too. */
  drawCurve?: boolean;
}

function catmullRomPoint(p0: CurvePoint, p1: CurvePoint, p2: CurvePoint, p3: CurvePoint, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  return { x, y };
}

/** Shared canvas node/curve editor backing EQ bands, ADSR envelopes, and
 * compressor transfer curves - see PROMPT_MAESTRO FASE 9 section 3. Stays
 * deliberately domain-agnostic (points are 0..1 normalized); each caller
 * supplies its own background renderer and x/y<->real-value mapping. */
export function CurveEditor({
  width,
  height,
  points,
  onPointsChange,
  onAddPoint,
  onRemovePoint,
  drawBackground,
  curveColor = "#f2ede4",
  pointColor = "#f2ede4",
  curveStyle = "smooth",
  nodeRadius = 6,
  drawCurve = true,
}: CurveEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    drawBackground?.(ctx, width, height);

    const sorted = [...points].sort((a, b) => a.x - b.x);
    if (sorted.length > 0) {
      const toPx = (p: CurvePoint) => ({ x: p.x * width, y: (1 - p.y) * height });

      if (drawCurve) {
        ctx.beginPath();
        const first = toPx(sorted[0]);
        ctx.moveTo(0, first.y);
        ctx.lineTo(first.x, first.y);
        if (curveStyle === "linear" || sorted.length < 3) {
          for (const p of sorted) {
            const px = toPx(p);
            ctx.lineTo(px.x, px.y);
          }
        } else {
          for (let i = 0; i < sorted.length - 1; i++) {
            const p0 = sorted[Math.max(0, i - 1)];
            const p1 = sorted[i];
            const p2 = sorted[i + 1];
            const p3 = sorted[Math.min(sorted.length - 1, i + 2)];
            const steps = 16;
            for (let s = 1; s <= steps; s++) {
              const pt = catmullRomPoint(p0, p1, p2, p3, s / steps);
              ctx.lineTo(pt.x * width, (1 - pt.y) * height);
            }
          }
        }
        const last = toPx(sorted[sorted.length - 1]);
        ctx.lineTo(width, last.y);
        ctx.strokeStyle = curveColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      for (const p of points) {
        const px = toPx(p);
        ctx.beginPath();
        ctx.arc(px.x, px.y, p.id === hoverId ? nodeRadius + 2 : nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = p.id === hoverId ? "#ffffff" : pointColor;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#0a0a0a";
        ctx.stroke();
      }
    }
  }, [points, width, height, drawBackground, curveColor, pointColor, curveStyle, nodeRadius, hoverId, drawCurve]);

  function toNormalized(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    return { x, y };
  }

  function hitTest(e: { clientX: number; clientY: number }): CurvePoint | null {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const hitRadius = Math.max(nodeRadius + 6, 22); // generous touch padding beyond the drawn dot
    let closest: CurvePoint | null = null;
    let closestDist = Infinity;
    for (const p of points) {
      const dx = p.x * width - px;
      const dy = (1 - p.y) * height - py;
      const dist = Math.hypot(dx, dy);
      if (dist <= hitRadius && dist < closestDist) {
        closest = p;
        closestDist = dist;
      }
    }
    return closest;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const hit = hitTest(e);
    if (!hit) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: hit.id, moved: false };
    setHoverId(hit.id);
  }

  /** How far outside the canvas (px) a drag has to go before it counts as
   * "throw it away" - per PROMPT_MAESTRO FASE 9 section 4: "arrastrar fuera
   * la elimina" (drag it out to delete), not a double-click on the node. */
  const REMOVE_MARGIN_PX = 40;

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) {
      setHoverId(hitTest(e)?.id ?? null);
      return;
    }
    dragRef.current.moved = true;
    const rect = canvasRef.current!.getBoundingClientRect();
    const outOfBounds =
      e.clientX < rect.left - REMOVE_MARGIN_PX ||
      e.clientX > rect.right + REMOVE_MARGIN_PX ||
      e.clientY < rect.top - REMOVE_MARGIN_PX ||
      e.clientY > rect.bottom + REMOVE_MARGIN_PX;
    if (outOfBounds && onRemovePoint) {
      onRemovePoint(dragRef.current.id);
      dragRef.current = null;
      setHoverId(null);
      return;
    }
    const { x, y } = toNormalized(e);
    onPointsChange(points.map((p) => (p.id === dragRef.current!.id ? { ...p, x, y } : p)));
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  /** Double-tap empty space creates a point; double-tap an existing point
   * also removes it (a forgiving second way in, alongside drag-out). */
  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const hit = hitTest(e);
    if (hit) {
      onRemovePoint?.(hit.id);
      return;
    }
    if (onAddPoint) {
      const { x, y } = toNormalized(e);
      onAddPoint(x, y);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      className="cursor-crosshair rounded bg-ink"
    />
  );
}
