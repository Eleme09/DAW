"use client";

import type { ReactNode } from "react";
import { useFirstUseHint } from "@/hooks/useFirstUseHint";
import { CloseIcon } from "./icons";

interface FirstUseHintProps {
  /** Unique, stable key for this hint - never reuse across two different
   * explanations, or dismissing one silently dismisses the other too. */
  id: string;
  children: ReactNode;
}

/** A brief, dismissible explanation shown the first time a new
 * feature/screen appears - the guided-flow equivalent of BandLab's
 * first-use onboarding carousels, without building a whole slide system for
 * something that only needs one short line. */
export function FirstUseHint({ id, children }: FirstUseHintProps) {
  const { seen, dismiss } = useFirstUseHint(id);
  if (seen) return null;
  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-line bg-surf px-3 py-2 text-xs text-bone-2">
      <p className="flex-1">{children}</p>
      <button
        onClick={dismiss}
        title="Entendido"
        className="-m-2 flex h-8 w-8 shrink-0 items-center justify-center text-bone-3 hover:text-bone"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
