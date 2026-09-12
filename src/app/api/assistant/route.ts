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

function buildMixSection(mix: AssistantContext["mix"]): string {
  if (!mix) return "";
  const masking = mix.masking.length
    ? mix.masking.map((m) => `${m.trackAName} vs ${m.trackBName} cerca de ${Math.round(m.freqHz)}Hz (${m.band})`).join("; ")
    : "no se detectó ninguno"
  const gainStaging = mix.gainStaging.length
    ? mix.gainStaging
        .map((g) => `${g.trackName} está ${Math.abs(g.deltaFromMedianDb).toFixed(1)}dB ${g.direction === "louder" ? "más alta" : "más baja"} de lo habitual`)
        .join("; ")
    : "los niveles se ven equilibrados";
  const lufs = Number.isFinite(mix.integratedLufs) ? mix.integratedLufs.toFixed(1) : "-inf";

  return [
    "",
    "Ya se midió un análisis DSP real de la mezcla renderizada - basa tu respuesta y cualquier llamada a",
    "herramientas en estos números reales, no en consejos genéricos de mezcla:",
    `- Graves: ${mix.lowEnd}, barro: ${mix.mud}, aspereza: ${mix.harshness}, sibilancia: ${mix.sibilance}`,
    `- Pico ${mix.peakDb.toFixed(1)}dB, RMS ${mix.rmsDb.toFixed(1)}dB, sonoridad integrada ${lufs} LUFS`,
    `- Enmascaramiento de frecuencias: ${masking}`,
    `- Niveles de ganancia: ${gainStaging}`,
  ].join("\n");
}

function buildSystemPrompt(context: AssistantContext): string {
  const trackList = context.tracks.length
    ? context.tracks.map((t) => `- "${t.name}" (id: ${t.id})`).join("\n")
    : "(todavía no hay pistas)";

  return [
    "Eres el asistente integrado de un DAW (estación de audio digital) personal usado para producción de voz/beats.",
    "Responde siempre en español, sin importar en qué idioma esté escrito el mensaje del usuario.",
    `El proyecto está a ${context.bpm} BPM y tiene estas pistas:`,
    trackList,
    buildMixSection(context.mix),
    "",
    "Cuando el usuario pida un cambio, llama a una o más de las herramientas provistas para proponer cambios " +
      "concretos de parámetros en una pista específica (referénciala por su id de la lista de arriba, nunca " +
      "adivines un id). Nunca aplicas los cambios tú mismo — la app le muestra tus llamadas a herramientas al " +
      "usuario para que las revise, así que está bien (es lo esperado) proponer algo y explicarlo en tu " +
      "respuesta. Mantén los valores de los parámetros dentro de rangos normales y musicales, consistentes con " +
      "un contexto profesional de mezcla de voz/beats — revisa la descripción de cada herramienta para ver sus " +
      "rangos típicos. Si el pedido no corresponde a ninguna herramienta disponible, necesita aclaración (por " +
      "ejemplo, qué pista) o nada en el proyecto puede resolverlo, dilo claramente en tu respuesta y no llames " +
      "a ninguna herramienta.",
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
      { configured: true, reply: "", proposedActions: [], errorMessage: "Cuerpo de la petición inválido" } satisfies AssistantTurnResult,
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
        errorMessage: "Falta el mensaje o el contexto del proyecto",
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
        errorMessage: err instanceof Error ? err.message : "Falló la petición al asistente",
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
