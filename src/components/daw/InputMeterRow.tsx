"use client";

import { useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { MeterBar } from "./MeterBar";
import type { Track } from "@/types/project";

interface InputMeterRowProps {
  track: Track;
  isRecording: boolean;
  monitoringLive: boolean;
  likelyHeadphones: boolean | null;
}

/**
 * Thin input-level meter + the two safety badges (clipping, speaker
 * feedback risk) shown under an armed track's controls - shared by
 * TrackHeader and VozPanel so both read the same real routing state
 * instead of one of them drifting into its own approximation.
 */
export function InputMeterRow({ track, isRecording, monitoringLive, likelyHeadphones }: InputMeterRowProps) {
  const [inputClipped, setInputClipped] = useState(false);
  const engine = getAudioEngine();
  const isLiveInput = track.armed && isRecording;

  return (
    <div className="flex h-4 items-center gap-1">
      <div className="flex h-2 flex-1 items-center">
        <MeterBar
          analyser={isLiveInput ? engine.getRecordingAnalyser() : engine.getMonitorAnalyser()}
          vertical={false}
          onClipChange={setInputClipped}
        />
      </div>
      {inputClipped ? (
        <span
          className="shrink-0 rounded bg-red-600 px-1 text-[9px] font-bold uppercase leading-4 text-white"
          title="La entrada está saturando - baja la ganancia del micrófono o aléjate antes de grabar"
        >
          Satura
        </span>
      ) : (
        monitoringLive &&
        likelyHeadphones === false && (
          <span
            className="shrink-0 rounded bg-yellow-500 px-1 text-[9px] font-bold uppercase leading-4 text-black"
            title="Parece que estás monitoreando por altavoz, no por auriculares - riesgo de feedback (detección aproximada, no siempre disponible)"
          >
            Altavoz
          </span>
        )
      )}
    </div>
  );
}
