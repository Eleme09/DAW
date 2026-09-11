import type { AssistantAction } from "@/types/assistant";

/**
 * The assistant's fixed tool vocabulary and the parser that turns a raw
 * tool-call from the model into a typed, validated AssistantAction (or
 * null, if the model returned something malformed — untrusted input is
 * never passed through as-is). Server-only: imported by the /api/assistant
 * route, never by a client component, so the Anthropic-specific request
 * shape stays out of the browser bundle.
 */

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required: string[];
  };
}

const trackIdProp = { type: "string", description: "The id of the track to change (from the project context)." };

export const ASSISTANT_TOOLS: ToolSchema[] = [
  {
    name: "set_track_volume",
    description: "Set a track's fader volume.",
    input_schema: {
      type: "object",
      properties: {
        trackId: trackIdProp,
        volumeDb: { type: "number", description: "Target volume in dB, typically -60 to 6." },
      },
      required: ["trackId", "volumeDb"],
    },
  },
  {
    name: "set_track_pan",
    description: "Set a track's stereo pan position.",
    input_schema: {
      type: "object",
      properties: {
        trackId: trackIdProp,
        pan: { type: "number", description: "-1 (full left) to 1 (full right), 0 = center." },
      },
      required: ["trackId", "pan"],
    },
  },
  {
    name: "set_track_mute",
    description: "Mute or unmute a track.",
    input_schema: {
      type: "object",
      properties: { trackId: trackIdProp, muted: { type: "boolean" } },
      required: ["trackId", "muted"],
    },
  },
  {
    name: "set_track_solo",
    description: "Solo or unsolo a track.",
    input_schema: {
      type: "object",
      properties: { trackId: trackIdProp, solo: { type: "boolean" } },
      required: ["trackId", "solo"],
    },
  },
  {
    name: "add_eq_band",
    description:
      "Add one EQ band to a track (creates the EQ effect if the track doesn't have one yet). Calling this again adds another band rather than replacing the existing ones.",
    input_schema: {
      type: "object",
      properties: {
        trackId: trackIdProp,
        eqType: { type: "string", enum: ["highpass", "lowshelf", "peaking", "highshelf", "lowpass"] },
        freq: { type: "number", description: "Band center/corner frequency in Hz, 20-20000." },
        gainDb: { type: "number", description: "Band gain in dB, ignored for highpass/lowpass." },
        q: { type: "number", description: "Filter Q, typically 0.5-4." },
      },
      required: ["trackId", "eqType", "freq", "gainDb", "q"],
    },
  },
  {
    name: "set_compressor",
    description: "Set (or add) a track's compressor. Calling this again on the same track updates the existing compressor rather than adding a second one.",
    input_schema: {
      type: "object",
      properties: {
        trackId: trackIdProp,
        thresholdDb: { type: "number", description: "Typically -40 to 0." },
        ratio: { type: "number", description: "Typically 1.5 to 10." },
        attackMs: { type: "number", description: "Typically 1 to 50." },
        releaseMs: { type: "number", description: "Typically 50 to 400." },
        makeupDb: { type: "number", description: "Typically 0 to 12." },
      },
      required: ["trackId", "thresholdDb", "ratio", "attackMs", "releaseMs", "makeupDb"],
    },
  },
  {
    name: "set_reverb",
    description: "Set (or add) a track's reverb. Calling this again updates the existing reverb rather than adding a second one.",
    input_schema: {
      type: "object",
      properties: {
        trackId: trackIdProp,
        mix: { type: "number", description: "0 (dry) to 1 (fully wet)." },
        decaySec: { type: "number", description: "Typically 0.3 to 4." },
        sizeType: { type: "string", enum: ["room", "hall", "plate"] },
      },
      required: ["trackId", "mix", "decaySec", "sizeType"],
    },
  },
  {
    name: "set_delay",
    description: "Set (or add) a track's delay. Calling this again updates the existing delay rather than adding a second one.",
    input_schema: {
      type: "object",
      properties: {
        trackId: trackIdProp,
        timeMs: { type: "number", description: "Typically 50 to 1000." },
        feedback: { type: "number", description: "0 to 0.95." },
        mix: { type: "number", description: "0 (dry) to 1 (fully wet)." },
      },
      required: ["trackId", "timeMs", "feedback", "mix"],
    },
  },
  {
    name: "set_saturation",
    description: "Set (or add) a track's saturation/warmth. Calling this again updates the existing saturation rather than adding a second one.",
    input_schema: {
      type: "object",
      properties: {
        trackId: trackIdProp,
        driveDb: { type: "number", description: "Typically 0 to 18." },
        mix: { type: "number", description: "0 (dry) to 1 (fully wet)." },
        tone: { type: "string", enum: ["warm", "neutral", "bright"] },
      },
      required: ["trackId", "driveDb", "mix", "tone"],
    },
  },
];

const EQ_TYPES = new Set(["highpass", "lowshelf", "peaking", "highshelf", "lowpass"]);
const REVERB_SIZES = new Set(["room", "hall", "plate"]);
const SATURATION_TONES = new Set(["warm", "neutral", "bright"]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/** Validates a raw tool-call's input against its expected shape, returning null for anything malformed rather than trusting the model's output. */
export function parseToolUse(name: string, input: Record<string, unknown>): AssistantAction | null {
  const trackId = str(input.trackId);
  if (!trackId) return null;

  switch (name) {
    case "set_track_volume": {
      const volumeDb = num(input.volumeDb);
      return volumeDb === null ? null : { kind: "setTrackVolume", trackId, volumeDb };
    }
    case "set_track_pan": {
      const pan = num(input.pan);
      return pan === null ? null : { kind: "setTrackPan", trackId, pan };
    }
    case "set_track_mute": {
      const muted = bool(input.muted);
      return muted === null ? null : { kind: "setTrackMute", trackId, muted };
    }
    case "set_track_solo": {
      const solo = bool(input.solo);
      return solo === null ? null : { kind: "setTrackSolo", trackId, solo };
    }
    case "add_eq_band": {
      const eqType = str(input.eqType);
      const freq = num(input.freq);
      const gainDb = num(input.gainDb);
      const q = num(input.q);
      if (!eqType || !EQ_TYPES.has(eqType) || freq === null || gainDb === null || q === null) return null;
      return {
        kind: "addEqBand",
        trackId,
        eqType: eqType as "highpass" | "lowshelf" | "peaking" | "highshelf" | "lowpass",
        freq,
        gainDb,
        q,
      };
    }
    case "set_compressor": {
      const thresholdDb = num(input.thresholdDb);
      const ratio = num(input.ratio);
      const attackMs = num(input.attackMs);
      const releaseMs = num(input.releaseMs);
      const makeupDb = num(input.makeupDb);
      if (thresholdDb === null || ratio === null || attackMs === null || releaseMs === null || makeupDb === null) return null;
      return { kind: "setCompressor", trackId, thresholdDb, ratio, attackMs, releaseMs, makeupDb };
    }
    case "set_reverb": {
      const mix = num(input.mix);
      const decaySec = num(input.decaySec);
      const sizeType = str(input.sizeType);
      if (mix === null || decaySec === null || !sizeType || !REVERB_SIZES.has(sizeType)) return null;
      return { kind: "setReverb", trackId, mix, decaySec, sizeType: sizeType as "room" | "hall" | "plate" };
    }
    case "set_delay": {
      const timeMs = num(input.timeMs);
      const feedback = num(input.feedback);
      const mix = num(input.mix);
      if (timeMs === null || feedback === null || mix === null) return null;
      return { kind: "setDelay", trackId, timeMs, feedback, mix };
    }
    case "set_saturation": {
      const driveDb = num(input.driveDb);
      const mix = num(input.mix);
      const tone = str(input.tone);
      if (driveDb === null || mix === null || !tone || !SATURATION_TONES.has(tone)) return null;
      return { kind: "setSaturation", trackId, driveDb, mix, tone: tone as "warm" | "neutral" | "bright" };
    }
    default:
      return null;
  }
}

export function describeAssistantAction(action: AssistantAction, trackName: string): string {
  switch (action.kind) {
    case "setTrackVolume":
      return `Set ${trackName} volume to ${action.volumeDb.toFixed(1)}dB`;
    case "setTrackPan":
      return `Pan ${trackName} to ${action.pan.toFixed(2)}`;
    case "setTrackMute":
      return `${action.muted ? "Mute" : "Unmute"} ${trackName}`;
    case "setTrackSolo":
      return `${action.solo ? "Solo" : "Unsolo"} ${trackName}`;
    case "addEqBand":
      return `Add ${action.eqType} EQ band on ${trackName} at ${Math.round(action.freq)}Hz (${action.gainDb > 0 ? "+" : ""}${action.gainDb.toFixed(1)}dB)`;
    case "setCompressor":
      return `Set ${trackName} compressor: ${action.thresholdDb.toFixed(1)}dB threshold, ${action.ratio.toFixed(1)}:1 ratio`;
    case "setReverb":
      return `Set ${trackName} reverb: ${action.sizeType}, ${Math.round(action.mix * 100)}% mix`;
    case "setDelay":
      return `Set ${trackName} delay: ${Math.round(action.timeMs)}ms, ${Math.round(action.mix * 100)}% mix`;
    case "setSaturation":
      return `Set ${trackName} saturation: ${action.tone}, ${Math.round(action.mix * 100)}% mix`;
  }
}
