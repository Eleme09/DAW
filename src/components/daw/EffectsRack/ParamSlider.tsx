"use client";

import { Knob } from "../ui/Knob";

interface ParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  onChange: (value: number) => void;
}

/** Thin wrapper around Knob keeping the old ParamSlider prop shape, so every
 * existing effect-params call site (every effect type, InstrumentSettings)
 * got a real rotary control instead of a native `<input type=range>`
 * without touching each one individually - PROMPT_MAESTRO FASE 9 prohibits
 * native range inputs anywhere in an audio context. `step` is accepted for
 * source compatibility but unused - a knob's long-throw drag is
 * continuous, not stepped. */
export function ParamSlider({ label, value, min, max, unit = "", decimals = 1, onChange }: ParamSliderProps) {
  return <Knob value={value} min={min} max={max} label={label} unit={unit} decimals={decimals} size={36} onChange={onChange} />;
}
