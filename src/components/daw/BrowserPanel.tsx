"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { listSampleAssets } from "@/lib/storage/sampleIndex";
import { deleteSampleForever, projectsUsingSample, sampleOrigin } from "@/lib/storage/sampleUsage";
import { IMPORT_ACCEPT, importAudioFile } from "@/lib/audio/importFile";
import { useProjectStore } from "@/state/projectStore";
import { ConfirmDialog } from "./Fx/ConfirmDialog";
import type { AudioClip, SampleAsset, SampleOrigin } from "@/types/project";

/**
 * "Mis audios": every audio the app keeps - takes you recorded, files you
 * imported, the sound pulled out of a video, edited copies (transposed,
 * cleaned...). Tap one to drop it on the selected track at the playhead;
 * the bin removes it for good (not while a project still uses it).
 */

const FILTERS: { id: SampleOrigin | "all"; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "recording", label: "Grabaciones" },
  { id: "import", label: "Importados" },
  { id: "video", label: "De video" },
  { id: "processed", label: "Editados" },
];

const ORIGIN_LABEL: Record<SampleOrigin, string> = {
  recording: "Grabación",
  import: "Importado",
  video: "Audio de video",
  processed: "Editado",
};

const ORIGIN_TINT: Record<SampleOrigin, string> = {
  recording: "#ff5d73",
  import: "#5ec8e5",
  video: "#c58bff",
  processed: "#f2b84b",
};

function OriginIcon({ origin }: { origin: SampleOrigin }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      {origin === "recording" && (
        <>
          <rect x="9" y="3" width="6" height="11" rx="3" {...common} />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" {...common} />
        </>
      )}
      {origin === "import" && <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" {...common} />}
      {origin === "video" && (
        <>
          <rect x="3" y="6" width="13" height="12" rx="2.5" {...common} />
          <path d="m16 10.5 5-3v9l-5-3" {...common} />
        </>
      )}
      {origin === "processed" && <path d="M4 14c2-6 4-6 6 0s4 6 6 0 3-4 4-2" {...common} />}
    </svg>
  );
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

export function BrowserPanel() {
  const [samples, setSamples] = useState<SampleAsset[]>([]);
  const [filter, setFilter] = useState<SampleOrigin | "all">("all");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<SampleAsset | null>(null);
  const [blocked, setBlocked] = useState<{ sample: SampleAsset; projects: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const project = useProjectStore((s) => s.project);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const currentTime = useProjectStore((s) => s.currentTime);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addClip = useProjectStore((s) => s.addClip);
  const setMobileView = useProjectStore((s) => s.setMobileView);

  useEffect(() => {
    void listSampleAssets().then(setSamples);
  }, []);

  const inUse = useMemo(() => new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId))), [project.tracks]);
  const shown = samples.filter((s) => filter === "all" || sampleOrigin(s) === filter);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImporting(true);
    setMessage(null);
    const failed: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          await importAudioFile(file);
        } catch {
          failed.push(file.name);
        }
      }
      setSamples(await listSampleAssets());
      if (failed.length > 0) setMessage(`No se pudo abrir: ${failed.join(", ")} (formato no compatible o archivo dañado).`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function addToSession(sample: SampleAsset) {
    const buffer = await ensureSampleLoaded(sample.id);
    if (!buffer) {
      setMessage("No se encontró el audio de este archivo.");
      return;
    }
    let track = project.tracks.find((t) => t.id === selectedTrackId);
    if (!track) track = addTrack(sample.name.replace(/\.[^/.]+$/, ""));
    const clip: AudioClip = {
      id: crypto.randomUUID(),
      trackId: track.id,
      sampleId: sample.id,
      name: sample.name.replace(/\.[^/.]+$/, ""),
      startTime: Math.max(0, currentTime),
      duration: buffer.duration,
      sourceOffset: 0,
      gainDb: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      color: track.color,
    };
    addClip(clip);
    if (sampleOrigin(sample) !== "recording") void useProjectStore.getState().analyzeFirstBeat(sample.id, sample.name);
    setMobileView("timeline");
  }

  async function askDelete(sample: SampleAsset) {
    const projects = await projectsUsingSample(sample.id, project);
    if (projects.length > 0) setBlocked({ sample, projects });
    else setConfirm(sample);
  }

  async function doDelete(sample: SampleAsset) {
    setConfirm(null);
    await deleteSampleForever(sample.id);
    setSamples(await listSampleAssets());
  }

  return (
    <div className="flex h-full w-full shrink-0 flex-col bg-ink md:w-72 md:border-r md:border-line">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3 pr-14 md:pr-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-bold tracking-tight text-bone">Mis audios</h2>
          <p className="text-[12px] text-bone-3">{samples.length === 1 ? "1 archivo" : `${samples.length} archivos`} · toca uno para ponerlo en la pista</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="flex h-9 items-center gap-1.5 rounded-full bg-bone px-4 text-[13px] font-semibold text-ink disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M12 19V7m0 0-4.5 4.5M12 7l4.5 4.5" />
          </svg>
          {importing ? "Importando…" : "Importar"}
        </button>
        <input ref={fileInputRef} type="file" accept={IMPORT_ACCEPT} multiple hidden onChange={(e) => void handleFiles(e.target.files)} />
      </div>

      <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium ${filter === f.id ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {message && <p className="mx-4 mb-2 rounded-xl bg-surf-2 px-3 py-2 text-[12px] text-bone-2">{message}</p>}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-6">
        {shown.length === 0 && (
          <div className="mt-10 px-6 text-center">
            <p className="text-[15px] font-semibold text-bone">{samples.length === 0 ? "Aún no hay audios" : "Nada en este filtro"}</p>
            <p className="mt-1 text-[13px] text-bone-3">Lo que grabes o importes (audio o video) aparece aquí.</p>
          </div>
        )}
        {shown.map((s) => {
          const origin = sampleOrigin(s);
          const used = inUse.has(s.id);
          return (
            <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-surf-2 p-2.5 pr-1.5">
              <button onClick={() => void addToSession(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left" title={`Poner "${s.name}" en la pista`}>
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${ORIGIN_TINT[origin]}22`, color: ORIGIN_TINT[origin] }}
                >
                  <OriginIcon origin={origin} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-bone">{s.name.replace(/\.[^/.]+$/, "")}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-bone-3">
                    <span className="tabular-nums">{formatDuration(s.durationSec)}</span>·<span>{ORIGIN_LABEL[origin]}</span>·<span>{formatWhen(s.createdAt)}</span>
                  </span>
                </span>
              </button>
              {used && <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-bone-2">En uso</span>}
              <button
                onClick={() => void askDelete(s)}
                aria-label={`Borrar ${s.name}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-bone-3 active:bg-white/10"
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7M9.5 7V4.5h5V7" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {confirm && (
        <ConfirmDialog
          title="¿Borrar este audio?"
          message={`"${confirm.name}" se elimina del teléfono. No se puede deshacer.`}
          actions={[
            { label: "Borrar", danger: true, onClick: () => void doDelete(confirm) },
            { label: "Cancelar", onClick: () => setConfirm(null) },
          ]}
        />
      )}
      {blocked && (
        <ConfirmDialog
          title="Este audio está en uso"
          message={`Lo usa${blocked.projects.length > 1 ? "n" : ""} ${blocked.projects.map((n) => `"${n}"`).join(", ")}. Quítalo de esas pistas antes de borrarlo.`}
          actions={[{ label: "Entendido", onClick: () => setBlocked(null) }]}
        />
      )}
    </div>
  );
}
