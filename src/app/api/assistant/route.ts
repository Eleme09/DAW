import Anthropic from "@anthropic-ai/sdk";
import { ASSISTANT_TOOLS, describeAssistantAction, parseToolUse } from "@/lib/ai/assistantTools";
import type { AssistantContext, AssistantProposedAction, AssistantTurnResult } from "@/types/assistant";

/**
 * Server-only route for the natural-language AI Music Assistant (Phase
 * 13). ANTHROPIC_API_KEY never reaches the client — this route is the
 * only place it's read. If it isn't set, the assistant degrades to
 * "not configured" rather than the app failing unclearly (AI_FEATURES.md
 * principle 1: AI must be optional).
 *
 * The model only ever gets the fixed ASSISTANT_TOOLS vocabulary — it
 * cannot express an arbitrary mutation, and every tool call it makes is
 * re-validated by parseToolUse before it's returned to the client as a
 * *proposed* action. Nothing here writes to the project; the client
 * applies (or doesn't) after the user reviews it.
 */

const DEFAULT_MODEL = "claude-sonnet-5";

interface AssistantRequestBody {
  message?: unknown;
  context?: AssistantContext;
}

function buildSystemPrompt(context: AssistantContext): string {
  const trackList = context.tracks.length
    ? context.tracks.map((t) => `- "${t.name}" (id: ${t.id})`).join("\n")
    : "(no tracks yet)";

  return [
    "You are the in-app assistant for a personal DAW (digital audio workstation) used for vocal/beat production.",
    `The project is at ${context.bpm} BPM and has these tracks:`,
    trackList,
    "",
    "When the user asks for a change, call one or more of the provided tools to propose concrete parameter " +
      "changes on a specific track (reference it by its id from the list above, never by guessing an id). " +
      "You never apply changes yourself — the app shows your tool calls to the user for review, so it's fine " +
      "(expected) to propose something and explain it in your reply. Keep parameter values within normal, " +
      "musical ranges consistent with a professional vocal/beat mixing context — see each tool's own " +
      "description for typical ranges. If the request doesn't map to any available tool, needs clarification " +
      "(e.g. which track), or nothing on the project can actually address it, say so plainly in your reply and " +
      "don't call a tool.",
  ].join("\n");
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({
      configured: false,
      reply: "",
      proposedActions: [],
    } satisfies AssistantTurnResult);
  }

  let body: AssistantRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { configured: true, reply: "", proposedActions: [], errorMessage: "Invalid request body" } satisfies AssistantTurnResult,
      { status: 400 }
    );
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const context = body.context;
  if (!message || !context) {
    return Response.json(
      {
        configured: true,
        reply: "",
        proposedActions: [],
        errorMessage: "Missing message or project context",
      } satisfies AssistantTurnResult,
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_ASSISTANT_MODEL || DEFAULT_MODEL;

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: buildSystemPrompt(context),
      messages: [{ role: "user", content: message }],
      tools: ASSISTANT_TOOLS,
    });
  } catch (err) {
    return Response.json(
      {
        configured: true,
        reply: "",
        proposedActions: [],
        errorMessage: err instanceof Error ? err.message : "Assistant request failed",
      } satisfies AssistantTurnResult,
      { status: 502 }
    );
  }

  const trackNameById = new Map(context.tracks.map((t) => [t.id, t.name]));
  let reply = "";
  const proposedActions: AssistantProposedAction[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      reply += block.text;
    } else if (block.type === "tool_use") {
      const action = parseToolUse(block.name, block.input as Record<string, unknown>);
      if (!action) continue;
      const trackName = trackNameById.get(action.trackId) ?? action.trackId;
      proposedActions.push({
        id: crypto.randomUUID(),
        action,
        description: describeAssistantAction(action, trackName),
      });
    }
  }

  return Response.json({
    configured: true,
    reply: reply.trim(),
    proposedActions,
  } satisfies AssistantTurnResult);
}
