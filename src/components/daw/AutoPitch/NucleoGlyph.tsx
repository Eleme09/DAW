import { AUTOPITCH_RECIPE_BY_ID, type AutoPitchPresetId } from "@/types/autoPitch";

/**
 * Núcleo's preset glyphs: every preset drawn as an atom built from what it
 * really does - one orbit per extra voice (tilted by its interval, the
 * electron above for voices up, below for voices down), a stepped orbit for
 * the quantum jumps of hard tuning, a dashed one for gentle correction, and
 * the nucleus changing shape with the character stage (a synth grid for the
 * vocoder, pixels for the bit crusher, spikes for distortion, a wave for the
 * wah, a halo for chorus/reverb). Same language everywhere: the preset row,
 * the track button.
 */
export function NucleoGlyph({ presetId, className }: { presetId: AutoPitchPresetId; className?: string }) {
  const r = AUTOPITCH_RECIPE_BY_ID[presetId];
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const intervals = [...new Set(r.voices.map((v) => v.interval * (v.diatonic ? 1.7 : 1)))].slice(0, 3);
  const halo = !!(r.chorus || r.reverb);
  const hard = !!r.tune.hard;
  const gentle = r.tune.flex > 0 || r.tune.speedMs >= 30;
  const hollow = r.lead.gain === 0;

  const orbits =
    intervals.length > 0
      ? intervals.map((iv, i) => {
          const deg = ((iv * 23) % 180) - 60 + i * 12;
          const big = Math.abs(iv) >= 12;
          return (
            <g key={i} transform={`rotate(${deg} 20 20)`}>
              <ellipse cx={20} cy={20} rx={big ? 17 : 15} ry={big ? 7.5 : 5.8} {...stroke} strokeOpacity={0.75} />
              <circle cx={20} cy={iv > 0 ? 20 - (big ? 7.5 : 5.8) : 20 + (big ? 7.5 : 5.8)} r={2.1} fill="currentColor" />
            </g>
          );
        })
      : null;

  let nucleus: React.ReactNode;
  if (r.vocoder) {
    nucleus = (
      <g>
        <rect x={14.5} y={14.5} width={11} height={11} rx={2.5} {...stroke} />
        <path d="M17.5 22.5v-5M20 22.5v-3M22.5 22.5v-4" {...stroke} strokeWidth={1.4} />
      </g>
    );
  } else if (r.crush) {
    nucleus = (
      <g fill="currentColor">
        <rect x={15.5} y={15.5} width={4} height={4} rx={0.6} />
        <rect x={20.5} y={20.5} width={4} height={4} rx={0.6} />
        <rect x={20.5} y={15.5} width={4} height={4} rx={0.6} opacity={0.5} />
        <rect x={15.5} y={20.5} width={4} height={4} rx={0.6} opacity={0.5} />
      </g>
    );
  } else if (r.drive && r.drive.amount >= 0.3) {
    const pts = Array.from({ length: 16 }, (_, i) => {
      const a = (i * Math.PI) / 8;
      const rad = i % 2 ? 2.6 : 5.6;
      return `${(20 + rad * Math.cos(a)).toFixed(2)},${(20 + rad * Math.sin(a)).toFixed(2)}`;
    }).join(" ");
    nucleus = <polygon points={pts} fill="currentColor" />;
  } else {
    nucleus = hollow ? <circle cx={20} cy={20} r={4.2} {...stroke} strokeWidth={2} /> : <circle cx={20} cy={20} r={3.8} fill="currentColor" />;
  }

  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      {halo && <circle cx={20} cy={20} r={18.5} {...stroke} strokeWidth={1} strokeOpacity={0.35} strokeDasharray="1.5 3" />}
      {hard ? (
        <g>
          <path d="M6 30h7v-5h7v-5h7v-5h7" {...stroke} strokeOpacity={0.8} />
          <circle cx={34} cy={15} r={2.3} fill="currentColor" />
        </g>
      ) : (
        orbits ?? (
          <g transform="rotate(-28 20 20)">
            <ellipse cx={20} cy={20} rx={16} ry={6.5} {...stroke} strokeOpacity={0.8} strokeDasharray={gentle ? "3 2.4" : undefined} />
            <circle cx={36} cy={20} r={2.2} fill="currentColor" />
          </g>
        )
      )}
      {r.wah && <path d="M5 33c3-4 5-4 7.5 0s4.5 4 7.5 0 4.5-4 7.5 0 4.5 4 7.5 0" {...stroke} strokeWidth={1.3} strokeOpacity={0.8} />}
      {!hard && nucleus}
    </svg>
  );
}
