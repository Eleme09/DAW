"use client";

import { useProjectStore } from "@/state/projectStore";
import { NOTE_SHORT_ES } from "@/types/autoPitch";
import { camelotCode } from "@/audio-engine/beat/beatAnalysis";
import type { ProjectKey } from "@/types/project";

function keyLabel(k: ProjectKey): string {
  return `${NOTE_SHORT_ES[k.tonic]} ${k.scale === "major" ? "mayor" : "menor"}`;
}

/**
 * After the first beat of a project is analysed: its tempo and key, which
 * the whole project (and every autotune) now follows. When the two key
 * models disagreed, the other likely key is one tap away.
 */
export function BeatNotice({ onAdjust }: { onAdjust: () => void }) {
  const analyzing = useProjectStore((s) => s.beatAnalyzing);
  const notice = useProjectStore((s) => s.beatNotice);
  const dismiss = useProjectStore((s) => s.dismissBeatNotice);
  const setProjectKey = useProjectStore((s) => s.setProjectKey);
  const project = useProjectStore((s) => s.project);
  const setAutoPitch = useProjectStore((s) => s.setAutoPitch);

  if (analyzing) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-[72px] z-50 flex justify-center px-4">
        <span className="flex items-center gap-2 rounded-full bg-[#1d1e24] px-4 py-2 text-[13px] text-bone-2 shadow-xl ring-1 ring-white/10">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-bone-3 border-t-transparent" />
          Analizando el beat: tempo y tonalidad…
        </span>
      </div>
    );
  }
  if (!notice) return null;

  const current = project.key;
  const applyKey = (k: ProjectKey) => {
    setProjectKey(k);
    for (const t of project.tracks) if (t.autoPitch) setAutoPitch(t.id, { key: k.tonic, scale: k.scale });
  };
  const showingAlt = current.tonic === notice.alternative.tonic && current.scale === notice.alternative.scale;
  const other = showingAlt ? notice.key : notice.alternative;

  return (
    <div className="fixed inset-x-0 top-[72px] z-50 flex justify-center px-3">
      <div className="w-full max-w-md rounded-2xl bg-[#17181d]/95 p-3.5 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-3">Beat analizado</div>
            <div className="mt-0.5 text-[17px] font-bold text-bone">
              {notice.bpm} BPM · {keyLabel(current)} <span className="text-[13px] font-medium text-bone-3">({camelotCode(current)})</span>
            </div>
            <p className="mt-0.5 text-[12px] leading-snug text-bone-3">
              El proyecto y el autotune quedaron en este tempo y esta clave.{!notice.keyAgreed && " La clave no es segura: si suena raro, prueba la otra."}
            </p>
          </div>
          <button onClick={dismiss} aria-label="Cerrar aviso" className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-bone-3">
            ✕
          </button>
        </div>
        <div className="mt-2.5 flex gap-2">
          <button onClick={() => applyKey(other)} className="h-9 flex-1 rounded-full bg-surf-2 text-[13px] font-medium text-bone">
            Usar {keyLabel(other)}
          </button>
          <button
            onClick={() => {
              dismiss();
              onAdjust();
            }}
            className="h-9 rounded-full bg-surf-2 px-4 text-[13px] font-medium text-bone"
          >
            Ajustar
          </button>
          <button onClick={dismiss} className="h-9 rounded-full bg-bone px-4 text-[13px] font-semibold text-ink">
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
