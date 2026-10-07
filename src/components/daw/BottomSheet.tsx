"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** CSS color value (e.g. "var(--cabina-s3)") shown as a small dot before
   * the title — lets a caller like EffectCard carry its one-accent-per-type
   * identity (zona 9) into the full-screen view, not just the rack row. */
  accent?: string;
  /** Extra row rendered below the title inside the same sticky header, e.g.
   * EffectCard's preset navigator + A/B — content that must stay visible
   * while the sheet's body scrolls (zona 1: "cabecera fija"). */
  subtitle?: ReactNode;
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
export function BottomSheet({ open, onClose, title, accent, subtitle, children }: BottomSheetProps) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    // data-keep-region: a tap inside a sheet is not "outside the selected
    // region" (it used to close the Armonizar panel when picking a key)
    <div data-keep-region="" className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[80vh] w-full overflow-y-auto rounded-t-[3px] border-t border-line bg-ink pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 z-10 border-b border-line bg-ink">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-bone">
              {accent && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />}
              {title}
            </span>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              title="Cerrar"
              className="flex h-11 w-11 items-center justify-center text-bone-2 hover:text-bone-2"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          {subtitle && <div className="border-t border-line px-2 pb-2">{subtitle}</div>}
        </div>
        <div className="space-y-4 p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
