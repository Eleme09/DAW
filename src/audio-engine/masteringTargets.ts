/**
 * Per-platform loudness targets for the Mastering Assistant (Phase 13).
 * These are widely-published streaming-normalization targets (Spotify,
 * Apple Music, YouTube, etc. publish theirs), not something derived from
 * this project's own measurements — treat them as reasonable reference
 * points, not guaranteed-exact platform behavior, which changes over time
 * and isn't guaranteed to be public. Every suggestion this produces is a
 * dB delta to review and apply manually, never a silent auto-master.
 */

export type MasteringPlatform = "spotify" | "appleMusic" | "youtube" | "soundcloud" | "tiktok";

export const PLATFORM_LABELS: Record<MasteringPlatform, string> = {
  spotify: "Spotify",
  appleMusic: "Apple Music",
  youtube: "YouTube",
  soundcloud: "SoundCloud",
  tiktok: "TikTok",
};

export const PLATFORM_LUFS_TARGETS: Record<MasteringPlatform, number> = {
  spotify: -14,
  appleMusic: -16,
  youtube: -14,
  soundcloud: -13,
  tiktok: -14,
};

export interface MasteringSuggestion {
  platform: MasteringPlatform;
  targetLufs: number;
  currentLufs: number;
  /** dB of gain to add (negative = turn down) to land on the target. */
  deltaDb: number;
}

/**
 * `currentLufs` is expected to be the same approximate K-weighted read
 * `approxLufsFromMix`/the live Analyzer produce elsewhere in this app —
 * -Infinity (silence) is handled by suggesting no change rather than an
 * infinite gain jump.
 */
export function suggestMasteringGain(currentLufs: number, platform: MasteringPlatform): MasteringSuggestion {
  const targetLufs = PLATFORM_LUFS_TARGETS[platform];
  const deltaDb = Number.isFinite(currentLufs) ? targetLufs - currentLufs : 0;
  return { platform, targetLufs, currentLufs, deltaDb };
}
