const SR = 44100;

/**
 * A sung line the way a phone records it, not a clean synthetic vowel: glottal
 * pulses with period jitter and amplitude shimmer, breath noise, glides between
 * notes, 5 Hz vibrato, a creaky stretch below 90 Hz, consonant bursts and
 * silences. The earlier tests used a perfectly periodic vowel and so missed
 * two real-voice failures: output 20-30x too loud when the Level knob was low,
 * and an engine that then went silent and burned CPU catching up.
 */
export function phoneVoice(seconds: number, seed = 7): Float32Array {
  let r = seed;
  const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  const formants = [
    { f: 700, bw: 110 },
    { f: 1200, bw: 130 },
    { f: 2600, bw: 220 },
  ].map(({ f, bw }) => {
    const rr = Math.exp((-Math.PI * bw) / SR);
    return { a1: 2 * rr * Math.cos((2 * Math.PI * f) / SR), a2: -rr * rr, y1: 0, y2: 0 };
  });
  let t = 0;
  let nextPulse = 0;
  let amp = 1;
  let noteHz = 180;
  let hz = 180;
  let phaseVib = 0;
  let sectionEnd = 0;
  let section: "voice" | "gap" | "creak" | "burst" = "gap";
  for (let i = 0; i < n; i++) {
    t = i / SR;
    if (t >= sectionEnd) {
      const pick = rand();
      section = pick < 0.55 ? "voice" : pick < 0.72 ? "gap" : pick < 0.86 ? "creak" : "burst";
      sectionEnd = t + (section === "gap" ? 0.12 + rand() * 0.25 : section === "burst" ? 0.05 + rand() * 0.08 : 0.25 + rand() * 0.5);
      if (section === "voice") noteHz = 100 * Math.pow(2, rand() * 1.8);
      if (section === "creak") noteHz = 70 + rand() * 20;
    }
    hz += (noteHz - hz) * 0.0015; // glide
    phaseVib += (2 * Math.PI * 5) / SR;
    const f0 = hz * Math.pow(2, (20 * Math.sin(phaseVib)) / 1200);
    let excitation = 0;
    if (section === "voice" || section === "creak") {
      if (i >= nextPulse) {
        excitation = amp * (section === "creak" ? 2.2 : 1);
        amp = 0.85 + rand() * 0.3; // shimmer
        nextPulse = i + (SR / f0) * (1 + (rand() - 0.5) * (section === "creak" ? 0.18 : 0.04)); // jitter
      }
      excitation += (rand() - 0.5) * 0.03;
    } else if (section === "burst") {
      excitation = (rand() - 0.5) * 0.8;
    }
    let y = excitation;
    for (const f of formants) {
      const v = y + f.a1 * f.y1 + f.a2 * f.y2;
      f.y2 = f.y1;
      f.y1 = v;
      y = v;
    }
    out[i] = y;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = 0.6 / (peak || 1);
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}
