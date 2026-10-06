/**
 * Fader law: where a fader's thumb sits for a given level. The faders used
 * to spread -60..+6 dB evenly along the travel, so halfway was -27 dB -
 * nearly silent - and all the useful range (-12..+6) was crammed into the
 * top quarter. This is the cubic law mixing consoles approximate: gain =
 * (position / unityPosition)^3. 0 dB sits at 79 % of the travel, halfway is
 * -12 dB, a quarter is -30 dB, the bottom is silence (-60 dB, the floor).
 */

export const FADER_MIN_DB = -60;
export const FADER_MAX_DB = 6;
/** Travel position (0..1) of 0 dB: where +6 dB lands at the top. */
const UNITY = Math.pow(10, -FADER_MAX_DB / 60);

/** 0..1 travel -> dB (-60 floor at the bottom). */
export function faderPosToDb(pos: number): number {
  const p = Math.min(1, Math.max(0, pos));
  if (p <= 0) return FADER_MIN_DB;
  const db = 60 * Math.log10(p / UNITY);
  return Math.min(FADER_MAX_DB, Math.max(FADER_MIN_DB, db));
}

/** dB -> 0..1 travel. */
export function faderDbToPos(db: number): number {
  if (!Number.isFinite(db) || db <= FADER_MIN_DB) return 0;
  return Math.min(1, Math.max(0, UNITY * Math.pow(10, Math.min(FADER_MAX_DB, db) / 60)));
}
