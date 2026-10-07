"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import {
  analyzeClipMelody,
  renderHarmonyVoices,
  stretchClip,
  transposeClip,
  type DetectedKey,
  type HarmonyVoice,
} from "@/lib/audio/clipProcessing";
import { isAbortError } from "@/lib/audio/clipWorkerClient";
import type { AudioClip } from "@/types/project";
import type { PitchFrame, ScaleName } from "@/types/pitch";
import { Picker } from "./ui/Picker";
import { PlayIcon, PauseIcon, ShiftIcon, GainIcon, TransposeIcon, StretchIcon, FadeIcon, LoopIcon, HarmonizeIcon } from "./icons";

const SHIFT_MS = 300;
const GAIN_RANGE_DB = 24;
const TRANSPOSE_RANGE = 12;
const STRETCH_OPTIONS = [0.5, 1, 2] as const;
const LOOP_OPTIONS = [4, 8, 16] as const;
const NOTE_NAMES_ES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];

/** Harmony voices, named the way BandLab's harmony presets describe them
 * ("Third: third-down harmony", "Stone: fourth-up", "Yummy: fifth-down",
 * "octave lower"...). Steps are scale degrees, so they stay in key. */
const HARMONY_VOICES: HarmonyVoice[] = [
  { steps: 2, label: "3ª arriba" },
  { steps: -2, label: "3ª abajo" },
  { steps: 4, label: "5ª arriba" },
  { steps: -4, label: "5ª abajo" },
  { steps: 3, label: "4ª arriba" },
  { steps: 7, label: "Octava arriba" },
  { steps: -7, label: "Octava abajo" },
];

const TITLES = {
  shift: "Desplazar",
  gain: "Ganancia",
  transpose: "Transponer",
  stretch: "Estirar",
  fade: "Fades",
  loop: "Loop",
  harmonize: "Armonizar",
} as const;

const MODE_ICONS = {
  shift: ShiftIcon,
  gain: GainIcon,
  transpose: TransposeIcon,
  stretch: StretchIcon,
  fade: FadeIcon,
  loop: LoopIcon,
  harmonize: HarmonizeIcon,
} as const;

/** These render new audio on "Aplicar"; the rest apply live as you move them. */
const RENDERED = new Set(["transpose", "stretch", "harmonize"]);

/** Choir colour of Núcleo - the harmony voices share it. */
const VOICE_COLOR = "#a98bff";

/**
 * The bottom panel for a valued region action: the action's icon and name
 * with its value, the control, and "Escuchar" / "Listo" (or "Aplicar" when
 * it renders audio). It replaces the transport while open. Desplazar,
 * Ganancia, Fades and Loop apply live as you move them; Transponer, Estirar
 * and Armonizar render audio on "Aplicar". Undo reverts any of them.
 * Sliders are faders in the region's colour (a cap, not a dot); Fades draws
 * the region's own fade curves.
 *
 * The rendering runs in a Web Worker (clipWorker.ts): the screen never
 * freezes, "Aplicar" turns into "Cancelar" that really stops it, and
 * closing the panel stops it too.
 */
export function ClipEditPanel() {
  const mode = useProjectStore((s) => s.clipEditMode);
  const clip = useProjectStore((s) =>
    s.selectedClip
      ? s.project.tracks.find((t) => t.id === s.selectedClip!.trackId)?.clips.find((c) => c.id === s.selectedClip!.clipId) ?? null
      : null
  );
  if (!mode || !clip) return null;
  // Remount per clip+mode so each panel starts from that region's own values.
  return <PanelBody key={`${clip.id}-${mode}`} clip={clip} />;
}

function PanelBody({ clip }: { clip: AudioClip }) {
  const mode = useProjectStore((s) => s.clipEditMode)!;
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const updateClip = useProjectStore((s) => s.updateClip);
  const close = () => useProjectStore.getState().setClipEditMode(null);
  const [baseStart] = useState(clip.startTime);
  const [semitones, setSemitones] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Harmonize state
  const [key, setKey] = useState<DetectedKey | null>(null);
  const [keyDetected, setKeyDetected] = useState<"pending" | "ok" | "none">("pending");
  const [voices, setVoices] = useState<number[]>([2]);
  const [humanize, setHumanize] = useState(true);
  // The running render (✓) and the key detection each have their own
  // controller: ✕ and closing the panel abort them, and the pitch track from
  // the detection is reused by the render so the audio is analysed once.
  const jobAbort = useRef<AbortController | null>(null);
  const keyAbort = useRef<AbortController | null>(null);
  const melodyFrames = useRef<PitchFrame[] | undefined>(undefined);

  useEffect(() => {
    if (mode !== "harmonize") return;
    const controller = new AbortController();
    keyAbort.current = controller;
    analyzeClipMelody(clip, { signal: controller.signal })
      .then((melody) => {
        melodyFrames.current = melody.frames;
        setKey((current) => current ?? melody.key ?? { key: 0, scale: "major" });
        setKeyDetected(melody.key ? "ok" : "none");
      })
      .catch((err) => {
        if (!isAbortError(err)) setKeyDetected("none");
      });
    return () => {
      controller.abort();
      jobAbort.current?.abort();
    };
    // Detect once per panel open - the clip's audio doesn't change while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Leaving the panel by any route stops a render that is still running.
  useEffect(() => () => jobAbort.current?.abort(), []);

  function chooseKey(next: DetectedKey) {
    // Their choice wins: stop looking for the key.
    keyAbort.current?.abort();
    setKey(next);
    setKeyDetected("ok");
  }

  function cancelJob() {
    jobAbort.current?.abort();
  }

  const update = (patch: Partial<AudioClip>) => updateClip(clip.trackId, clip.id, patch);

  function togglePreview() {
    const s = useProjectStore.getState();
    if (s.isPlaying) return s.pause();
    if (s.currentTime < clip.startTime || s.currentTime >= clip.startTime + clip.duration) s.seek(clip.startTime);
    s.play();
  }

  async function confirm() {
    setError(null);
    const s = useProjectStore.getState();
    const controller = new AbortController();
    jobAbort.current = controller;
    const job = { signal: controller.signal, onProgress: (f: number) => setProgress(f) };
    try {
      if (mode === "transpose" && semitones !== 0) {
        setBusy(true);
        update(await transposeClip(clip, semitones, job));
        s.showToast("Listo");
      } else if (mode === "stretch" && speed !== 1) {
        setBusy(true);
        update(await stretchClip(clip, speed, job));
        s.showToast("Listo");
      } else if (mode === "harmonize") {
        if (!key || voices.length === 0) return;
        setBusy(true);
        await createHarmonyTracks(clip, key, voices, humanize, { ...job, frames: melodyFrames.current });
        s.showToast(`Listo: ${voices.length} ${voices.length === 1 ? "voz creada" : "voces creadas"}`);
      }
      close();
    } catch (err) {
      if (isAbortError(err)) s.showToast("Cancelado");
      else setError(err instanceof Error ? err.message : "No se pudo procesar");
    } finally {
      setBusy(false);
      setProgress(null);
      if (jobAbort.current === controller) jobAbort.current = null;
    }
  }

  let value = "";
  let control: React.ReactNode = null;
  if (mode === "shift") {
    const ms = Math.round((clip.startTime - baseStart) * 1000);
    value = ms === 0 ? "±0 ms" : `${ms > 0 ? "+" : ""}${ms} ms`;
    control = (
      <EditSlider
        min={-SHIFT_MS}
        max={SHIFT_MS}
        value={ms}
        bipolar
        color={clip.color}
        onChange={(v) => update({ startTime: Math.max(0, baseStart + Math.round(v) / 1000) })}
      />
    );
  } else if (mode === "gain") {
    value = `${clip.gainDb >= 0 ? "+" : ""}${clip.gainDb.toFixed(1)} dB`;
    control = (
      <EditSlider min={-GAIN_RANGE_DB} max={GAIN_RANGE_DB} value={clip.gainDb} bipolar color={clip.color} onChange={(v) => update({ gainDb: Math.round(v * 10) / 10 })} />
    );
  } else if (mode === "transpose") {
    value = semitones === 0 ? "±0 semitonos" : `${semitones > 0 ? "+" : ""}${semitones} semitonos`;
    control = (
      <EditSlider min={-TRANSPOSE_RANGE} max={TRANSPOSE_RANGE} value={semitones} bipolar steps={TRANSPOSE_RANGE * 2} color={clip.color} onChange={(v) => setSemitones(Math.round(v))} />
    );
  } else if (mode === "stretch") {
    value = speed === 1 ? "Velocidad original" : `${speed} × · ${speed < 1 ? "más lento" : "más rápido"}`;
    control = (
      <Segmented
        options={STRETCH_OPTIONS.map((o) => ({ value: o, label: o === 0.5 ? "½ ×" : `${o} ×` }))}
        value={speed}
        color={clip.color}
        onChange={setSpeed}
      />
    );
  } else if (mode === "fade") {
    value = `Entrada ${clip.fadeInSec.toFixed(2)} s · Salida ${clip.fadeOutSec.toFixed(2)} s`;
    control = (
      <FadeSlider
        color={clip.color}
        duration={clip.duration}
        fadeIn={clip.fadeInSec}
        fadeOut={clip.fadeOutSec}
        onChange={(fadeInSec, fadeOutSec) => update({ fadeInSec, fadeOutSec })}
      />
    );
  } else if (mode === "loop") {
    const loopLength = clip.loopLengthSec;
    const count = loopLength ? Math.round(clip.duration / loopLength) : 0;
    value = loopLength ? `${count} veces` : "Sin loop";
    control = (
      <Segmented
        options={[...LOOP_OPTIONS.map((n) => ({ value: n as number, label: `${n} ×` })), { value: 0, label: "Sin loop" }]}
        value={count}
        color={clip.color}
        onChange={(n) => {
          if (n === 0) {
            if (loopLength) update({ duration: loopLength, loopLengthSec: undefined });
            return;
          }
          const len = loopLength ?? clip.duration;
          update({ loopLengthSec: len, duration: len * n, fadeOutSec: 0 });
        }}
      />
    );
  } else if (mode === "harmonize") {
    control = (
      <div className="space-y-3 py-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-bone-3">Tonalidad</span>
          <div className="w-40">
            <Picker
              value={key ? `${key.key}-${key.scale}` : "0-major"}
              title="Tonalidad de la armonía"
              options={NOTE_NAMES_ES.flatMap((n, i) => [
                { value: `${i}-major`, label: `${n} mayor` },
                { value: `${i}-naturalMinor`, label: `${n} menor` },
              ])}
              onChange={(v) => {
                const [k, scale] = v.split("-");
                chooseKey({ key: Number(k), scale: scale as ScaleName });
              }}
            />
          </div>
          {keyDetected === "pending" && <span className="text-bone-2">detectando… (puedes elegirla)</span>}
          {keyDetected === "none" && <span className="text-[11px] text-bone-3">no se detectó, elígela</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HARMONY_VOICES.map((v) => {
            const on = voices.includes(v.steps);
            return (
              <button
                key={v.steps}
                onClick={() => setVoices((cur) => (on ? cur.filter((x) => x !== v.steps) : [...cur, v.steps]))}
                className={`h-9 rounded-lg border px-3 text-xs font-semibold ${on ? "text-ink" : "border-white/10 bg-white/[0.04] text-bone-2"}`}
                style={on ? { background: VOICE_COLOR, borderColor: VOICE_COLOR } : undefined}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-xs text-bone-2">
          <input type="checkbox" checked={humanize} onChange={(e) => setHumanize(e.target.checked)} className="h-4 w-4" style={{ accentColor: VOICE_COLOR }} />
          Humanizar (cada voz un poco desafinada y retrasada, como un coro real)
        </label>
      </div>
    );
  }

  const ModeIcon = MODE_ICONS[mode];
  const renders = RENDERED.has(mode);
  const applyDisabled = mode === "harmonize" && (!key || voices.length === 0);

  return (
    <div
      data-keep-region=""
      className="shrink-0 border-t border-white/10 bg-[#0f1013] px-4 pt-3"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${clip.color}26`, color: clip.color }}>
          <ModeIcon className="h-[18px] w-[18px]" />
        </span>
        <span className="text-sm font-semibold text-bone">{TITLES[mode]}</span>
        <span className="ml-auto truncate pl-2 text-right text-xs tabular-nums text-bone-2">{value}</span>
      </div>
      {control}
      {error && <p className="pb-1 text-xs text-red-400">{error}</p>}
      {busy && (
        <div className="mb-1 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round((progress ?? 0.05) * 100)}%`, background: clip.color }} />
        </div>
      )}
      <div className="flex h-14 items-center gap-2">
        <button
          onClick={togglePreview}
          aria-label={isPlaying ? "Pausar" : "Escuchar"}
          className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-bone"
        >
          {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          {isPlaying ? "Pausar" : "Escuchar"}
        </button>
        <span className="flex-1 text-center text-xs tabular-nums text-bone-3">
          {busy ? `Procesando…${progress !== null ? ` ${Math.round(progress * 100)} %` : ""}` : ""}
        </span>
        {busy ? (
          <button onClick={cancelJob} aria-label="Cancelar" title="Cancelar" className="h-11 rounded-xl border border-white/15 px-5 text-sm font-semibold text-bone">
            Cancelar
          </button>
        ) : (
          <button
            onClick={() => void confirm()}
            disabled={applyDisabled}
            aria-label="Aplicar"
            className="h-11 rounded-xl px-5 text-sm font-semibold text-ink disabled:opacity-30"
            style={{ background: clip.color }}
          >
            {renders ? "Aplicar" : "Listo"}
          </button>
        )}
      </div>
    </div>
  );
}

/** One new track per harmony voice, under the original's effects, spread
 * left/right and 6 dB down - the usual way a harmony stack sits in a mix. */
async function createHarmonyTracks(
  clip: AudioClip,
  key: DetectedKey,
  steps: number[],
  humanize: boolean,
  options: Parameters<typeof renderHarmonyVoices>[4]
) {
  const s = useProjectStore.getState();
  const source = s.project.tracks.find((t) => t.id === clip.trackId);
  const voices = HARMONY_VOICES.filter((v) => steps.includes(v.steps));
  const rendered = await renderHarmonyVoices(clip, key, voices, humanize, options);
  rendered.forEach(({ voice, sampleId }, i) => {
    const st = useProjectStore.getState();
    const track = st.addTrack(`${source?.name ?? "Voz"} · ${voice.label}`);
    st.updateTrack(track.id, {
      volumeDb: -6,
      pan: rendered.length === 1 ? 0 : i % 2 === 0 ? -0.45 : 0.45,
      inserts: (source?.inserts ?? []).map((e) => ({ ...e, id: crypto.randomUUID() })),
    });
    st.addClip({
      ...clip,
      id: crypto.randomUUID(),
      trackId: track.id,
      sampleId,
      sourceOffset: 0,
      name: `${clip.name} ${voice.label}`,
      color: track.color,
      takeGroupId: undefined,
      muted: undefined,
    });
  });
}

function valueFromPointer(e: React.PointerEvent, el: HTMLElement, min: number, max: number) {
  const rect = el.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  return min + pct * (max - min);
}

/** A fader in the region's colour: track, fill from zero (or the left
 * end), a cap you grab, tick marks; double tap resets. */
function EditSlider({
  min,
  max,
  value,
  onChange,
  color,
  bipolar = false,
  steps = 8,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  color: string;
  bipolar?: boolean;
  /** Number of tick intervals drawn under the track. */
  steps?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pct = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  const zeroPct = bipolar ? ((0 - min) / (max - min)) * 100 : 0;
  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onChange(valueFromPointer(e, ref.current!, min, max));
      }}
      onPointerMove={(e) => dragging.current && onChange(valueFromPointer(e, ref.current!, min, max))}
      onPointerUp={() => (dragging.current = false)}
      onDoubleClick={() => onChange(bipolar ? 0 : min)}
      style={{ touchAction: "none" }}
      className="relative h-12 w-full cursor-pointer select-none"
    >
      <div className="absolute inset-x-0 top-[18px] h-1.5 rounded-full bg-white/10" />
      <div className="absolute top-[18px] h-1.5 rounded-full" style={{ left: `${Math.min(pct, zeroPct)}%`, width: `${Math.abs(pct - zeroPct)}%`, background: color }} />
      <div className="pointer-events-none absolute inset-x-0 top-[32px] flex justify-between">
        {Array.from({ length: steps + 1 }, (_, i) => (
          <span key={i} className={`w-px ${bipolar && i === steps / 2 ? "h-2.5 bg-white/50" : "h-1.5 bg-white/20"}`} />
        ))}
      </div>
      <FaderCap pct={pct} />
    </div>
  );
}

/** The grabbable cap of a fader (a console fader's, not a round dot). */
function FaderCap({ pct }: { pct: number }) {
  return (
    <div
      className="pointer-events-none absolute top-[9px] h-6 w-3.5 rounded-[4px] border border-black/30 bg-[#f4f3ee] shadow-[0_2px_6px_rgba(0,0,0,.5)]"
      style={{ left: `calc(${pct}% - 7px)` }}
    >
      <span className="absolute inset-x-[3px] top-1/2 h-px -translate-y-1/2 bg-black/40" />
    </div>
  );
}

/** A row of choices in the region's colour. */
function Segmented<T extends number>({
  options,
  value,
  onChange,
  color,
}: {
  options: { value: T; label: string }[];
  value: number;
  onChange: (v: T) => void;
  color: string;
}) {
  return (
    <div className="my-2 flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`h-10 flex-1 rounded-lg text-sm font-semibold tabular-nums ${on ? "text-ink" : "text-bone-2"}`}
            style={on ? { background: color } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The region's fades drawn as on the region (curve over the body), with a
 * cap at each end to pull: left = fade-in length, right = fade-out. */
function FadeSlider({
  duration,
  fadeIn,
  fadeOut,
  onChange,
  color,
}: {
  duration: number;
  fadeIn: number;
  fadeOut: number;
  onChange: (fadeIn: number, fadeOut: number) => void;
  color: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<"in" | "out" | null>(null);
  const inPct = (fadeIn / duration) * 100;
  const outPct = 100 - (fadeOut / duration) * 100;
  const H = 40;

  function move(e: React.PointerEvent) {
    if (!active.current || !ref.current) return;
    const t = valueFromPointer(e, ref.current, 0, duration);
    if (active.current === "in") onChange(Math.min(t, duration - fadeOut), fadeOut);
    else onChange(fadeIn, Math.min(duration - t, duration - fadeIn));
  }

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        const t = valueFromPointer(e, ref.current!, 0, duration);
        active.current = Math.abs(t - fadeIn) <= Math.abs(duration - fadeOut - t) ? "in" : "out";
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={() => (active.current = null)}
      style={{ touchAction: "none", height: H + 8 }}
      className="relative my-1 w-full select-none"
    >
      <svg className="pointer-events-none absolute inset-x-0 top-1" width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
        <rect x={0} y={0} width={100} height={H} fill={`${color}2e`} stroke={`${color}b3`} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path
          d={`M0 ${H} Q${inPct * 0.35} ${H * 0.15} ${inPct} 0 L${outPct} 0 Q${100 - (100 - outPct) * 0.35} ${H * 0.15} 100 ${H}`}
          fill="none"
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <FaderCap pct={inPct} />
      <FaderCap pct={outPct} />
    </div>
  );
}
