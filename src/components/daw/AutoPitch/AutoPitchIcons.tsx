import type { SVGProps } from "react";
import type { AutoPitchPresetId } from "@/types/autoPitch";

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** One line glyph per AutoPitch preset, drawn after the shapes in BandLab's
 * preset row (user's recordings) - same 24px grid as icons.tsx. */
const PATHS: Record<AutoPitchPresetId, React.ReactNode> = {
  classic: (
    <>
      <path d="M3.5 14 10 7.5l6.5 6.5L10 20.5z" />
      <circle cx="18.5" cy="5.5" r="1.8" />
    </>
  ),
  duet: (
    <>
      <circle cx="7" cy="15" r="3.5" />
      <circle cx="17" cy="15" r="3.5" />
      <path d="M10.5 15h3M3.5 8.5l2-2.5 2 2.5 2-2.5 2 2.5 2-2.5 2 2.5 2-2.5 2 2.5" />
    </>
  ),
  bigHarmony: (
    <>
      <path d="M4 7c2.7-1.6 5.3-1.6 8 0s5.3 1.6 8 0" />
      <path d="M4 12h3M10.5 12h3M17 12h3" />
      <path d="M4 17c2.7 1.6 5.3 1.6 8 0s5.3-1.6 8 0" />
    </>
  ),
  natural: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(45 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-45 12 12)" />
      <circle cx="12" cy="12" r="1.3" />
    </>
  ),
  third: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5c-3 2.5-3 6 0 8.5s3 6 0 8.5" />
      <circle cx="15.5" cy="9" r="1.4" />
    </>
  ),
  chip: (
    <>
      <path d="M5 19v-4h5v-4h5V7" />
      <path d="M12.5 9.5 15 7l2.5 2.5M15 7v0" />
      <path d="M19 14v5h-3" />
    </>
  ),
  modernRap: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6.5 12c1.3-3 2.7-3 4 0s2.7 3 4 0 2-2 3-1" />
    </>
  ),
  stone: (
    <>
      <path d="M12 3 20 8.5 17 20H7L4 8.5z" />
      <path d="M4 8.5h16M12 3l-3 5.5L12 20l3-11.5z" />
    </>
  ),
  yummy: (
    <>
      <path d="M8 10.5 12 21l4-10.5" />
      <path d="M7 10.5a5 5 0 0 1 10 0z" />
      <path d="M12 5.5c.5-1.5 1.5-2.2 3-2.5" />
    </>
  ),
  playCard: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M12 8.5 14.5 12 12 15.5 9.5 12z" />
    </>
  ),
  ocean: (
    <>
      <path d="M3 8c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0" />
      <path d="M3 12.5c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0" />
      <path d="M3 17c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0" />
    </>
  ),
  telephone: (
    <>
      <rect x="4" y="5" width="7" height="14" rx="1.5" />
      <path d="M14.5 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
    </>
  ),
  simulacrum: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 16.5c-1-3 1-6 4.5-6 2 0 3 1.3 3 2.6 0 1.6-1.6 2.4-3 2-1.5-.4-1.7-2-.8-2.8" />
      <path d="M9 4.5c2 1.5 4 1.5 7 0" />
    </>
  ),
  ultrashift: (
    <>
      <path d="M12 3 7.5 9.5H10L8 16h8l-2-6.5h2.5z" />
      <path d="M10 19.5h4" />
    </>
  ),
  hyper: (
    <>
      <path d="M4 5v14l8-7zM20 5v14l-8-7z" />
    </>
  ),
  bitz: (
    <>
      <path d="M7 4h7v3h3v13H7z" />
      <path d="M10 8h4v4h-4zM10 15h4" />
    </>
  ),
  amped: (
    <>
      <path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z" />
      <path d="M12 7 16 9.3v5.4L12 17l-4-2.3V9.3z" />
    </>
  ),
  appleX: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.5 8.5a4.5 4.5 0 1 0 0 7" />
      <path d="M11 12h6" />
    </>
  ),
  robot: (
    <>
      <path d="M6 20v-7a6 6 0 0 1 12 0v7z" />
      <path d="M6 15h12M12 4v3" />
      <circle cx="12" cy="3.3" r="0.9" />
    </>
  ),
  futurescape: (
    <>
      <path d="M4 15h7M6 18.5h9M3 11.5h5" />
      <path d="M10 11.5 20 5l-4 10" />
    </>
  ),
  krafty: (
    <>
      <path d="M5 19 9 9l3 6 3-10 4 13" />
      <circle cx="9" cy="9" r="1.2" />
      <circle cx="15" cy="5" r="1.2" />
    </>
  ),
  gorgon: (
    <>
      <path d="M17 6.5C15.8 4.6 13 4 10.8 5 8.5 6 8.3 8.8 10.5 10l3 1.6c2.4 1.3 2 4.4-.4 5.3-2.3.8-4.7-.1-5.6-2" />
      <path d="M19 9.5c-.8-1-1.6-1.4-2.6-1.6M5 14.5c.6 1.3 1.6 2.1 2.6 2.4" />
    </>
  ),
  halo: (
    <>
      <path d="M12 4 19.6 9.5l-2.9 9H7.3l-2.9-9z" />
      <path d="M12 8.5 15 10.7l-1.1 3.5h-3.8L9 10.7z" />
    </>
  ),
  drone: (
    <>
      <path d="M8 8l8 8M16 8l-8 8" />
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="18" r="2.4" />
    </>
  ),
};

export function AutoPitchPresetIcon({ presetId, ...props }: { presetId: AutoPitchPresetId } & SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      {PATHS[presetId]}
    </svg>
  );
}
