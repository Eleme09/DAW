import type { MonitorMode } from "@/types/project";

/** Shared by every surface with a monitor-mode toggle button (TrackHeader,
 * MixerPanel, VozPanel) - was three independent copies before, a real risk
 * of the label/color text drifting out of sync with each other. */
export const MONITOR_NEXT: Record<MonitorMode, MonitorMode> = { off: "auto", auto: "on", on: "off" };
export const MONITOR_LABEL: Record<MonitorMode, string> = {
  off: "Monitor: apagado (nunca se oye la entrada)",
  auto: "Monitor: automático (se oye la entrada al detener o grabar)",
  on: "Monitor: siempre (se oye la entrada mientras esté armada)",
};
export const MONITOR_CLASS: Record<MonitorMode, string> = {
  off: "bg-surf-2 text-bone-3 hover:text-bone",
  auto: "bg-surf-3 text-bone-2",
  on: "bg-live text-ink",
};
