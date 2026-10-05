"use client";

import { useEffect, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { exportProjectToWav, exportStemsToWav } from "@/lib/audio/exportProject";
import { getAudioEngine, type MonitorInputConstraints } from "@/audio-engine/AudioEngine";
import { GRID_RESOLUTIONS, type GridResolution } from "@/lib/timing/grid";
import { FolderIcon } from "./icons";
import { BottomSheet } from "./BottomSheet";
import { Picker } from "./ui/Picker";
import { Knob } from "./ui/Knob";

const SYSTEM_DEFAULT_DEVICE = "__system_default__";

const CONSTRAINT_LABELS: Record<keyof MonitorInputConstraints, string> = {
  echoCancellation: "Cancelación de eco",
  noiseSuppression: "Supresión de ruido",
  autoGainControl: "Ganancia automática",
};

export function useExportActions() {
  const project = useProjectStore((s) => s.project);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingStems, setIsExportingStems] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportMix() {
    setExportError(null);
    setIsExporting(true);
    try {
      await exportProjectToWav(project);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Error al exportar");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportStems() {
    setExportError(null);
    setIsExportingStems(true);
    try {
      await exportStemsToWav(project);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Error al exportar los stems");
    } finally {
      setIsExportingStems(false);
    }
  }

  return { isExporting, isExportingStems, exportError, exportMix, exportStems };
}

export function BpmField() {
  const bpm = useProjectStore((s) => s.project.bpm);
  const setBpm = useProjectStore((s) => s.setBpm);
  return (
    <div className="flex items-center gap-1 text-xs text-bone-2" title="Tempo, en pulsos por minuto">
      <label className="font-medium">BPM</label>
      <input
        type="number"
        min={20}
        max={300}
        value={bpm}
        onChange={(e) => setBpm(Number(e.target.value) || bpm)}
        className="w-16 rounded bg-surf px-1 py-1 text-bone outline-none focus:ring-1 focus:ring-bone"
      />
    </div>
  );
}

export function TimeSigField() {
  const timeSignature = useProjectStore((s) => s.project.timeSignature);
  const setTimeSignature = useProjectStore((s) => s.setTimeSignature);
  return (
    <div className="flex items-center gap-1 text-xs text-bone-2" title="Compás">
      <label className="font-medium">COMPÁS</label>
      <input
        type="number"
        min={1}
        max={32}
        value={timeSignature[0]}
        onChange={(e) => setTimeSignature(Number(e.target.value) || 4, timeSignature[1])}
        className="w-10 rounded bg-surf px-1 py-1 text-center text-bone outline-none"
      />
      <span>/</span>
      <input
        type="number"
        min={1}
        max={32}
        value={timeSignature[1]}
        onChange={(e) => setTimeSignature(timeSignature[0], Number(e.target.value) || 4)}
        className="w-10 rounded bg-surf px-1 py-1 text-center text-bone outline-none"
      />
    </div>
  );
}

export function LoopButton() {
  const enabled = useProjectStore((s) => s.project.loop.enabled);
  const setLoop = useProjectStore((s) => s.setLoop);
  return (
    <button
      onClick={() => setLoop({ enabled: !enabled })}
      title="Reproducir en bucle entre los marcadores de loop"
      className={`min-h-11 rounded-full px-3 text-xs font-medium ${enabled ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"}`}
    >
      LOOP
    </button>
  );
}

export function ClickButton() {
  const enabled = useProjectStore((s) => s.project.metronomeEnabled);
  const toggleMetronome = useProjectStore((s) => s.toggleMetronome);
  return (
    <button
      onClick={toggleMetronome}
      title="Clic del metrónomo al reproducir/grabar"
      className={`min-h-11 rounded-full px-3 text-xs font-medium ${enabled ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"}`}
    >
      CLICK
    </button>
  );
}

interface StudioSettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The Studio's "Settings" (gear) sheet - BandLab keeps tempo, key, metronome,
 * count-in, input device and latency in one gear menu at the top of the
 * Studio (BANDLAB_REFERENCE.md §2), not scattered across tabs. Shared by the
 * mobile Studio's top bar and the desktop transport.
 */
export function StudioSettingsSheet({ open, onClose }: StudioSettingsSheetProps) {
  const projectName = useProjectStore((s) => s.project.name);
  const hasAudio = useProjectStore((s) => s.project.tracks.some((t) => t.clips.length > 0));
  const isRecording = useProjectStore((s) => s.isRecording);
  const recordingError = useProjectStore((s) => s.recordingError);
  const renameProject = useProjectStore((s) => s.renameProject);
  const persist = useProjectStore((s) => s.persist);
  const closeProject = useProjectStore((s) => s.closeProject);
  const snapResolution = useProjectStore((s) => s.snapResolution);
  const setSnapResolution = useProjectStore((s) => s.setSnapResolution);
  const { isExporting, isExportingStems, exportError, exportMix, exportStems } = useExportActions();

  const [micConstraints, setMicConstraints] = useState<MonitorInputConstraints>(() => getAudioEngine().getMonitorConstraints());
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => getAudioEngine().getSelectedInputDeviceId() ?? SYSTEM_DEFAULT_DEVICE);
  const [inputGainDb, setInputGainDbState] = useState(() => getAudioEngine().getInputGainDb());
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutputDeviceId, setSelectedOutputDeviceIdState] = useState(
    () => getAudioEngine().getSelectedOutputDeviceId() ?? SYSTEM_DEFAULT_DEVICE
  );
  const [outputDeviceError, setOutputDeviceError] = useState<string | null>(null);
  const outputSelectionSupported = getAudioEngine().isOutputDeviceSelectionSupported();
  const latencySec = getAudioEngine().getLatencySec();

  useEffect(() => {
    if (!open) return;
    void getAudioEngine().listInputDevices().then(setInputDevices);
    if (outputSelectionSupported) void getAudioEngine().listOutputDevices().then(setOutputDevices);
  }, [open, outputSelectionSupported]);

  function toggleMicConstraint(key: keyof MonitorInputConstraints) {
    const next = { ...micConstraints, [key]: !micConstraints[key] };
    setMicConstraints(next);
    void getAudioEngine().setMonitorConstraints({ [key]: next[key] });
  }

  function selectInputDevice(deviceId: string) {
    setSelectedDeviceId(deviceId);
    void getAudioEngine().setSelectedInputDeviceId(deviceId === SYSTEM_DEFAULT_DEVICE ? null : deviceId);
  }

  function handleInputGainChange(db: number) {
    setInputGainDbState(db);
    getAudioEngine().setInputGainDb(db);
  }

  async function selectOutputDevice(deviceId: string) {
    setSelectedOutputDeviceIdState(deviceId);
    setOutputDeviceError(null);
    const result = await getAudioEngine().setSelectedOutputDeviceId(deviceId === SYSTEM_DEFAULT_DEVICE ? null : deviceId);
    if (!result.ok) setOutputDeviceError(result.error ?? "No se pudo cambiar el dispositivo de salida");
  }

  async function handleExitProject() {
    onClose();
    await persist();
    closeProject();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Ajustes del proyecto">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-bone-3">Nombre del proyecto</span>
        <input
          value={projectName}
          onChange={(e) => renameProject(e.target.value)}
          className="rounded bg-surf px-3 py-2 text-sm font-medium text-bone outline-none focus:ring-1 focus:ring-bone"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <BpmField />
        <TimeSigField />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <LoopButton />
        <ClickButton />
        <div className="flex items-center gap-1.5 text-xs text-bone-2" title="Ajustar clips a la rejilla musical">
          <span className="font-medium">Ajuste</span>
          <div className="w-28">
            <Picker<GridResolution>
              value={snapResolution}
              options={GRID_RESOLUTIONS.map((r) => ({ value: r, label: r === "off" ? "Desactivado" : r }))}
              title="Resolución de ajuste"
              onChange={setSnapResolution}
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-line pt-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-bone-3">
          Entrada de micrófono{" "}
          {latencySec !== null && <span className="normal-case">— {Math.round(latencySec * 1000)}ms de latencia medida</span>}
        </span>
        <Picker
          value={selectedDeviceId}
          onChange={selectInputDevice}
          title="Dispositivo de entrada"
          options={[
            { value: SYSTEM_DEFAULT_DEVICE, label: "Predeterminado del sistema" },
            ...inputDevices.map((d, i) => ({ value: d.deviceId, label: d.label || `Micrófono ${i + 1}` })),
          ]}
        />
        <Knob
          value={inputGainDb}
          min={-24}
          max={24}
          defaultValue={0}
          decimals={1}
          unit=" dB"
          label="Ganancia de entrada"
          size={36}
          onChange={handleInputGainChange}
        />
        <div className="flex flex-col gap-2">
          {(Object.keys(CONSTRAINT_LABELS) as (keyof MonitorInputConstraints)[]).map((key) => (
            <button
              key={key}
              onClick={() => toggleMicConstraint(key)}
              className={`flex h-11 items-center justify-between rounded-full px-4 text-sm font-medium ${
                micConstraints[key] ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
              }`}
            >
              {CONSTRAINT_LABELS[key]}
              <span>{micConstraints[key] ? "Activado" : "Desactivado"}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-line pt-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-bone-3">Salida de audio</span>
        {outputSelectionSupported ? (
          <>
            <Picker
              value={selectedOutputDeviceId}
              onChange={(v) => void selectOutputDevice(v)}
              title="Dispositivo de salida"
              options={[
                { value: SYSTEM_DEFAULT_DEVICE, label: "Predeterminado del sistema" },
                ...outputDevices.map((d, i) => ({ value: d.deviceId, label: d.label || `Salida ${i + 1}` })),
              ]}
            />
            {outputDeviceError && <p className="text-xs text-red-400">{outputDeviceError}</p>}
          </>
        ) : (
          <p className="text-xs text-bone-3">Este navegador no permite elegir la salida - suena por la predeterminada.</p>
        )}
      </div>

      {(recordingError || exportError) && <p className="text-xs text-red-400">{recordingError || exportError}</p>}

      <div className="space-y-2 border-t border-line pt-3">
        <button
          onClick={() => void exportMix()}
          disabled={isExporting || isExportingStems || isRecording || !hasAudio}
          className="h-11 w-full rounded-full bg-surf-2 text-sm font-medium text-bone disabled:opacity-40"
        >
          {isExporting ? "Exportando…" : hasAudio ? "Exportar mezcla como WAV" : "Agrega audio primero para exportar"}
        </button>
        <button
          onClick={() => void exportStems()}
          disabled={isExporting || isExportingStems || isRecording || !hasAudio}
          className="h-11 w-full rounded-full bg-surf-2 text-sm font-medium text-bone disabled:opacity-40"
        >
          {isExportingStems ? "Exportando…" : "Exportar cada pista por separado (WAV)"}
        </button>
        <button onClick={() => void persist()} className="h-11 w-full rounded-full bg-bone text-sm font-semibold text-ink">
          Guardar proyecto
        </button>
        <button
          onClick={() => void handleExitProject()}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-surf-2 text-sm font-medium text-bone"
        >
          <FolderIcon className="h-4 w-4" /> Salir a mis proyectos
        </button>
      </div>
    </BottomSheet>
  );
}
