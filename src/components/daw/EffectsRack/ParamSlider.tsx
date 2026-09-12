"use client";

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

export function ParamSlider({ label, value, min, max, step, unit = "", decimals = 1, onChange }: ParamSliderProps) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-neutral-400">
      <span className="w-16 shrink-0 truncate">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 accent-cyan-500"
      />
      <span className="w-14 shrink-0 text-right tabular-nums text-neutral-300">
        {value.toFixed(decimals)}
        {unit}
      </span>
    </label>
  );
}
