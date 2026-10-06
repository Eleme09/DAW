"use client";

import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { TEMPO_DIVISIONS, divisionToMs } from "@/audio-engine/effects/tempoGrid";
import { useProjectStore } from "@/state/projectStore";
import { FX_CATALOG, type FxSkin } from "@/lib/fx/catalog";
import type { EffectInstance } from "@/types/effects";
import { Advanced, Box, FxKnob, KnobRow, Pills, fmt } from "./kit";
import { DecayDisplay, EchoDisplay, LevelBar, LfoDisplay, TransferDisplay, VuMeter, WidthDisplay } from "./displays";
import { EqFace } from "./EqFace";

/**
 * One face per effect. Layout rule for all of them (phone first): the
 * display on top, the two or three knobs that do 90 % of the job in the
 * middle, everything else under "Avanzado".
 */

type Setter<P> = (p: P) => void;

function node<T>(target: string, id: string): T | undefined {
  return getAudioEngine().getEffectNode(target, id) as T | undefined;
}

function readReduction(target: string, id: string): () => number {
  return () => {
    const n = node<{ getReductionDb?: () => number }>(target, id);
    const v = typeof n?.getReductionDb === "function" ? n.getReductionDb() : 0;
    return Number.isFinite(v) ? v : 0;
  };
}

function readPhase(target: string, id: string): () => number | null {
  return () => {
    const n = node<{ getLfoPhase?: () => number }>(target, id);
    return typeof n?.getLfoPhase === "function" ? n.getLfoPhase() : null;
  };
}

export function EffectFace({ effect, target, onParams }: { effect: EffectInstance; target: string; onParams: (p: EffectInstance["params"]) => void }) {
  if (effect.type === "pitchCorrection") return <p className="p-4 text-sm text-bone-2">Este efecto antiguo se edita desde Núcleo.</p>;
  const skin = FX_CATALOG[effect.type].skin;
  const id = effect.id;
  switch (effect.type) {
    case "eq":
      return <EqFace params={effect.params} onChange={onParams as Setter<typeof effect.params>} skin={skin} target={target} />;
    case "compressor": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      const mode = p.ratio >= 12 ? "limit" : p.ratio <= 5 && p.ratio >= 3 ? "comp" : "custom";
      return (
        <div>
          <VuMeter read={readReduction(target, id)} />
          <div className="mt-4 flex items-start justify-around">
            <FxKnob label="Umbral" value={p.thresholdDb} min={-60} max={0} onChange={(v) => set({ thresholdDb: Math.round(v * 10) / 10 })} skin={skin} format={fmt.db} defaultValue={-24} size={92} />
            <FxKnob label="Ganancia" value={p.makeupDb} min={0} max={24} onChange={(v) => set({ makeupDb: Math.round(v * 10) / 10 })} skin={skin} format={fmt.db} defaultValue={0} size={92} />
          </div>
          <div className="mt-3 flex justify-center">
            <Pills
              options={[
                { id: "comp", label: "Comprimir" },
                { id: "limit", label: "Limitar" },
                ...(mode === "custom" ? [{ id: "custom" as const, label: `${p.ratio.toFixed(1)}:1` }] : []),
              ]}
              value={mode}
              onChange={(m) => m !== "custom" && set({ ratio: m === "limit" ? 20 : 4 })}
              skin={skin}
            />
          </div>
          <Advanced skin={skin}>
            <KnobRow>
              <FxKnob label="Ratio" value={p.ratio} min={1} max={20} scale="log" onChange={(v) => set({ ratio: Math.round(v * 10) / 10 })} skin={skin} format={fmt.ratio} defaultValue={4} size={56} />
              <FxKnob label="Ataque" value={p.attackMs} min={0.1} max={200} scale="log" onChange={(v) => set({ attackMs: v })} skin={skin} format={fmt.ms} defaultValue={10} size={56} />
              <FxKnob label="Release" value={p.releaseMs} min={10} max={1000} scale="log" onChange={(v) => set({ releaseMs: v })} skin={skin} format={fmt.ms} defaultValue={120} size={56} />
              <FxKnob label="Rodilla" value={p.kneeDb} min={0} max={30} onChange={(v) => set({ kneeDb: Math.round(v) })} skin={skin} format={fmt.dbInt} defaultValue={6} size={56} />
            </KnobRow>
          </Advanced>
        </div>
      );
    }
    case "limiter": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      return (
        <div>
          <Box skin={skin}>
            <LevelBar read={() => readReduction(target, id)() * -1 - 24} min={-24} max={0} skin={skin} label="Reducción" />
          </Box>
          <div className="mt-4 flex justify-around">
            <FxKnob label="Empuje" value={-p.thresholdDb} min={0} max={18} onChange={(v) => set({ thresholdDb: -Math.round(v * 10) / 10 })} skin={skin} format={(v) => `+${v.toFixed(1)} dB`} defaultValue={3} size={88} />
            <FxKnob label="Techo" value={p.ceilingDb} min={-6} max={0} onChange={(v) => set({ ceilingDb: Math.round(v * 10) / 10 })} skin={skin} format={fmt.db} defaultValue={-1} size={88} />
          </div>
          <Advanced skin={skin}>
            <KnobRow>
              <FxKnob label="Release" value={p.releaseMs} min={10} max={500} scale="log" onChange={(v) => set({ releaseMs: v })} skin={skin} format={fmt.ms} defaultValue={80} size={56} />
            </KnobRow>
          </Advanced>
        </div>
      );
    }
    case "clipper": {
      const p = effect.params;
      return (
        <div className="flex items-center justify-around gap-3">
          <TransferDisplay tone="neutral" driveDb={0} mix={1} skin={skin} hard ceilingDb={p.ceilingDb} />
          <FxKnob label="Techo" value={p.ceilingDb} min={-12} max={0} onChange={(v) => onParams({ ceilingDb: Math.round(v * 10) / 10 })} skin={skin} format={fmt.db} defaultValue={-1} size={92} />
        </div>
      );
    }
    case "noiseGate": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      return (
        <div>
          <Box skin={skin}>
            <LevelBar
              read={() => {
                const n = node<{ getEnvelope?: () => number }>(target, id);
                const env = typeof n?.getEnvelope === "function" ? n.getEnvelope() : 0;
                return env * 100 - 100;
              }}
              min={-100}
              max={0}
              skin={skin}
              label="Puerta abierta"
            />
          </Box>
          <div className="mt-4 flex justify-around">
            <FxKnob label="Umbral" value={p.thresholdDb} min={-80} max={-10} onChange={(v) => set({ thresholdDb: Math.round(v) })} skin={skin} format={fmt.dbInt} defaultValue={-45} size={88} />
            <FxKnob label="Cierre" value={p.releaseMs} min={10} max={1000} scale="log" onChange={(v) => set({ releaseMs: v })} skin={skin} format={fmt.ms} defaultValue={150} size={88} />
          </div>
          <Advanced skin={skin}>
            <KnobRow>
              <FxKnob label="Apertura" value={p.attackMs} min={0.1} max={50} scale="log" onChange={(v) => set({ attackMs: v })} skin={skin} format={fmt.ms} defaultValue={2} size={56} />
              <FxKnob label="Espera" value={p.holdMs} min={0} max={500} onChange={(v) => set({ holdMs: Math.round(v) })} skin={skin} format={fmt.ms} defaultValue={50} size={56} />
            </KnobRow>
          </Advanced>
        </div>
      );
    }
    case "deesser": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      return (
        <div>
          <Box skin={skin}>
            <LevelBar read={() => readReduction(target, id)() * -1 - 24} min={-24} max={0} skin={skin} label="Eses reducidas" />
          </Box>
          <div className="mt-4 flex justify-around">
            <FxKnob label="Frecuencia" value={p.freq} min={3000} max={12000} scale="log" onChange={(v) => set({ freq: Math.round(v) })} skin={skin} format={fmt.hz} defaultValue={6500} size={84} />
            <FxKnob label="Cantidad" value={-p.thresholdDb} min={10} max={50} onChange={(v) => set({ thresholdDb: -Math.round(v) })} skin={skin} format={(v) => `${Math.round(((v - 10) / 40) * 100)} %`} defaultValue={30} size={84} />
          </div>
          <Advanced skin={skin}>
            <KnobRow>
              <FxKnob label="Ratio" value={p.ratio} min={1} max={12} onChange={(v) => set({ ratio: Math.round(v * 10) / 10 })} skin={skin} format={fmt.ratio} defaultValue={4} size={56} />
            </KnobRow>
          </Advanced>
        </div>
      );
    }
    case "multibandCompressor": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      const bands = [
        { key: "low" as const, label: "Graves" },
        { key: "mid" as const, label: "Medios" },
        { key: "high" as const, label: "Agudos" },
      ];
      return (
        <div>
          <div className="grid grid-cols-3 gap-2">
            {bands.map((b) => (
              <Box key={b.key} skin={skin} title={b.label}>
                <LevelBar
                  read={() => {
                    const n = node<{ getReductionDb?: () => { low: number; mid: number; high: number } }>(target, id);
                    const r = typeof n?.getReductionDb === "function" ? n.getReductionDb()[b.key] : 0;
                    return (Number.isFinite(r) ? r : 0) * -1 - 24;
                  }}
                  min={-24}
                  max={0}
                  skin={skin}
                  label=""
                />
                <div className="mt-2 flex justify-center">
                  <FxKnob label="Umbral" value={p[b.key].thresholdDb} min={-60} max={0} onChange={(v) => set({ [b.key]: { ...p[b.key], thresholdDb: Math.round(v) } })} skin={skin} format={fmt.dbInt} defaultValue={-24} size={54} />
                </div>
              </Box>
            ))}
          </div>
          <Advanced skin={skin}>
            <KnobRow>
              {bands.map((b) => (
                <FxKnob key={b.key} label={`Ratio ${b.label}`} value={p[b.key].ratio} min={1} max={12} onChange={(v) => set({ [b.key]: { ...p[b.key], ratio: Math.round(v * 10) / 10 } })} skin={skin} format={fmt.ratio} defaultValue={3} size={50} />
              ))}
              {bands.map((b) => (
                <FxKnob key={`m${b.key}`} label={`Gan. ${b.label}`} value={p[b.key].makeupDb} min={0} max={12} onChange={(v) => set({ [b.key]: { ...p[b.key], makeupDb: Math.round(v * 10) / 10 } })} skin={skin} format={fmt.db} defaultValue={0} size={50} />
              ))}
              <FxKnob label="Cruce 1" value={p.lowMidFreq} min={60} max={1000} scale="log" onChange={(v) => set({ lowMidFreq: Math.round(v) })} skin={skin} format={fmt.hz} defaultValue={200} size={50} />
              <FxKnob label="Cruce 2" value={p.midHighFreq} min={1000} max={10000} scale="log" onChange={(v) => set({ midHighFreq: Math.round(v) })} skin={skin} format={fmt.hz} defaultValue={2000} size={50} />
              <FxKnob label="Ataque" value={p.attackMs} min={0.5} max={100} scale="log" onChange={(v) => set({ attackMs: v })} skin={skin} format={fmt.ms} defaultValue={15} size={50} />
              <FxKnob label="Release" value={p.releaseMs} min={20} max={1000} scale="log" onChange={(v) => set({ releaseMs: v })} skin={skin} format={fmt.ms} defaultValue={150} size={50} />
            </KnobRow>
          </Advanced>
        </div>
      );
    }
    case "saturation": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      return (
        <div>
          <div className="flex items-center justify-around gap-3">
            <TransferDisplay tone={p.tone} driveDb={p.driveDb} mix={p.mix} skin={skin} />
            <div className="flex flex-col items-center gap-2">
              <FxKnob label="Drive" value={p.driveDb} min={0} max={30} onChange={(v) => set({ driveDb: Math.round(v * 10) / 10 })} skin={skin} format={fmt.db} defaultValue={6} size={96} />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <Pills
              options={[
                { id: "warm", label: "Válvula" },
                { id: "neutral", label: "Cinta" },
                { id: "bright", label: "Rage" },
              ]}
              value={p.tone}
              onChange={(tone) => set({ tone })}
              skin={skin}
            />
            <FxKnob label="Mezcla" value={p.mix} min={0} max={1} onChange={(v) => set({ mix: v })} skin={skin} format={fmt.pct} defaultValue={0.4} size={56} />
          </div>
        </div>
      );
    }
    case "exciter": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      return (
        <div className="flex justify-around">
          <FxKnob label="Brillo" value={p.driveDb} min={0} max={24} onChange={(v) => set({ driveDb: Math.round(v * 10) / 10 })} skin={skin} format={fmt.db} defaultValue={8} size={84} />
          <FxKnob label="Desde" value={p.freq} min={1500} max={12000} scale="log" onChange={(v) => set({ freq: Math.round(v) })} skin={skin} format={fmt.hz} defaultValue={5000} size={84} />
          <FxKnob label="Mezcla" value={p.mix} min={0} max={1} onChange={(v) => set({ mix: v })} skin={skin} format={fmt.pct} defaultValue={0.25} size={64} />
        </div>
      );
    }
    case "reverb": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      return (
        <div>
          <DecayDisplay params={p} skin={skin} />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: skin.ink2 }}>
              Modo
            </span>
            <Pills
              options={[
                { id: "room", label: "Cuarto" },
                { id: "plate", label: "Placa" },
                { id: "hall", label: "Sala" },
              ]}
              value={p.sizeType}
              onChange={(sizeType) => set({ sizeType })}
              skin={skin}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Box skin={skin} title="Mezcla">
              <div className="flex justify-center">
                <FxKnob label="" ariaLabel="Mezcla" value={p.mix} min={0} max={1} onChange={(v) => set({ mix: v })} skin={skin} format={fmt.pct} defaultValue={0.2} size={84} />
              </div>
            </Box>
            <Box skin={skin} title="Decay">
              <div className="flex justify-center">
                <FxKnob label="" ariaLabel="Decay" value={p.decaySec} min={0.2} max={8} scale="log" onChange={(v) => set({ decaySec: Math.round(v * 10) / 10 })} skin={skin} format={fmt.sec} defaultValue={1.8} size={84} />
              </div>
            </Box>
          </div>
          <Advanced skin={skin}>
            <div className="grid grid-cols-3 gap-2">
              <Box skin={skin} title="Pre-delay">
                <FxKnob label="" ariaLabel="Pre-delay" value={p.predelayMs ?? 0} min={0} max={200} onChange={(v) => set({ predelayMs: Math.round(v) })} skin={skin} format={fmt.ms} defaultValue={20} size={54} />
              </Box>
              <Box skin={skin} title="Graves">
                <FxKnob label="" ariaLabel="Graves" value={p.lowCutHz ?? 20} min={20} max={1000} scale="log" onChange={(v) => set({ lowCutHz: Math.round(v) })} skin={skin} format={fmt.hz} defaultValue={250} size={54} />
              </Box>
              <Box skin={skin} title="Agudos">
                <FxKnob label="" ariaLabel="Agudos" value={p.highCutHz ?? 20000} min={1500} max={20000} scale="log" onChange={(v) => set({ highCutHz: Math.round(v) })} skin={skin} format={fmt.hz} defaultValue={9000} size={54} />
              </Box>
            </div>
          </Advanced>
        </div>
      );
    }
    case "delay":
      return <DelayFace effect={effect} onParams={onParams} skin={skin} />;
    case "chorus": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      return (
        <div>
          <LfoDisplay readPhase={readPhase(target, id)} rateHz={p.rateHz} depth={p.depthMs / 10} skin={skin} label={`${p.rateHz.toFixed(2)} Hz`} />
          <div className="mt-4 flex justify-around">
            <FxKnob label="Velocidad" value={p.rateHz} min={0.05} max={5} scale="log" onChange={(v) => set({ rateHz: Math.round(v * 100) / 100 })} skin={skin} format={(v) => `${v.toFixed(2)} Hz`} defaultValue={0.8} size={70} />
            <FxKnob label="Profundidad" value={p.depthMs} min={0.5} max={10} onChange={(v) => set({ depthMs: Math.round(v * 10) / 10 })} skin={skin} format={fmt.ms} defaultValue={4} size={70} />
            <FxKnob label="Mezcla" value={p.mix} min={0} max={1} onChange={(v) => set({ mix: v })} skin={skin} format={fmt.pct} defaultValue={0.35} size={70} />
          </div>
        </div>
      );
    }
    case "flanger": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      return (
        <div>
          <LfoDisplay readPhase={readPhase(target, id)} rateHz={p.rateHz} depth={p.depthMs / 8} skin={skin} label={`${p.rateHz.toFixed(2)} Hz`} />
          <div className="mt-4 flex flex-wrap justify-around gap-y-3">
            <FxKnob label="Velocidad" value={p.rateHz} min={0.02} max={4} scale="log" onChange={(v) => set({ rateHz: Math.round(v * 100) / 100 })} skin={skin} format={(v) => `${v.toFixed(2)} Hz`} defaultValue={0.25} size={64} />
            <FxKnob label="Profundidad" value={p.depthMs} min={0.2} max={8} onChange={(v) => set({ depthMs: Math.round(v * 10) / 10 })} skin={skin} format={fmt.ms} defaultValue={2} size={64} />
            <FxKnob label="Feedback" value={p.feedback} min={0} max={0.9} onChange={(v) => set({ feedback: v })} skin={skin} format={fmt.pct} defaultValue={0.4} size={64} />
            <FxKnob label="Mezcla" value={p.mix} min={0} max={1} onChange={(v) => set({ mix: v })} skin={skin} format={fmt.pct} defaultValue={0.35} size={64} />
          </div>
        </div>
      );
    }
    case "autoPan": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      return (
        <div>
          <LfoDisplay readPhase={readPhase(target, id)} rateHz={p.rateHz} depth={p.depth} skin={skin} label="IZQ ↔ DER" />
          <div className="mt-4 flex justify-around">
            <FxKnob label="Velocidad" value={p.rateHz} min={0.05} max={8} scale="log" onChange={(v) => set({ rateHz: Math.round(v * 100) / 100 })} skin={skin} format={(v) => `${v.toFixed(2)} Hz`} defaultValue={0.5} size={84} />
            <FxKnob label="Recorrido" value={p.depth} min={0} max={1} onChange={(v) => set({ depth: v })} skin={skin} format={fmt.pct} defaultValue={0.7} size={84} />
          </div>
        </div>
      );
    }
    case "stereoWidth": {
      const p = effect.params;
      return (
        <div>
          <WidthDisplay width={p.width} skin={skin} />
          <div className="mt-4 flex justify-center">
            <FxKnob label="Ancho" value={p.width} min={0} max={2} onChange={(v) => onParams({ width: Math.round(v * 100) / 100 })} skin={skin} format={(v) => `${Math.round(v * 100)} %`} defaultValue={1} size={96} />
          </div>
          <p className="mt-2 text-center text-[11px]" style={{ color: skin.ink2 }}>
            Solo se nota en señal estéreo (después de Doble, Eco ping-pong o en coros).
          </p>
        </div>
      );
    }
    case "pitchShift":
      return <PitchShiftFace effect={effect} onParams={onParams} skin={skin} />;
    case "vocoder": {
      const p = effect.params;
      const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
      return (
        <div>
          <div className="flex justify-center">
            <Pills
              options={[
                { id: "sawtooth", label: "Sierra" },
                { id: "square", label: "Cuadrada" },
              ]}
              value={p.carrierType}
              onChange={(carrierType) => set({ carrierType })}
              skin={skin}
            />
          </div>
          <div className="mt-4 flex justify-around">
            <FxKnob label="Tono" value={p.carrierFreqHz} min={40} max={880} scale="log" onChange={(v) => set({ carrierFreqHz: Math.round(v) })} skin={skin} format={fmt.hz} defaultValue={110} size={88} />
            <FxKnob label="Mezcla" value={p.mix} min={0} max={1} onChange={(v) => set({ mix: v })} skin={skin} format={fmt.pct} defaultValue={1} size={88} />
          </div>
        </div>
      );
    }
  }
}

const INTERVALS = ["Unísono", "2ª menor", "2ª mayor", "3ª menor", "3ª mayor", "4ª justa", "Tritono", "5ª justa", "6ª menor", "6ª mayor", "7ª menor", "7ª mayor", "Octava"];

/** "5ª justa arriba", "Octava abajo". */
export function intervalName(semitones: number): string {
  const st = Math.round(semitones);
  if (st === 0) return "Sin cambio";
  return `${INTERVALS[Math.min(12, Math.abs(st))]} ${st > 0 ? "arriba" : "abajo"}`;
}

const SHIFT_QUICK = [-12, -7, -5, 5, 7, 12];

function PitchShiftFace({ effect, onParams, skin }: { effect: Extract<EffectInstance, { type: "pitchShift" }>; onParams: (p: EffectInstance["params"]) => void; skin: FxSkin }) {
  const p = effect.params;
  const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
  const st = Math.round(p.semitones);
  // two staffs of the same melody: the original (faint) and where it lands
  const y = (offset: number) => 60 - offset * 3.2;
  const line = (offset: number) => `M8 ${y(offset)} q 22 -14 44 0 t 44 0 t 44 0 t 44 0 t 44 0 t 44 0`;
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl" style={{ background: skin.box, height: 128 }}>
        <svg viewBox="0 0 280 120" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {[-12, -6, 0, 6, 12].map((o) => (
            <line key={o} x1={0} x2={280} y1={y(o)} y2={y(o)} stroke={skin.ink2} strokeOpacity={o === 0 ? 0.35 : 0.12} strokeDasharray={o === 0 ? "" : "3 5"} />
          ))}
          <path d={line(0)} stroke={skin.ink} strokeOpacity={0.3} strokeWidth={2} fill="none" />
          <path d={line(p.semitones + p.cents / 100)} stroke={skin.accent} strokeWidth={3} fill="none" style={{ filter: `drop-shadow(0 0 6px ${skin.accent})` }} />
        </svg>
        <div className="absolute left-3 top-2">
          <div className="font-mono text-[28px] font-bold leading-none tabular-nums" style={{ color: skin.ink }}>
            {st > 0 ? "+" : ""}
            {st}
            <span className="ml-1 text-[13px] font-semibold" style={{ color: skin.ink2 }}>
              st{p.cents !== 0 ? ` ${p.cents > 0 ? "+" : ""}${Math.round(p.cents)} c` : ""}
            </span>
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: skin.accent }}>
            {intervalName(st)}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        {SHIFT_QUICK.map((v) => (
          <button
            key={v}
            onClick={() => set({ semitones: v, cents: 0 })}
            className="h-8 flex-1 rounded-full text-[12px] font-semibold tabular-nums"
            style={st === v && p.cents === 0 ? { background: skin.accent, color: "#12061c" } : { background: "rgba(255,255,255,0.07)", color: skin.ink }}
          >
            {v > 0 ? "+" : ""}
            {v}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Box skin={skin} title="Tono">
          <div className="flex justify-center">
            <FxKnob label="" ariaLabel="Tono" value={p.semitones} min={-12} max={12} step={1} bipolar onChange={(v) => set({ semitones: Math.round(v) })} skin={skin} format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)} st`} defaultValue={0} size={84} />
          </div>
        </Box>
        <Box skin={skin} title="Mezcla">
          <div className="flex justify-center">
            <FxKnob label="" ariaLabel="Mezcla" value={p.mix} min={0} max={1} onChange={(v) => set({ mix: v })} skin={skin} format={fmt.pct} defaultValue={1} size={84} />
          </div>
        </Box>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Box skin={skin} title="Formante">
          <div className="flex justify-center">
            <FxKnob label="" ariaLabel="Formante" value={p.formantSt} min={-12} max={12} bipolar onChange={(v) => set({ formantSt: Math.round(v * 2) / 2 })} skin={skin} format={(v) => (Math.abs(v) < 0.25 ? "Tu timbre" : `${v > 0 ? "+" : ""}${v} st`)} defaultValue={0} size={60} />
          </div>
        </Box>
        <Box skin={skin} title="Fino">
          <div className="flex justify-center">
            <FxKnob label="" ariaLabel="Fino" value={p.cents} min={-50} max={50} bipolar onChange={(v) => set({ cents: Math.round(v) })} skin={skin} format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)} c`} defaultValue={0} size={60} />
          </div>
        </Box>
      </div>
      <p className="mt-2 text-center text-[11px]" style={{ color: skin.ink2 }}>
        Para una voz. Las consonantes (s, t, ch) pasan sin cambiar, como en los transpositores de voz.
      </p>
    </div>
  );
}

const SYNC_OPTIONS = ["1/2", "1/4.", "1/4", "1/8.", "1/8", "1/16"];

function DelayFace({ effect, onParams, skin }: { effect: Extract<EffectInstance, { type: "delay" }>; onParams: (p: EffectInstance["params"]) => void; skin: FxSkin }) {
  const bpm = useProjectStore((s) => s.project.bpm);
  const p = effect.params;
  const set = (patch: Partial<typeof p>) => onParams({ ...p, ...patch });
  const sync = p.sync ?? null;
  return (
    <div>
      <EchoDisplay timeMs={p.timeMs} feedback={p.feedback} mix={p.mix} pingPong={p.pingPong === true} skin={skin} />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[null, ...SYNC_OPTIONS].map((d) => {
          const on = d === sync;
          return (
            <button
              key={d ?? "free"}
              onClick={() => {
                if (d === null) set({ sync: null });
                else {
                  const div = TEMPO_DIVISIONS.find((x) => x.label === d);
                  if (div) set({ sync: d, timeMs: Math.min(4000, divisionToMs(div.beats, bpm)) });
                }
              }}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: on ? skin.accent : "rgba(255,255,255,0.07)", color: on ? "#0b0b0d" : skin.ink }}
            >
              {d ?? "Libre"}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex justify-around">
        {sync === null ? (
          <FxKnob label="Tiempo" value={p.timeMs} min={20} max={2000} scale="log" onChange={(v) => set({ timeMs: Math.round(v) })} skin={skin} format={fmt.ms} defaultValue={350} size={72} />
        ) : (
          <div className="flex w-[72px] flex-col items-center pt-4">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: skin.ink2 }}>
              Tiempo
            </span>
            <span className="mt-3 text-lg font-bold" style={{ color: skin.ink }}>
              {sync}
            </span>
            <span className="font-mono text-[11px]" style={{ color: skin.ink2 }}>
              {Math.round(p.timeMs)} ms
            </span>
          </div>
        )}
        <FxKnob label="Repeticiones" value={p.feedback} min={0} max={0.9} onChange={(v) => set({ feedback: v })} skin={skin} format={fmt.pct} defaultValue={0.35} size={72} />
        <FxKnob label="Mezcla" value={p.mix} min={0} max={1} onChange={(v) => set({ mix: v })} skin={skin} format={fmt.pct} defaultValue={0.25} size={72} />
      </div>
      <div className="mt-3 flex justify-center">
        <Pills
          options={[
            { id: "mono", label: "Centro" },
            { id: "ping", label: "Ping-pong" },
          ]}
          value={p.pingPong ? "ping" : "mono"}
          onChange={(m) => set({ pingPong: m === "ping" })}
          skin={skin}
        />
      </div>
      <Advanced skin={skin}>
        <KnobRow>
          <FxKnob label="Oscurecer" value={p.filterFreq} min={800} max={16000} scale="log" onChange={(v) => set({ filterFreq: Math.round(v) })} skin={skin} format={fmt.hz} defaultValue={4000} size={56} />
          <FxKnob label="Corte graves" value={p.lowCutHz ?? 20} min={20} max={1000} scale="log" onChange={(v) => set({ lowCutHz: Math.round(v) })} skin={skin} format={fmt.hz} defaultValue={300} size={56} />
        </KnobRow>
      </Advanced>
    </div>
  );
}
