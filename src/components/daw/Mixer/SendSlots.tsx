"use client";

import { useProjectStore } from "@/state/projectStore";
import type { Track } from "@/types/project";
import { Picker } from "../ui/Picker";
import { Knob } from "../ui/Knob";

/** PROMPT_MAESTRO FASE 3: "2 sends" per channel - slots fill in array order
 * (Track.sends), not by a fixed index, so there's no separate "slot 1 vs
 * slot 2" identity to track beyond how many are currently assigned. */
const SEND_SLOTS = 2;
const DEFAULT_SEND_LEVEL_DB = -12;

interface SendSlotsProps {
  track: Track;
}

/** Up to 2 auxiliary sends for one track - a bus picker + level knob per
 * slot, shared by the desktop strip and the mobile channel row so both
 * read/write the exact same store actions instead of two implementations
 * that could drift. Renders nothing once there isn't at least one bus to
 * send to - an empty picker offering zero real destinations would be a
 * dead control, not a usable one. */
export function SendSlots({ track }: SendSlotsProps) {
  const buses = useProjectStore((s) => s.project.buses);
  const setTrackSend = useProjectStore((s) => s.setTrackSend);
  const removeTrackSend = useProjectStore((s) => s.removeTrackSend);

  if (buses.length === 0) return null;

  const options = [{ value: "", label: "— Sin envío —" }, ...buses.map((b) => ({ value: b.id, label: b.name }))];

  return (
    <div className="w-full space-y-1.5" onClick={(e) => e.stopPropagation()}>
      {Array.from({ length: SEND_SLOTS }, (_, i) => {
        const send = track.sends[i];
        return (
          <div key={i} className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <Picker
                value={send?.busId ?? ""}
                options={options}
                title={`Envío ${i + 1} de "${track.name}"`}
                onChange={(busId) => {
                  if (!busId) {
                    if (send) removeTrackSend(track.id, send.busId);
                    return;
                  }
                  setTrackSend(track.id, busId, send?.levelDb ?? DEFAULT_SEND_LEVEL_DB);
                }}
              />
            </div>
            {send && (
              <Knob
                value={send.levelDb}
                min={-60}
                max={6}
                defaultValue={DEFAULT_SEND_LEVEL_DB}
                label={`Env. ${i + 1}`}
                unit=" dB"
                size={32}
                onChange={(levelDb) => setTrackSend(track.id, send.busId, levelDb)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
