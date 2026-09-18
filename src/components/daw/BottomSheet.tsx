"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Minimal modal bottom sheet — FASE 1's base "hoja deslizable" component.
 * Tap the backdrop or the close button to dismiss. No drag-to-dismiss
 * gesture yet (deferred — see PROGRESS.md); this covers the concrete need
 * driving it (moving TransportBar's secondary controls off the mobile row).
 *
 * Rendered via a portal to `document.body`, not inline where it's invoked.
 * Several callers (TrackHeader's "More options", the clip context sheets)
 * live inside Timeline's `position: sticky` + horizontally-scrolling
 * container - a real bug on an iPhone (not reproducible with Playwright's
 * synthetic events, only caught from a screen recording of an actual
 * device): WebKit doesn't always treat a `position: fixed` descendant of a
 * `position: sticky` ancestor as fixed to the viewport, so the sheet
 * rendered clipped to the sticky element's own scrolled position instead
 * of covering the screen - title and close button visible, no backdrop, no
 * body. A portal sidesteps the whole class of ancestor-dependent CSS bugs
 * (this one and any future one) by mounting the sheet as a sibling of
 * `<body>`, matching its own `position: fixed` semantics exactly. */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[80vh] w-full overflow-y-auto rounded-t-[3px] border-t border-line bg-ink pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-ink px-4 py-3">
          <span className="text-sm font-semibold text-bone">{title}</span>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar"
            className="flex h-11 w-11 items-center justify-center text-bone-2 hover:text-bone-2"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
