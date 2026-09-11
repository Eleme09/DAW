"use client";

import { useEffect, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { frequencyToMidi } from "@/audio-engine/pitch/noteUtils";
import {
  NOTE_NAMES,
  PITCH_MODE_PRESETS,
  type LivePitchInfo,
  type LivePitchMonitorSettings,
  type PitchMode,
  type ScaleName,
} from "@/types/pitch";

/**
 * Real-time pitch monitor: hear your own voice corrected toward the
 * nearest scale note *while singing*, so you can adjust and land on
 * pitch by ear — a different feature from Pitch Studio's offline
 * "record then correct" (still the better choice for a polished final
 * take). See AUDIO_ENGINE.md "Real-time pitch monitor" for the causal
 * granular pitch-shifting approach this uses and its latency/quality
 * tradeoffs versus the offline PSOLA render.
 */
function hzToNoteLabel(hz: number | null): string {
  if (hz === null) return "—";
  const midi = frequencyToMidi(hz);
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  const centsLabel = cents === 0 ? "" : ` ${cents > 0 ? "+" : ""}${cents}¢`;
  return `${name}${octave}${centsLabel}`;
}

export function LivePitchMonitorPanel() {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const [scale, setScale] = useState<ScaleName>("naturalMinor");
  const [mode, setMode] = useState<PitchMode>("natural");
  const [retuneSpeedMs, setRetuneSpeedMs] = useState(PITCH_MODE_PRESETS.natural.retuneSpeedMs);
  const [humanizeAmount, setHumanizeAmount] = useState(PITCH_MODE_PRESETS.natural.humanizeAmount);
  const [live, setLive] = useState<LivePitchInfo>({ detectedHz: null, targetHz: null, confidence: 0 });

  useEffect(() => {
    const unsubscribe = getAudioEngine().onLivePitchUpdate((info) => setLive(info));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!active) return;
    getAudioEngine().updateLivePitchMonitorSettings({ key, scale, retuneSpeedMs, humanizeAmount });
  }, [active, key, scale, retuneSpeedMs, humanizeAmount]);

  function applyMode(next: PitchMode) {
    setMode(next);
    setRetuneSpeedMs(PITCH_MODE_PRESETS[next].retuneSpeedMs);
    setHumanizeAmount(PITCH_MODE_PRESETS[next].humanizeAmount);
  }

  async function toggle() {
    setError(null);
    if (active) {
      getAudioEngine().disableLivePitchMonitor();
      setActive(false);
      setLive({ detectedHz: null, targetHz: null, confidence: 0 });
      return;
    }
    setStarting(true);
    try {
      const settings: LivePitchMonitorSettings = { key, scale, retuneSpeedMs, humanizeAmount };
      const result = await getAudioEngine().enableLivePitchMonitor(settings);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setActive(true);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs">
      <button
        onClick={toggle}
        disabled={starting}
        className={`rounded px-2 py-1 font-semibold disabled:opacity-50 ${
          active ? "animate-pulse bg-red-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
        }`}
      >
        {starting ? "…" : active ? "🎤 Live Tune ON" : "🎤 Live Tune"}
      </button>

      {active && (
        <>
          <select
            value={key}
            onChange={(e) => setKey(Number(e.target.value))}
            className="rounded bg-neutral-900 px-1.5 py-1 text-neutral-300"
          >
            {NOTE_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={scale}
            onChange={(e) => setScale(e.target.value as ScaleName)}
            className="rounded bg-neutral-900 px-1.5 py-1 text-neutral-300"
          >
            <option value="major">Major</option>
            <option value="naturalMinor">Minor</option>
            <option value="chromatic">Chromatic</option>
          </select>
          <div className="flex gap-0.5">
            {(["natural", "hardTune", "modernTrap", "extreme"] as const).map((m) => (
              <button
                key={m}
                onClick={() => applyMode(m)}
                className={`rounded px-1.5 py-1 text-[10px] uppercase ${
                  mode === m ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {m === "hardTune" ? "Hard" : m === "modernTrap" ? "Trap" : m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 rounded bg-neutral-900 px-2 py-1 tabular-nums">
            <span className="text-neutral-500">Sung</span>
            <span className="text-neutral-200">{hzToNoteLabel(live.detectedHz)}</span>
            <span className="text-neutral-600">→</span>
            <span className="text-orange-400">{hzToNoteLabel(live.targetHz)}</span>
          </div>

          <span className="text-red-400" title="El mic se manda directo al parlante/auriculares para que te escuches en tiempo real.">
            ⚠ Usá auriculares — sin ellos vas a tener feedback/eco
          </span>
        </>
      )}

      {error && <span className="text-red-400">{error}</span>}
    </div>
  );
}
