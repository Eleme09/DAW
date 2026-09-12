"use client";

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label?: string;
}

/** Replaces a native `<select>` for a small closed set of choices (filter
 * type, waveform, mode, note division, ...) - every option visible and
 * tappable at once, each segment a real >=44px-tall touch target. */
export function SegmentedControl<T extends string>({ value, options, onChange, label }: SegmentedControlProps<T>) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-[10px] font-medium uppercase tracking-wide text-bone-2">{label}</span>}
      <div className="flex overflow-hidden rounded-[3px] border border-line bg-ink">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={`flex min-h-11 flex-1 items-center justify-center px-2 text-xs font-medium transition-colors ${
              value === opt.value ? "bg-bone text-ink" : "text-bone-2 hover:bg-surf hover:text-bone"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
