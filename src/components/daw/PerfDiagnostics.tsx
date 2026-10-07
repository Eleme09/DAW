"use client";

import { useEffect, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import { perfMonitor, perfMonitorEnabled, setPerfMonitorEnabled, type PerfCounters } from "@/lib/diagnostics/perfMonitor";
import { sessionWeight } from "@/lib/diagnostics/dspCost";
import type { Project } from "@/types/project";

/** The written report the user copies and sends (what a real phone did). */
function buildReport(c: PerfCounters, project: Project): string {
  const s = getAudioEngine().getStats();
  const w = sessionWeight(project);
  const min = Math.round((performance.now() - c.since) / 60000);
  const lines = [
    `Informe de rendimiento — ${new Date().toLocaleString()}`,
    `Midiendo desde hace ${min} min`,
    `Audio corriendo ${Math.round(c.audioRunningSec)} s · atrasos ${c.audioDrops} (perdido ${Math.round(c.audioLostMs)} ms, peor ${Math.round(c.worstDropMs)} ms)`,
    `Pantalla: ${c.frames} cuadros · lentos ${c.slowFrames} (>50 ms) · congelados ${c.frozenFrames} (>200 ms) · peor ${Math.round(c.worstFrameMs)} ms`,
    `Motor: ${s.sampleRate ?? "?"} Hz · latencia base ${s.baseLatencyMs ?? "?"} ms · salida ${s.outputLatencyMs ?? "?"} ms · estado ${s.state}`,
    `Micrófono abierto ${s.micOpens} veces · tomas ${s.takes} · reproducciones ${s.plays}`,
    `Cambios de estado: ${s.stateChanges.join(", ") || "ninguno"}`,
    `Audio en memoria: ${s.buffers} archivos, ${s.bufferMB} MB`,
    `Peso de la sesión: ${w.total} (${w.parts.map((p) => `${p.label} ${p.cost}`).join(", ")})`,
    "Pistas:",
    ...project.tracks.map((t) => {
      const active = t.clips.filter((c) => !c.muted).length;
      const takes = t.clips.length - active;
      const fx = t.inserts.filter((e) => !e.bypassed).map((e) => e.type);
      const nucleo = t.autoPitch?.enabled ? `Núcleo ${t.autoPitch.presetId}` : "sin Núcleo";
      return `  ${t.name}: ${active} regiones${takes ? ` + ${takes} tomas guardadas` : ""} · ${nucleo} · ${fx.length ? fx.join(", ") : "sin efectos"}${t.muted ? " · silenciada" : ""}`;
    }),
    `Masterizar: ${project.mastering?.enabled ? `sí (${project.mastering.style})` : "no"} · efectos del máster: ${project.masterInserts.filter((e) => !e.bypassed).length}`,
    `Dispositivo: ${navigator.userAgent} · núcleos ${navigator.hardwareConcurrency ?? "?"} · pantalla ${screen.width}x${screen.height} @${window.devicePixelRatio}`,
  ];
  return lines.join("\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older iOS / no permission: select-and-copy through a hidden field
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/**
 * Ajustes > Rendimiento: a switch that measures what the phone really does
 * while recording and playing (see perfMonitor.ts), a live summary, and a
 * report to copy and send.
 */
export function PerfDiagnostics() {
  // client-only page (DawShell has ssr: false): the stored switch is readable here
  const [on, setOn] = useState(() => perfMonitorEnabled());
  const [c, setC] = useState<PerfCounters | null>(null);
  const [copied, setCopied] = useState(false);
  const project = useProjectStore((s) => s.project);
  const weight = sessionWeight(project);

  useEffect(() => {
    const id = setInterval(() => setC(perfMonitor.counters()), 1000);
    return () => clearInterval(id);
  }, []);

  const toggle = () => {
    const next = !on;
    setOn(next);
    setPerfMonitorEnabled(next);
    if (next) perfMonitor.reset();
  };

  const row = "flex min-h-[52px] items-center justify-between gap-3 border-b border-[#2a2d33] px-4 text-[16px] text-bone";
  return (
    <>
      <div className={row}>
        <span>Medir rendimiento</span>
        <button
          role="switch"
          aria-checked={on}
          aria-label="Medir rendimiento"
          onClick={toggle}
          className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${on ? "bg-[#34c759]" : "bg-[#3a3d44]"}`}
        >
          <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-[2px]"}`} />
        </button>
      </div>
      <div className={row}>
        <span>Peso de la sesión</span>
        <span className="text-right text-[15px] tabular-nums text-bone-3">
          {weight.total}
          {weight.parts[0] ? ` · más pesado: ${weight.parts[0].label}` : ""}
        </span>
      </div>
      {on && c && (
        <>
          <div className={row}>
            <span>Audio atrasado</span>
            <span className={`text-[15px] tabular-nums ${c.audioDrops ? "text-[#ff9f0a]" : "text-bone-3"}`}>
              {c.audioDrops} veces · {Math.round(c.audioLostMs)} ms
            </span>
          </div>
          <div className={row}>
            <span>Pantalla trabada</span>
            <span className={`text-[15px] tabular-nums ${c.frozenFrames ? "text-[#ff9f0a]" : "text-bone-3"}`}>
              {c.slowFrames} lentos · {c.frozenFrames} congelados
            </span>
          </div>
          <div className="flex gap-2 px-4 py-3">
            <button
              onClick={() =>
                void copyText(buildReport(perfMonitor.counters(), useProjectStore.getState().project)).then((ok) => {
                  setCopied(ok);
                  setTimeout(() => setCopied(false), 2000);
                })
              }
              className="h-11 flex-1 rounded-xl bg-bone text-sm font-semibold text-ink"
            >
              {copied ? "Copiado" : "Copiar informe"}
            </button>
            <button
              onClick={() => {
                perfMonitor.reset();
                setC(perfMonitor.counters());
              }}
              className="h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-bone"
            >
              Empezar de cero
            </button>
          </div>
        </>
      )}
      <p className="px-4 pb-3 pt-2 text-xs text-bone-3">
        {on
          ? "Graba y repite como siempre; cuando se trabe, vuelve aquí y copia el informe."
          : "Actívalo, usa la app como siempre y copia el informe cuando algo se trabe."}{" "}
        El peso suma lo medido de cada efecto (en un computador): sirve para comparar sesiones.
      </p>
    </>
  );
}
