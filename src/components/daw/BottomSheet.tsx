"use client";

import type { ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Minimal modal bottom sheet — FASE 1's base "hoja deslizable" component.
 * Tap the backdrop or the close button to dismiss. No drag-to-dismiss
 * gesture yet (deferred — see PROGRESS.md); this covers the concrete need
 * driving it (moving TransportBar's secondary controls off the mobile row). */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[80vh] w-full overflow-y-auto rounded-t-xl border-t border-neutral-800 bg-neutral-950 pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-3">
          <span className="text-sm font-semibold text-neutral-200">{title}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="flex h-8 w-8 items-center justify-center text-neutral-500 hover:text-neutral-300"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4 p-4">{children}</div>
      </div>
    </div>
  );
}
