import type { MonitorMode } from "@/types/project";

/** Shared by every surface with a monitor-mode toggle button (TrackHeader,
 * MixerPanel, VozPanel) - was three independent copies before, a real risk
 * of the label/color text drifting out of sync with each other. */
/** Two states now: the mic only opens during a take either way, so "on"
 * (kept for old projects) behaves like "auto". */
export const MONITOR_NEXT: Record<MonitorMode, MonitorMode> = { off: "auto", auto: "off", on: "off" };
export const MONITOR_LABEL: Record<MonitorMode, string> = {
  off: "Monitor apagado: no te escuchas al grabar",
  auto: "Monitor: te escuchas mientras grabas",
  on: "Monitor: te escuchas mientras grabas",
};
export const MONITOR_CLASS: Record<MonitorMode, string> = {
  off: "bg-surf-2 text-bone-3 hover:text-bone",
  auto: "bg-surf-3 text-bone-2",
  on: "bg-live text-ink",
};
