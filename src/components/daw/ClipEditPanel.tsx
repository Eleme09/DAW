"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import {
  detectClipKey,
  renderHarmonyVoices,
  stretchClip,
  transposeClip,
  type DetectedKey,
  type HarmonyVoice,
} from "@/lib/audio/clipProcessing";
import type { AudioClip } from "@/types/project";
import type { ScaleName } from "@/types/pitch";
import { Picker } from "./ui/Picker";
import { PlayIcon, PauseIcon } from "./icons";

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
  shift: "Cambio",
  gain: "Ganancia",
  transpose: "Transponer",
  stretch: "Expansión de tiempo",
  fade: "Fade",
  loop: "Loop",
  harmonize: "Armonizar",
} as const;

/**
 * BandLab's bottom panel for a valued region action (user's screen
 * recordings): value on top, a slider (purple fill from zero, white thumb),
 * and a row ▶ · name · ✓. It replaces the transport while open. Shift, Gain,
 * Fade and Loop apply live as you move them; Transpose, Time-stretch and
 * Harmonize render audio when you press ✓. Undo reverts any of them.
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
  const [speedListOpen, setSpeedListOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Harmonize state
  const [key, setKey] = useState<DetectedKey | null>(null);
  const [keyDetected, setKeyDetected] = useState<"pending" | "ok" | "none">("pending");
  const [voices, setVoices] = useState<number[]>([2]);
  const [humanize, setHumanize] = useState(true);

  useEffect(() => {
    if (mode !== "harmonize") return;
    let cancelled = false;
    detectClipKey(clip)
      .then((k) => {
        if (cancelled) return;
        setKey(k ?? { key: 0, scale: "major" });
        setKeyDetected(k ? "ok" : "none");
      })
      .catch(() => !cancelled && setKeyDetected("none"));
    return () => {
      cancelled = true;
    };
    // Detect once per panel open - the clip's audio doesn't change while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
    try {
      if (mode === "transpose" && semitones !== 0) {
        setBusy(true);
        update(await transposeClip(clip, semitones));
        s.showToast("Éxito");
      } else if (mode === "stretch" && speed !== 1) {
        setBusy(true);
        update(await stretchClip(clip, speed));
        s.showToast("Éxito");
      } else if (mode === "harmonize") {
        if (!key || voices.length === 0) return;
        setBusy(true);
        await createHarmonyTracks(clip, key, voices, humanize);
        s.showToast(`Éxito: ${voices.length} ${voices.length === 1 ? "voz creada" : "voces creadas"}`);
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar");
    } finally {
      setBusy(false);
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
        onChange={(v) => update({ startTime: Math.max(0, baseStart + Math.round(v) / 1000) })}
      />
    );
  } else if (mode === "gain") {
    value = `${clip.gainDb >= 0 ? "+" : ""}${clip.gainDb.toFixed(1)} dB`;
    control = (
      <EditSlider min={-GAIN_RANGE_DB} max={GAIN_RANGE_DB} value={clip.gainDb} bipolar onChange={(v) => update({ gainDb: Math.round(v * 10) / 10 })} />
    );
  } else if (mode === "transpose") {
    value = semitones === 0 ? "±0 semitonos" : `${semitones > 0 ? "+" : ""}${semitones} semitonos`;
    control = <EditSlider min={-TRANSPOSE_RANGE} max={TRANSPOSE_RANGE} value={semitones} bipolar onChange={(v) => setSemitones(Math.round(v))} />;
  } else if (mode === "fade") {
    control = (
      <FadeSlider
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
      <div className="flex justify-center gap-2 py-2">
        {LOOP_OPTIONS.map((n) => (
          <button
            key={n}
            onClick={() => {
              const len = loopLength ?? clip.duration;
              update({ loopLengthSec: len, duration: len * n, fadeOutSec: 0 });
            }}
            className={`h-11 w-16 rounded-full text-sm font-semibold ${count === n ? "bg-bone text-ink" : "bg-surf-2 text-bone"}`}
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => loopLength && update({ duration: loopLength, loopLengthSec: undefined })}
          disabled={!loopLength}
          className="h-11 rounded-full bg-surf-2 px-4 text-sm font-semibold text-bone disabled:opacity-30"
        >
          Desactivar
        </button>
      </div>
    );
  } else if (mode === "harmonize") {
    control = (
      <div className="space-y-3 py-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-bone-3">Tonalidad</span>
          {keyDetected === "pending" ? (
            <span className="text-bone-2">detectando…</span>
          ) : (
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
                  setKey({ key: Number(k), scale: scale as ScaleName });
                }}
              />
            </div>
          )}
          {keyDetected === "none" && <span className="text-[11px] text-bone-3">no se detectó, elígela</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HARMONY_VOICES.map((v) => {
            const on = voices.includes(v.steps);
            return (
              <button
                key={v.steps}
                onClick={() => setVoices((cur) => (on ? cur.filter((x) => x !== v.steps) : [...cur, v.steps]))}
                className={`h-9 rounded-full px-3 text-xs font-semibold ${on ? "bg-[#a855f7] text-white" : "bg-surf-2 text-bone-2"}`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-xs text-bone-2">
          <input type="checkbox" checked={humanize} onChange={(e) => setHumanize(e.target.checked)} className="h-4 w-4 accent-[#a855f7]" />
          Humanizar (cada voz un poco desafinada y retrasada, como un coro real)
        </label>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-line bg-ink px-4 pt-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}>
      {value && <div className="text-center text-xs tabular-nums text-bone-3">{value}</div>}
      {control}
      {error && <p className="pb-1 text-xs text-red-400">{error}</p>}
      <div className="relative flex h-12 items-center justify-between">
        <button onClick={togglePreview} aria-label={isPlaying ? "Pausar" : "Escuchar"} className="flex h-11 w-11 items-center justify-center text-bone">
          {isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
        </button>
        {mode === "stretch" && (
          <div className="absolute left-12">
            <button onClick={() => setSpeedListOpen((o) => !o)} className="h-10 rounded-lg bg-surf-2 px-3 text-xs font-semibold text-bone">
              {speed.toFixed(2)}x
            </button>
            {speedListOpen && (
              <div className="absolute bottom-12 left-0 overflow-hidden rounded-lg bg-surf-2 shadow-xl">
                {STRETCH_OPTIONS.map((o) => (
                  <button
                    key={o}
                    onClick={() => {
                      setSpeed(o);
                      setSpeedListOpen(false);
                    }}
                    className={`block h-10 w-20 text-xs font-semibold ${speed === o ? "bg-surf-3 text-bone" : "text-bone-2"}`}
                  >
                    {o.toFixed(2)}x
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <span className="text-sm font-medium text-bone">{busy ? "Procesando…" : TITLES[mode]}</span>
        <button onClick={() => void confirm()} disabled={busy} aria-label="Aplicar" className="flex h-11 w-11 items-center justify-center text-bone disabled:opacity-30">
          <CheckIcon className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

/** One new track per harmony voice, under the original's effects, spread
 * left/right and 6 dB down - the usual way a harmony stack sits in a mix. */
async function createHarmonyTracks(clip: AudioClip, key: DetectedKey, steps: number[], humanize: boolean) {
  const s = useProjectStore.getState();
  const source = s.project.tracks.find((t) => t.id === clip.trackId);
  const voices = HARMONY_VOICES.filter((v) => steps.includes(v.steps));
  const rendered = await renderHarmonyVoices(clip, key, voices, humanize);
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

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function valueFromPointer(e: React.PointerEvent, el: HTMLElement, min: number, max: number) {
  const rect = el.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  return min + pct * (max - min);
}

function EditSlider({
  min,
  max,
  value,
  onChange,
  bipolar = false,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  bipolar?: boolean;
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
      className="relative h-11 w-full cursor-pointer select-none"
    >
      <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-white/20" />
      <div
        className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-[#a855f7]"
        style={{ left: `${Math.min(pct, zeroPct)}%`, width: `${Math.abs(pct - zeroPct)}%` }}
      />
      <div className="absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `calc(${pct}% - 12px)` }} />
    </div>
  );
}

/** Two thumbs: left = fade-in length from the start, right = fade-out from the end. */
function FadeSlider({
  duration,
  fadeIn,
  fadeOut,
  onChange,
}: {
  duration: number;
  fadeIn: number;
  fadeOut: number;
  onChange: (fadeIn: number, fadeOut: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<"in" | "out" | null>(null);
  const inPct = (fadeIn / duration) * 100;
  const outPct = 100 - (fadeOut / duration) * 100;

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
      style={{ touchAction: "none" }}
      className="relative mt-2 h-11 w-full select-none"
    >
      <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-white/20" />
      <div className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-[#a855f7]" style={{ left: `${inPct}%`, width: `${Math.max(0, outPct - inPct)}%` }} />
      <div className="absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `calc(${inPct}% - 12px)` }} />
      <div className="absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `calc(${outPct}% - 12px)` }} />
    </div>
  );
}
