"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useProjectStore } from "@/state/projectStore";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { NOTE_NAMES_ES } from "@/types/autoPitch";
import { useExportActions } from "./StudioSettingsSheet";
import { ChevronDownIcon } from "./icons";

const SYSTEM_DEFAULT_DEVICE = "__system_default__";
const TIME_SIGNATURES: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
  [6, 8],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-4 pt-6">
      <h2 className="pb-2.5 text-[17px] font-medium text-bone-3">{title}</h2>
      <div className="overflow-hidden rounded-2xl bg-[#1c1e23]">{children}</div>
    </section>
  );
}

function Row({ label, children, last = false }: { label: string; children?: ReactNode; last?: boolean }) {
  return (
    <div className={`flex min-h-[52px] items-center justify-between gap-3 px-4 ${last ? "" : "border-b border-[#2a2d33]"}`}>
      <span className="shrink-0 text-[16px] text-bone">{label}</span>
      {children}
    </div>
  );
}

/** Right-aligned gray value that opens the native picker (a wheel on iPhone,
 * like BandLab's "Micrófono del iPhone" picker). */
function SelectValue<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <label className="relative flex min-w-0 flex-1 justify-end">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
        className="w-full min-w-0 appearance-none truncate bg-transparent pr-5 text-right text-[16px] text-bone-3 outline-none [text-align-last:right]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-bone-3" />
    </label>
  );
}

/**
 * BandLab's Studio settings page (gear tab, user's recording), keeping only
 * what this DAW actually uses: project settings (tempo with tap tempo, time
 * signature, project key), Studio settings (count-in, metronome volume, input
 * device and level) and export. BandLab's MIDI, sounds shortcut, watermark,
 * Tuner and help rows are left out on purpose (no MIDI or beats here).
 */
export function StudioSettingsPage() {
  const project = useProjectStore((s) => s.project);
  const isRecording = useProjectStore((s) => s.isRecording);
  const setBpm = useProjectStore((s) => s.setBpm);
  const setTimeSignature = useProjectStore((s) => s.setTimeSignature);
  const setProjectKey = useProjectStore((s) => s.setProjectKey);
  const setCountInBars = useProjectStore((s) => s.setCountInBars);
  const setMetronomeVolume = useProjectStore((s) => s.setMetronomeVolume);
  const renameProject = useProjectStore((s) => s.renameProject);
  const { isExporting, isExportingStems, exportError, exportMix, exportStems } = useExportActions();
  const hasAudio = project.tracks.some((t) => t.clips.length > 0);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState(() => getAudioEngine().getSelectedInputDeviceId() ?? SYSTEM_DEFAULT_DEVICE);
  const [inputGainDb, setInputGainDb] = useState(() => getAudioEngine().getInputGainDb());
  const taps = useRef<number[]>([]);

  useEffect(() => {
    void getAudioEngine().listInputDevices().then(setDevices);
  }, []);

  function tapTempo() {
    const now = performance.now();
    const recent = [...taps.current.filter((t) => now - t < 2500), now].slice(-6);
    taps.current = recent;
    if (recent.length < 2) return;
    const avg = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
    setBpm(Math.min(300, Math.max(20, Math.round(60000 / avg))));
  }

  const keyOptions = [];
  for (const scale of ["major", "minor"] as const) {
    for (let tonic = 0; tonic < 12; tonic++) {
      keyOptions.push({ value: `${tonic}:${scale}`, label: `${NOTE_NAMES_ES[tonic]} ${scale === "major" ? "Mayor" : "menor"}` });
    }
  }

  const step = "flex h-[60px] w-16 items-center justify-center text-3xl font-light text-bone disabled:opacity-30";
  const volumePct = Math.round(project.metronomeVolume * 100);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      <Section title="Ajustes del proyecto">
        <Row label="Nombre">
          <input
            value={project.name}
            onChange={(e) => renameProject(e.target.value)}
            aria-label="Nombre del proyecto"
            className="min-w-0 flex-1 bg-transparent text-right text-[16px] text-bone-3 outline-none focus:text-bone"
          />
        </Row>
        <div className="border-b border-[#2a2d33] px-4 pb-4 pt-3">
          <span className="text-[16px] text-bone">Tempo</span>
          <div className="mt-2.5 overflow-hidden rounded-xl border border-[#3a3d44]">
            <div className="flex items-stretch border-b border-[#3a3d44]">
              <button onClick={() => setBpm(Math.max(20, project.bpm - 1))} aria-label="Bajar tempo" className={`${step} border-r border-[#3a3d44]`}>
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={20}
                max={300}
                value={project.bpm}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 20 && v <= 300) setBpm(v);
                }}
                aria-label="Tempo en BPM"
                className="min-w-0 flex-1 bg-transparent text-center font-mono text-4xl text-bone outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button onClick={() => setBpm(Math.min(300, project.bpm + 1))} aria-label="Subir tempo" className={`${step} border-l border-[#3a3d44]`}>
                +
              </button>
            </div>
            <button onClick={tapTempo} className="h-11 w-full text-[15px] text-bone active:bg-surf-2">
              Pulsa Tempo
            </button>
          </div>
        </div>
        <Row label="Marca de tiempo">
          <SelectValue
            label="Marca de tiempo"
            value={project.timeSignature.join("/")}
            options={TIME_SIGNATURES.map((ts) => ({ value: ts.join("/"), label: ts.join("/") }))}
            onChange={(v) => {
              const [n, d] = v.split("/").map(Number);
              setTimeSignature(n, d);
            }}
          />
        </Row>
        <Row label="Clave del proyecto" last>
          <SelectValue
            label="Clave del proyecto"
            value={`${project.key.tonic}:${project.key.scale}`}
            options={keyOptions}
            onChange={(v) => {
              const [tonic, scale] = v.split(":");
              setProjectKey({ tonic: Number(tonic), scale: scale === "minor" ? "minor" : "major" });
            }}
          />
        </Row>
      </Section>

      <Section title="Ajustes de Studio">
        <Row label="Contar">
          <SelectValue
            label="Cuenta atrás antes de grabar"
            value={String(project.countInBars)}
            options={[
              { value: "0", label: "Off" },
              { value: "1", label: "1 compás" },
              { value: "2", label: "2 compases" },
            ]}
            onChange={(v) => setCountInBars(Number(v))}
          />
        </Row>
        <div className="border-b border-[#2a2d33] px-4 pb-4 pt-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[16px] text-bone">Volumen de metrónomo</span>
            <span className="text-[15px] tabular-nums text-bone-3">{volumePct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={volumePct}
            onChange={(e) => setMetronomeVolume(Number(e.target.value) / 100)}
            aria-label="Volumen de metrónomo"
            className="mt-3 w-full accent-[#2f80f6]"
          />
        </div>
        <Row label="Dispositivo de entrada">
          <SelectValue
            label="Dispositivo de entrada"
            value={deviceId}
            options={[
              { value: SYSTEM_DEFAULT_DEVICE, label: "Predeterminado" },
              ...devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Micrófono ${i + 1}` })),
            ]}
            onChange={(v) => {
              setDeviceId(v);
              void getAudioEngine().setSelectedInputDeviceId(v === SYSTEM_DEFAULT_DEVICE ? null : v);
            }}
          />
        </Row>
        <div className="px-4 pb-4 pt-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[16px] text-bone">Ganancia de entrada</span>
            <span className="text-[15px] tabular-nums text-bone-3">
              {inputGainDb > 0 ? "+" : ""}
              {inputGainDb.toFixed(1)} dB
            </span>
          </div>
          <input
            type="range"
            min={-24}
            max={24}
            step={0.5}
            value={inputGainDb}
            onChange={(e) => {
              const db = Number(e.target.value);
              setInputGainDb(db);
              getAudioEngine().setInputGainDb(db);
            }}
            aria-label="Ganancia de entrada"
            className="mt-3 w-full accent-[#2f80f6]"
          />
          <p className="mt-2 text-xs text-bone-3">Que los picos al cantar queden entre −12 y −6 dB.</p>
        </div>
      </Section>

      <Section title="Exportar">
        <button
          onClick={() => void exportMix()}
          disabled={isExporting || isExportingStems || isRecording || !hasAudio}
          className="flex min-h-[52px] w-full items-center border-b border-[#2a2d33] px-4 text-left text-[16px] text-bone disabled:text-bone-3"
        >
          {isExporting ? "Exportando…" : "Exportar mezcla (WAV)"}
        </button>
        <button
          onClick={() => void exportStems()}
          disabled={isExporting || isExportingStems || isRecording || !hasAudio}
          className="flex min-h-[52px] w-full items-center px-4 text-left text-[16px] text-bone disabled:text-bone-3"
        >
          {isExportingStems ? "Exportando…" : "Exportar cada pista (WAV)"}
        </button>
      </Section>
      {exportError && <p className="px-4 pt-2 text-xs text-red-400">{exportError}</p>}
      {!hasAudio && <p className="px-4 pt-2 text-xs text-bone-3">Graba o importa audio para poder exportar.</p>}
    </div>
  );
}
