import type { AssistantContext, AssistantTurnResult } from "@/types/assistant";

/**
 * Swappable interface for the natural-language assistant's backend. The
 * rest of the app (the UI panel) only ever talks to this shape — no
 * Anthropic-specific types leak past it, so a different provider could be
 * dropped in later without touching the UI or the action-application
 * logic. See AI_FEATURES.md's original open question on this; this is
 * the resolution.
 */
export interface AssistantProvider {
  sendCommand(message: string, context: AssistantContext): Promise<AssistantTurnResult>;
}

/** Calls this app's own /api/assistant route, which keeps the API key server-only. */
export const httpAssistantProvider: AssistantProvider = {
  async sendCommand(message, context) {
    let res: Response;
    try {
      res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context }),
      });
    } catch (err) {
      return {
        configured: true,
        reply: "",
        proposedActions: [],
        errorMessage: err instanceof Error ? err.message : "No se pudo contactar al asistente",
      };
    }

    if (!res.ok) {
      return { configured: true, reply: "", proposedActions: [], errorMessage: `Falló la petición al asistente (${res.status})` };
    }
    return (await res.json()) as AssistantTurnResult;
  },
};
