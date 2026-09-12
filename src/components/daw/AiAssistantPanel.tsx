"use client";

import { useState } from "react";
import { httpAssistantProvider } from "@/lib/ai/assistantProvider";
import { applyEffectAction } from "@/lib/ai/applyAssistantAction";
import { useProjectStore } from "@/state/projectStore";
import type { AssistantProposedAction, AssistantTurnResult } from "@/types/assistant";
import { SparkleIcon } from "./icons";

/**
 * Natural-language AI Music Assistant (Phase 13). Every proposed action
 * is shown before it's applied — nothing here mutates the project on its
 * own. See AI_FEATURES.md/AUDIO_ENGINE.md for the full design.
 */
export function AiAssistantPanel() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<AssistantTurnResult | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const setEffectChain = useProjectStore((s) => s.setEffectChain);

  async function send() {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setAppliedIds(new Set());
    try {
      const context = {
        bpm: project.bpm,
        tracks: project.tracks.map((t) => ({ id: t.id, name: t.name })),
      };
      const turn = await httpAssistantProvider.sendCommand(trimmed, context);
      setResult(turn);
      setMessage("");
    } finally {
      setSending(false);
    }
  }

  function applyAction(proposed: AssistantProposedAction) {
    const track = project.tracks.find((t) => t.id === proposed.action.trackId);
    if (!track) return;
    const { action } = proposed;
    switch (action.kind) {
      case "setTrackVolume":
        updateTrack(track.id, { volumeDb: action.volumeDb });
        break;
      case "setTrackPan":
        updateTrack(track.id, { pan: action.pan });
        break;
      case "setTrackMute":
        updateTrack(track.id, { muted: action.muted });
        break;
      case "setTrackSolo":
        updateTrack(track.id, { solo: action.solo });
        break;
      default:
        setEffectChain(track.id, applyEffectAction(track.inserts, action));
        break;
    }
    setAppliedIds((prev) => new Set(prev).add(proposed.id));
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-2 text-xs">
      <div className="mb-2 flex items-center gap-1.5 border-b border-neutral-800 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        <SparkleIcon className="h-3.5 w-3.5 text-cyan-400" />
        AI Assistant
      </div>
      <p className="mb-2 text-neutral-500">
        Describe a change in plain language (e.g. &quot;make the vocal darker&quot;, &quot;add some reverb
        to the beat&quot;). The assistant proposes concrete parameter changes — nothing is applied until
        you click Apply.
      </p>

      <div className="flex gap-1">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Ask for a change…"
          className="flex-1 rounded bg-neutral-900 px-2 py-1.5 text-neutral-200 outline-none focus:ring-1 focus:ring-cyan-500"
        />
        <button
          onClick={send}
          disabled={sending || !message.trim()}
          className="rounded bg-cyan-500 px-3 py-1.5 font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
        >
          {sending ? "…" : "Send"}
        </button>
      </div>

      {result && !result.configured && (
        <div className="mt-3 rounded border border-neutral-800 bg-neutral-950 p-2 text-neutral-500">
          AI assistant not configured. Set <code className="text-neutral-400">ANTHROPIC_API_KEY</code> in
          your environment (see <code className="text-neutral-400">.env.example</code>) to enable this —
          everything else in the DAW works without it.
        </div>
      )}

      {result?.errorMessage && (
        <div className="mt-3 rounded border border-red-900 bg-red-950/30 p-2 text-red-400">
          {result.errorMessage}
        </div>
      )}

      {result?.configured && !result.errorMessage && (
        <div className="mt-3 space-y-2">
          {result.reply && (
            <div className="rounded border border-neutral-800 bg-neutral-950 p-2 text-neutral-300">
              {result.reply}
            </div>
          )}
          {result.proposedActions.length > 0 && (
            <ul className="space-y-1.5">
              {result.proposedActions.map((proposed) => (
                <li key={proposed.id} className="rounded bg-neutral-900 p-2">
                  <p className="text-neutral-400">{proposed.description}</p>
                  <button
                    onClick={() => applyAction(proposed)}
                    disabled={appliedIds.has(proposed.id)}
                    className="mt-1.5 w-full rounded bg-neutral-800 py-1 text-[11px] font-semibold text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
                  >
                    {appliedIds.has(proposed.id) ? "Applied" : "Apply"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
