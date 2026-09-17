const HEADPHONE_KEYWORDS = /headphone|headset|auricular|audífono|earbud|earphone|airpods|bluetooth/i;

/**
 * Best-effort guess at whether the user is likely on headphones, from
 * `audiooutput` device labels. Web Audio has no real way to know this - a
 * browser that doesn't expose usable output labels (common on mobile) makes
 * this return `null` (unknown), never a false "definitely on speaker".
 * Callers must treat `null` as "don't warn", not as "on speaker".
 */
export function likelyUsingHeadphones(outputDevices: { label: string }[]): boolean | null {
  const labeled = outputDevices.filter((d) => d.label.trim().length > 0);
  if (labeled.length === 0) return null;
  return labeled.some((d) => HEADPHONE_KEYWORDS.test(d.label));
}
