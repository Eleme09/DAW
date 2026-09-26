"use client";

import { useState } from "react";

const STORAGE_PREFIX = "daw-hint-seen:";

function readSeen(id: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + id) === "1";
  } catch {
    // Private browsing / blocked storage - the hint just shows every time.
    return false;
  }
}

/** Tracks whether a first-use hint has already been dismissed, persisted in
 * localStorage - a per-device UI preference, not project data, so it isn't
 * part of the undoable/saved project. Reads localStorage in the lazy
 * initializer rather than an effect - safe here because every caller lives
 * under `DawShell`, which the app mounts with `ssr: false` (see
 * `app/page.tsx`), so this never runs on the server and there's no
 * hydration mismatch to guard against. */
export function useFirstUseHint(id: string): { seen: boolean; dismiss: () => void } {
  const [seen, setSeen] = useState(() => readSeen(id));

  function dismiss() {
    setSeen(true);
    try {
      localStorage.setItem(STORAGE_PREFIX + id, "1");
    } catch {
      // Nothing to persist - it still won't re-show for the rest of this session.
    }
  }

  return { seen, dismiss };
}
