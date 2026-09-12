"use client";

import { useState } from "react";
import { BottomSheet } from "../BottomSheet";

interface PickerOption<T extends string> {
  value: T;
  label: string;
  /** Optional section header rendered above this option whenever it
   * differs from the previous option's group - lets a long list (e.g.
   * character vs. genre presets) stay scannable without a separate
   * grouped-select equivalent. */
  group?: string;
}

interface PickerProps<T extends string> {
  value: T;
  options: readonly PickerOption<T>[];
  onChange: (value: T) => void;
  title: string;
  placeholder?: string;
}

/** Replaces a native `<select>` for a list too long for a SegmentedControl
 * row (samples, presets, ...) - a button showing the current choice opens
 * a bottom sheet with every option as its own >=44px tappable row. */
export function Picker<T extends string>({ value, options, onChange, title, placeholder = "Select…" }: PickerProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-between rounded bg-neutral-900 px-3 text-left text-[11px] text-neutral-200"
      >
        <span className="truncate">{current?.label ?? placeholder}</span>
        <span className="text-neutral-600">▾</span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="space-y-1">
          {options.map((opt, i) => (
            <div key={opt.value}>
              {opt.group && opt.group !== options[i - 1]?.group && (
                <p className="mb-1 mt-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 first:mt-0">
                  {opt.group}
                </p>
              )}
              <button
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex min-h-11 w-full items-center rounded px-3 text-left text-sm ${
                  opt.value === value ? "bg-cyan-500 text-black font-semibold" : "bg-neutral-900 text-neutral-200"
                }`}
              >
                {opt.label}
              </button>
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
