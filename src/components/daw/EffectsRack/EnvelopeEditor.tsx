"use client";

import { useCallback } from "react";
import { adsrLevel, adsrTotalSec, SUSTAIN_HOLD_SEC } from "@/audio-engine/waveformShapes";
import { CurveEditor, type CurvePoint } from "../ui/CurveEditor";

const WIDTH = 300;
const HEIGHT = 110;
const MIN_WINDOW_SEC = 1.5;
const CURVE_STEPS = 100;
// Headroom beyond the current attack+decay+hold+release: without it the
// release node would sit exactly at x=1 (the canvas's right edge), and
// CurveEditor clamps drag position to [0,1] - so it could only ever be
// dragged inward (shorter release), never outward. The padding leaves
// room on both sides of every node.
const WINDOW_HEADROOM = 1.3;

const ATTACK_RANGE = { min: 0.001, max: 2 };
const DECAY_RANGE = { min: 0, max: 2 };
const RELEASE_RANGE = { min: 0.001, max: 3 };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

interface EnvelopeEditorProps {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  onChange: (patch: { attack: number; decay: number; sustain: number; release: number }) => void;
}

/**
 * Node-editable ADSR envelope, per the FASE 10F/brief's "envolventes
 * editables con nodos" for the synth. Draws the exact piecewise-linear
 * shape synthVoice.ts's `scheduleVoice` actually schedules on the real
 * GainNode (adsrLevel - same linearRampToValueAtTime math, not a
 * redrawn approximation), with 3 draggable nodes (attack end, decay
 * end/sustain level, release end). The display window auto-scales to the
 * current attack+decay+release so short and long envelopes both stay
 * readable; `totalSec` is only used to convert a drag position back to
 * seconds (see handlePointsChange), each param otherwise stays anchored
 * to the others' real current values rather than their on-screen position,
 * so dragging one node can't silently reset an untouched neighbor.
 */
export function EnvelopeEditor({ attack, decay, sustain, release, onChange }: EnvelopeEditorProps) {
  const totalSec = Math.max(MIN_WINDOW_SEC, adsrTotalSec(attack, decay, release) * WINDOW_HEADROOM);

  const drawBackground = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = "9px monospace";
      const gridStepSec = totalSec > 4 ? 1 : 0.5;
      for (let t = 0; t <= totalSec; t += gridStepSec) {
        const x = (t / totalSec) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.fillText(`${t.toFixed(1)}s`, x + 2, height - 2);
      }

      ctx.strokeStyle = "#f2ede4";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= CURVE_STEPS; i++) {
        const t = (i / CURVE_STEPS) * totalSec;
        const level = adsrLevel(t, attack, decay, sustain, release);
        const x = (t / totalSec) * width;
        const y = height - level * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
    [attack, decay, sustain, release, totalSec]
  );

  const points: CurvePoint[] = [
    { id: "attack", x: attack / totalSec, y: 1 },
    { id: "decay", x: (attack + decay) / totalSec, y: sustain },
    { id: "release", x: adsrTotalSec(attack, decay, release) / totalSec, y: 0 },
  ];

  function handlePointsChange(next: CurvePoint[]) {
    // Only CurveEditor's one dragged point actually differs from `points`
    // (built from props above) - recompute just that point's own param(s)
    // from its new position, and pass the other three through untouched
    // from props. Recomputing all three from every point's raw x every
    // time would let one drag silently reset its neighbors: if attack is
    // dragged past decay's fixed screen position, `decayP.x * totalSec -
    // newAttack` goes negative and clamps decay to 0 even though the user
    // never touched the decay node.
    for (const p of next) {
      if (p.id === "attack") {
        const newAttack = clamp(p.x * totalSec, ATTACK_RANGE.min, ATTACK_RANGE.max);
        if (newAttack !== attack) onChange({ attack: newAttack, decay, sustain, release });
      } else if (p.id === "decay") {
        const newDecay = clamp(p.x * totalSec - attack, DECAY_RANGE.min, DECAY_RANGE.max);
        const newSustain = clamp(p.y, 0, 1);
        if (newDecay !== decay || newSustain !== sustain) onChange({ attack, decay: newDecay, sustain: newSustain, release });
      } else if (p.id === "release") {
        const newRelease = clamp(p.x * totalSec - attack - decay - SUSTAIN_HOLD_SEC, RELEASE_RANGE.min, RELEASE_RANGE.max);
        if (newRelease !== release) onChange({ attack, decay, sustain, release: newRelease });
      }
    }
  }

  return (
    <div className="space-y-1">
      <CurveEditor
        width={WIDTH}
        height={HEIGHT}
        points={points}
        onPointsChange={handlePointsChange}
        drawBackground={drawBackground}
        drawCurve={false}
        curveColor="#f2ede4"
      />
      <div className="flex justify-between text-[9px] text-bone-3">
        <span>Ataque {attack.toFixed(2)}s</span>
        <span>Caída {decay.toFixed(2)}s</span>
        <span>Sost. {(sustain * 100).toFixed(0)}%</span>
        <span>Rel. {release.toFixed(2)}s</span>
      </div>
    </div>
  );
}
