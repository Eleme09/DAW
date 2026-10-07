/**
 * What each audio processor really costs on THIS device, measured inside it:
 * the worklets (dynamics, noise gate, Núcleo) add up the time each of their
 * process() calls takes while the diagnostic is on and report it once per
 * second of audio. Date.now() has 1 ms steps, so one block shows as 0 or 1
 * ms, but the sum over thousands of blocks is unbiased - that is the number
 * used. Native nodes (EQ, reverb, delay...) can't be measured this way.
 *
 * Only live nodes register: offline renders (export, measuring) are not
 * the audio thread's load.
 */

interface ProfMessage {
  ms: number;
  blocks: number;
  over2: number;
  over4: number;
  max: number;
  sec: number;
}

interface Entry {
  kind: string;
  label: string;
  ms: number;
  sec: number;
  blocks: number;
  over2: number;
  over4: number;
  max: number;
  /** performance.now() of the last report (a disposed node goes quiet). */
  at: number;
}

export interface ProfGroup {
  label: string;
  nodes: number;
  /** % of real time the group's processors were busy, summed over nodes. */
  busyPct: number;
  /** Blocks that took 2 ms or more, of all blocks, in %. */
  slowPct: number;
  /** Longest single block, ms (1 ms steps). */
  maxMs: number;
}

export interface ProfSummary {
  groups: ProfGroup[];
  totalPct: number;
}

const KIND_LABEL: Record<string, string> = {
  dynamics: "Compresores / limitadores / de-esser",
  noiseGate: "Puertas de ruido",
  pitchShift: "Pitch shifters",
};

/** A node that has not reported for this long is gone (disposed). */
const STALE_MS = 4000;

class WorkletProfiler {
  private nodes = new Map<AudioWorkletNode, Entry>();
  private on = false;

  /** `label` tells nodes of one kind apart in the report (a track's Núcleo). */
  register(node: AudioWorkletNode, kind: string, label = ""): void {
    if (typeof AudioContext === "undefined" || !(node.context instanceof AudioContext)) return;
    const entry: Entry = { kind, label, ms: 0, sec: 0, blocks: 0, over2: 0, over4: 0, max: 0, at: 0 };
    this.nodes.set(node, entry);
    // addEventListener, not onmessage: the owners use onmessage for their own
    // reports. The port has to be started by hand for listeners.
    node.port.addEventListener("message", (e: MessageEvent) => {
      const p = (e.data as { prof?: ProfMessage } | null)?.prof;
      if (!p) return;
      entry.ms += p.ms;
      entry.sec += p.sec;
      entry.blocks += p.blocks;
      entry.over2 += p.over2;
      entry.over4 += p.over4;
      if (p.max > entry.max) entry.max = p.max;
      entry.at = performance.now();
    });
    node.port.start();
    if (this.on) node.port.postMessage({ type: "prof", on: true });
  }

  unregister(node: AudioWorkletNode): void {
    this.nodes.delete(node);
  }

  setEnabled(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    for (const node of this.nodes.keys()) node.port.postMessage({ type: "prof", on });
    if (!on) this.reset();
  }

  reset(): void {
    for (const e of this.nodes.values()) {
      e.ms = 0;
      e.sec = 0;
      e.blocks = 0;
      e.over2 = 0;
      e.over4 = 0;
      e.max = 0;
    }
  }

  summary(): ProfSummary {
    const now = performance.now();
    const groups = new Map<string, { label: string; nodes: number; busy: number; blocks: number; over2: number; max: number }>();
    let total = 0;
    for (const e of this.nodes.values()) {
      if (e.sec <= 0 || now - e.at > STALE_MS) continue;
      const busy = (e.ms / (e.sec * 1000)) * 100;
      total += busy;
      // Núcleo is listed per track (each is heavy); the rest by kind
      const key = e.kind === "nucleo" ? `nucleo:${e.label}` : e.kind;
      const label = e.kind === "nucleo" ? `Núcleo${e.label ? ` · ${e.label}` : ""}` : (KIND_LABEL[e.kind] ?? e.kind);
      const g = groups.get(key) ?? { label, nodes: 0, busy: 0, blocks: 0, over2: 0, max: 0 };
      g.nodes++;
      g.busy += busy;
      g.blocks += e.blocks;
      g.over2 += e.over2;
      g.max = Math.max(g.max, e.max);
      groups.set(key, g);
    }
    const list: ProfGroup[] = [...groups.values()].map((g) => ({
      label: g.label,
      nodes: g.nodes,
      busyPct: Math.round(g.busy * 10) / 10,
      slowPct: g.blocks ? Math.round((g.over2 / g.blocks) * 1000) / 10 : 0,
      maxMs: g.max,
    }));
    list.sort((a, b) => b.busyPct - a.busyPct);
    return { groups: list, totalPct: Math.round(total * 10) / 10 };
  }
}

export const workletProfiler = new WorkletProfiler();
