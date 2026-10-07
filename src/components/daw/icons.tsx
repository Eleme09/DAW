import type { SVGProps } from "react";

/**
 * Minimal line-icon set shared by the panel/tab strips (BrowserPanel,
 * EffectsRackPanel, DawShell's mobile nav). Every icon is authored to the
 * same 24x24 grid, 1.75 stroke weight, currentColor — so swapping labels for
 * icon+label pairs stays visually consistent across the whole shell instead
 * of each panel inventing its own glyph language.
 */
const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** Studio: regions on their lanes. */
export function WaveformIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4.5" width="10" height="4" rx="1.3" />
      <rect x="8" y="10" width="13" height="4" rx="1.3" />
      <rect x="3" y="15.5" width="7" height="4" rx="1.3" />
    </svg>
  );
}

export function MixIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="6" y1="4" x2="6" y2="20" />
      <circle cx="6" cy="9" r="1.75" fill="currentColor" stroke="none" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <circle cx="12" cy="15" r="1.75" fill="currentColor" stroke="none" />
      <line x1="18" y1="4" x2="18" y2="20" />
      <circle cx="18" cy="7" r="1.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SparkleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z" />
      <path d="M18.5 15l0.6 1.5 1.5 0.6-1.5 0.6-0.6 1.5-0.6-1.5-1.5-0.6 1.5-0.6z" />
    </svg>
  );
}

export function FolderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7a1 1 0 0 1 1-1h4.5l2 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z" />
    </svg>
  );
}

export function KnobIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" />
      <line x1="12" y1="12" x2="12" y2="6" />
    </svg>
  );
}

export function TimelineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="6" y1="8" x2="6" y2="16" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="18" y1="8" x2="18" y2="16" />
    </svg>
  );
}

export function NoteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="7" cy="17" r="3" />
      <circle cx="16" cy="15" r="3" />
      <path d="M10 17V5l9-2v10" />
    </svg>
  );
}

export function UndoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5.2 9.5A7.5 7.5 0 1 1 6.8 16.6" />
      <path d="M4.5 4.5v5h5" />
    </svg>
  );
}

export function RedoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M18.8 9.5A7.5 7.5 0 1 0 17.2 16.6" />
      <path d="M19.5 4.5v5h-5" />
    </svg>
  );
}

export function MoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

/** Microphone: capsule, one energy arc, stand. */
export function MicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="8" y="3" width="6.5" height="11" rx="3.25" />
      <path d="M17.6 6.6a4.6 4.6 0 0 1 0 5.8" />
      <path d="M11.25 14v4.5M7.75 20.5h7" />
    </svg>
  );
}

export function AutomationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 17c3 0 3-10 6-10s3 12 6 12 3-8 6-8" />
      <circle cx="9" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="6" y1="4" x2="6" y2="13" />
      <line x1="18" y1="4" x2="18" y2="13" />
      <path d="M6 13l6 6 6-6" />
      <line x1="12" y1="19" x2="12" y2="21" />
    </svg>
  );
}

/** Transporte y controles genéricos añadidos en FASE 10B para reemplazar
 * glifos Unicode usados como icono (✂ ⧉ ✕ ▶ ■ ● ◀ ▸ ▾ ↑ ↓ ❚❚) - el brief de
 * FASE 10 prohíbe explícitamente emojis/glifos sueltos en la interfaz.
 * Play, ChevronLeft y Scissors reutilizan el path exacto de estudio-ui.html. */
export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <path d="M7 4l13 8-13 8z" />
    </svg>
  );
}

export function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function StopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

export function RecordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

/** "Return to zero" transport icon - a filled bar + triangle pointing left,
 * the standard skip-to-start glyph. */
export function RewindIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <rect x="5" y="5" width="2.5" height="14" rx="1" />
      <path d="M18 5.5v13a1 1 0 0 1-1.55.83l-8.5-6.5a1 1 0 0 1 0-1.66l8.5-6.5A1 1 0 0 1 18 5.5z" />
    </svg>
  );
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ArrowUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  );
}

export function ArrowDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <path d="M6 13l6 6 6-6" />
    </svg>
  );
}

export function ScissorsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M7.5 16L18 5M16.5 16L6 5" />
    </svg>
  );
}

export function DuplicateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="8" y="8" width="12" height="12" rx="1.5" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function WarningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5l9.5 16.5H2.5z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function HeadphonesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="2" y="13" width="5" height="7" rx="2" />
      <rect x="17" y="13" width="5" height="7" rx="2" />
    </svg>
  );
}

export function TuneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="5" y1="20" x2="5" y2="14" />
      <line x1="5" y1="10" x2="5" y2="4" />
      <circle cx="5" cy="12" r="2" />
      <line x1="12" y1="20" x2="12" y2="16" />
      <line x1="12" y1="12" x2="12" y2="4" />
      <circle cx="12" cy="14" r="2" />
      <line x1="19" y1="20" x2="19" y2="10" />
      <line x1="19" y1="6" x2="19" y2="4" />
      <circle cx="19" cy="8" r="2" />
    </svg>
  );
}

export function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.7 4.7l1.6 1.6M17.7 17.7l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.7 19.3l1.6-1.6M17.7 6.3l1.6-1.6" />
      <circle cx="12" cy="12" r="6.5" />
    </svg>
  );
}

export function BackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function MetronomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M9.6 3.5h4.8l4.4 17H5.2z" />
      <path d="M12 16l4.2-7.4" />
      <circle cx="16.6" cy="7.9" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function UploadFileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

/** Export / publish: rising out of the horizon. */
export function CloudUploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 15.5V3.5M7.5 8 12 3.5 16.5 8" />
      <path d="M4 13.5a8 8 0 0 0 16 0" />
    </svg>
  );
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  );
}

export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

/** BandLab's slice icon: ]|[ */
export function SliceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5h3v14H5M19 5h-3v14h3M12 3v18" />
    </svg>
  );
}

export function LoopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

/** Harmonize: stacked voices (three notes rising). */
export function HarmonizeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="7" cy="17" r="2.6" />
      <circle cx="13" cy="12.5" r="2.6" />
      <circle cx="19" cy="8" r="2.6" />
      <path d="M9.6 17V5.5M15.6 12.5V5.5M21.6 8V4" opacity={0.7} />
    </svg>
  );
}

export function ShiftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4v16M8 8l-4 4 4 4M16 8l4 4-4 4" />
    </svg>
  );
}

export function GainIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 9h3l4-4v14l-4-4H4z" />
      <path d="M15 9v6M18 7v10" />
    </svg>
  );
}

export function NormalizeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 4h16M4 20h16M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3" />
    </svg>
  );
}

export function TransposeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="7" cy="17" r="2.5" />
      <path d="M9.5 17V6l4-1.5M17 4v12M14 13l3 3 3-3M14 7l3-3 3 3" />
    </svg>
  );
}

export function StretchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4M9 5h6M9 19h6" />
    </svg>
  );
}

export function FadeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3 19L9 5h6l6 14" />
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
    </svg>
  );
}

export function DenoiseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20L20 4M14 4h.01M18 8h.01M20 12h.01M10 4h.01M17 15h.01M7 9h.01M4 13h.01" />
    </svg>
  );
}

export function ReverseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M20 8H5M8 4L4 8l4 4M4 16h15M16 12l4 4-4 4" />
    </svg>
  );
}

export function ChevronUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

/** BandLab's "lyrics/notes" tab glyph: a quill. */
/** Lyrics tab: lines of text and the reading point (teleprompter). */
export function FeatherIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h13M4 10.5h16M4 15h8" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="17" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Settings tab: three horizontal sliders. */
export function HexSettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="12" r="2.3" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17" r="2.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** An effects chain: three nodes linked like a constellation - the app's
 * mark for effects (replaces the "+Fx" text badge). */
export function FxChainIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6.6 13.2 10.4 8.8M13.6 8.8l3.8 4.4" />
      <circle cx="5" cy="15" r="2.3" />
      <circle cx="12" cy="7" r="2.3" fill="currentColor" stroke="none" />
      <circle cx="19" cy="15" r="2.3" />
    </svg>
  );
}
