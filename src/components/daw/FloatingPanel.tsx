"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

interface FloatingPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  accent?: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/**
 * A floating card, not a sheet flush to the screen edge - what BandLab
 * actually shows when you tap a clip (its "Voice Cleaner" menu: a rounded
 * card with margin on every side, anchored low on the screen, not a panel
 * that reads as part of the chrome). `BottomSheet.tsx` stays the edge-to-edge
 * pattern for the other callers (TrackHeader's "⋯", EffectCard's full param
 * editor, TransportBar's "Más") - this is specifically for ClipContextSheet,
 * the one interaction BandLab's own reference shows as a floating menu, not
 * a sheet.
 *
 * Portal to `document.body`, same reasoning as BottomSheet: a caller nested
 * inside Timeline's `position: sticky` scroller breaks `position: fixed` on
 * real iOS Safari (confirmed from a device recording, not reproducible in
 * Playwright) unless this is a sibling of `<body>`, not a descendant of that
 * sticky ancestor.
 */
export function FloatingPanel({ open, onClose, title, accent, subtitle, children }: FloatingPanelProps) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line-2 bg-surf shadow-2xl">
        <div className="shrink-0 border-b border-line bg-surf">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-bone">
              {accent && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />}
              {title}
            </span>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              title="Cerrar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surf-2 text-bone-2 hover:text-bone"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          {subtitle && <div className="border-t border-line px-2 pb-2">{subtitle}</div>}
        </div>
        <div className="space-y-4 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
