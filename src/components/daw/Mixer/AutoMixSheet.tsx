"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { applyMixPlan, guessRoles, planMix, ROLE_LABEL, type MixRole, type TrackFacts } from "@/lib/mix/autoMix";
import { measureTracks } from "@/lib/mix/measureMix";
import { BottomSheet } from "../BottomSheet";
import type { TrackId } from "@/types/project";

const ROLES: MixRole[] = ["beat", "lead", "double", "adlib", "other"];

function fmtDb(db: number): string {
  return `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
}

function fmtPan(pan: number): string {
  if (Math.abs(pan) < 0.05) return "centro";
  return `${Math.round(Math.abs(pan) * 100)} % ${pan < 0 ? "izq." : "der."}`;
}

/**
 * Automezcla: measures every track through its own chain (a 20 s slice
 * each, rendered offline), guesses what each one is (beat, lead, double,
 * ad-lib), proposes faders, pans and a shared reverb, and applies it all in
 * one step that "Deshacer" reverts. Roles can be corrected before applying.
 */
export function AutoMixSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Automezcla">
      {open && <AutoMixBody onClose={onClose} />}
    </BottomSheet>
  );
}

/** Mounted while the sheet is open: measuring starts on mount, and closing
 * throws the state away. */
function AutoMixBody({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const applyMix = useProjectStore((s) => s.applyMix);
  const [facts, setFacts] = useState<Map<TrackId, TrackFacts> | null>(null);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [roles, setRoles] = useState<Map<TrackId, MixRole>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  useEffect(() => {
    let alive = true;
    const id = ++run.current;
    const snapshot = useProjectStore.getState().project;
    measureTracks(snapshot, (done, total) => {
      if (alive && run.current === id) setProgress([done, total]);
    })
      .then((f) => {
        if (!alive || run.current !== id) return;
        setFacts(f);
        setRoles(guessRoles(snapshot.tracks, f));
      })
      .catch(() => {
        if (alive && run.current === id) setError("No se pudo medir las pistas.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const plan = useMemo(() => (facts ? planMix(project.tracks, facts, roles) : []), [facts, roles, project.tracks]);
  const byId = new Map(project.tracks.map((t) => [t.id, t]));
  const anyReverb = plan.some((p) => p.reverbSendDb !== null);

  return (
    <>
      {!facts && !error && (
        <div className="flex flex-col items-center gap-3 py-8">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-bone-3 border-t-transparent" />
          <p className="text-[14px] text-bone-2">
            Escuchando cada pista{progress[1] > 0 ? ` (${progress[0]}/${progress[1]})` : ""}…
          </p>
        </div>
      )}
      {error && <p className="py-6 text-center text-[14px] text-red-400">{error}</p>}
      {facts && plan.length === 0 && <p className="py-6 text-center text-[14px] text-bone-3">No hay audio en las pistas todavía.</p>}
      {facts && plan.length > 0 && (
        <div className="space-y-3">
          <p className="text-[12.5px] leading-snug text-bone-3">
            Niveles medidos con los efectos de cada pista. El beat queda con espacio y la voz principal al frente. Corrige qué es cada pista si hace falta.
          </p>
          {plan.map((p) => {
            const t = byId.get(p.trackId);
            if (!t) return null;
            return (
              <div key={p.trackId} className="rounded-2xl bg-surf-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-bone">{t.name}</span>
                  <span className="shrink-0 text-[12px] tabular-nums text-bone-2">
                    {fmtDb(t.volumeDb)} → <span className="font-semibold text-bone">{fmtDb(p.volumeDb)}</span>
                  </span>
                </div>
                <div className="mt-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRoles((m) => new Map(m).set(p.trackId, r))}
                      aria-pressed={p.role === r}
                      className={`h-7 shrink-0 rounded-full px-3 text-[12px] font-medium ${p.role === r ? "bg-bone text-ink" : "bg-black/30 text-bone-2"}`}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 text-[11.5px] text-bone-3">
                  Paneo {fmtPan(p.pan)}
                  {p.reverbSendDb !== null && ` · reverb compartida ${fmtDb(p.reverbSendDb)}`}
                  {p.lufs === null && " · sin señal medible: no se toca"}
                </div>
              </div>
            );
          })}
          {anyReverb && <p className="text-[11.5px] text-bone-3">Las voces sin reverb propia van a un bus &quot;Espacio&quot; (placa corta): una sola sala para todas.</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="h-11 flex-1 rounded-full bg-surf-2 text-[14px] font-medium text-bone">
              Cancelar
            </button>
            <button
              onClick={() => {
                applyMix(applyMixPlan(useProjectStore.getState().project, plan));
                useProjectStore.getState().showToast("Automezcla aplicada · Deshacer la revierte");
                onClose();
              }}
              className="h-11 flex-1 rounded-full bg-bone text-[14px] font-semibold text-ink"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
