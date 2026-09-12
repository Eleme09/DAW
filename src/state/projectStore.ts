import { create } from "zustand";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { listProjects, loadProject as loadProjectFromDisk, saveProject } from "@/lib/storage/projectStore";
import { putSample } from "@/lib/storage/sampleStore";
import { addSampleAsset } from "@/lib/storage/sampleIndex";
import { hydrateProjectSamples } from "@/lib/audio/sampleLoader";
import {
  createEmptyProject,
  createTrack,
  type AudioClip,
  type Project,
  type SampleAsset,
  type Track,
  type TrackId,
} from "@/types/project";
import { createEffectInstance, type EffectInstance, type EffectType } from "@/types/effects";

export type EffectTarget = TrackId | "master";

interface ProjectState {
  project: Project;
  /** Undo/redo history of `project` snapshots. Continuous edits (dragging a
   * fader, typing a name) coalesce into one entry — see `setProject`. */
  past: Project[];
  future: Project[];
  currentTime: number;
  isPlaying: boolean;
  selectedTrackId: TrackId | null;
  isRecording: boolean;
  recordingError: string | null;

  undo: () => void;
  redo: () => void;

  addTrack: (name?: string) => Track;
  removeTrack: (trackId: TrackId) => void;
  updateTrack: (trackId: TrackId, patch: Partial<Track>) => void;
  armTrack: (trackId: TrackId) => void;
  addClip: (clip: AudioClip) => void;
  updateClip: (trackId: TrackId, clipId: string, patch: Partial<AudioClip>) => void;
  removeClip: (trackId: TrackId, clipId: string) => void;
  splitClipAtPlayhead: () => void;
  selectTrack: (trackId: TrackId | null) => void;

  addEffect: (target: EffectTarget, type: EffectType) => void;
  setEffectChain: (target: EffectTarget, inserts: EffectInstance[]) => void;
  removeEffect: (target: EffectTarget, effectId: string) => void;
  moveEffect: (target: EffectTarget, effectId: string, direction: -1 | 1) => void;
  updateEffectParams: (target: EffectTarget, effectId: string, params: EffectInstance["params"]) => void;
  toggleEffectBypass: (target: EffectTarget, effectId: string) => void;

  setBpm: (bpm: number) => void;
  setTimeSignature: (num: number, den: number) => void;
  setLoop: (patch: Partial<Project["loop"]>) => void;
  toggleMetronome: () => void;

  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;

  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;

  renameProject: (name: string) => void;
  loadProject: (project: Project) => void;
  /** Loads a saved project by id from disk and hydrates its samples into
   * the audio engine cache. Returns false if the project no longer exists
   * (e.g. deleted from another tab). */
  openProjectById: (id: string) => Promise<boolean>;
  /** Loads the most recently saved project, if any - used to resume the
   * last session on startup. Returns false if there's nothing to recover. */
  recoverLastProject: () => Promise<boolean>;
  newProject: () => void;
  persist: () => Promise<void>;
}

function touch(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

const MIN_CLIP_SEC = 0.05;

/** Consecutive coalesced edits (dragging a fader, typing a field) that land
 * within this window collapse into a single undo step. */
const COALESCE_MS = 400;
/** Cap history length so an hours-long session doesn't grow this unbounded —
 * project snapshots are plain JSON (no audio data), so this is cheap. */
const HISTORY_LIMIT = 200;

/** Debounce window for autosave: a burst of edits (dragging a fader, typing
 * a name) writes to IndexedDB once, shortly after the user stops, rather
 * than on every keystroke/tick. */
const AUTOSAVE_DEBOUNCE_MS = 1200;

export const useProjectStore = create<ProjectState>((set, get, api) => {
  let unsubscribeTime: (() => void) | null = null;
  let lastPushAt = 0;
  let lastPushWasCoalescible = false;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSave: Project | null = null;

  const attachEngineClock = () => {
    unsubscribeTime?.();
    unsubscribeTime = getAudioEngine().onTimeUpdate((t) => set({ currentTime: t }));
  };
  attachEngineClock();

  const attachAutosave = () => {
    api.subscribe((state, prevState) => {
      if (state.project === prevState.project) return;
      pendingSave = state.project;
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        const toSave = pendingSave;
        pendingSave = null;
        autosaveTimer = null;
        if (toSave) saveProject(toSave).catch((err) => console.error("Autosave failed:", err));
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    if (typeof window !== "undefined") {
      // Best-effort flush for a quick tab close right after an edit, before
      // the debounce timer above would otherwise fire. A hard crash bypasses
      // this regardless - the short debounce window is what bounds that risk.
      window.addEventListener("beforeunload", () => {
        if (pendingSave) void saveProject(pendingSave);
      });
    }
  };
  attachAutosave();

  /** The single funnel every project-data mutation goes through, so
   * undo/redo covers all of them uniformly. `coalesce: true` merges this
   * change into the in-progress edit instead of creating a new undo step —
   * use it for continuous input (drag, typing), never for discrete actions
   * (add/remove, toggles) where every call must be its own step. */
  function setProject(next: Project, opts?: { coalesce?: boolean; extra?: Partial<ProjectState> }) {
    const { past, project: current } = get();
    const now = Date.now();
    const coalesce = Boolean(opts?.coalesce) && lastPushWasCoalescible && now - lastPushAt < COALESCE_MS;
    const nextPast = coalesce ? past : [...past, current].slice(-HISTORY_LIMIT);
    set({ project: next, past: nextPast, future: [], ...opts?.extra });
    lastPushAt = now;
    lastPushWasCoalescible = Boolean(opts?.coalesce);
  }

  function mutateInserts(
    target: EffectTarget,
    updater: (inserts: EffectInstance[]) => EffectInstance[],
    opts?: { coalesce?: boolean }
  ): void {
    const project = get().project;
    if (target === "master") {
      const nextProject = touch({ ...project, masterInserts: updater(project.masterInserts) });
      setProject(nextProject, opts);
      getAudioEngine().syncMasterInserts(nextProject.masterInserts);
      return;
    }
    const nextProject = touch({
      ...project,
      tracks: project.tracks.map((t) => (t.id === target ? { ...t, inserts: updater(t.inserts) } : t)),
    });
    setProject(nextProject, opts);
    getAudioEngine().syncTracks(nextProject.tracks);
  }

  return {
    project: createEmptyProject(),
    past: [],
    future: [],
    currentTime: 0,
    isPlaying: false,
    selectedTrackId: null,
    isRecording: false,
    recordingError: null,

    undo: () => {
      const { past, project, future } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      set({ project: previous, past: past.slice(0, -1), future: [project, ...future] });
      getAudioEngine().syncTracks(previous.tracks);
      getAudioEngine().syncMasterInserts(previous.masterInserts);
      lastPushWasCoalescible = false;
    },
    redo: () => {
      const { past, project, future } = get();
      const next = future[0];
      if (!next) return;
      set({ project: next, past: [...past, project], future: future.slice(1) });
      getAudioEngine().syncTracks(next.tracks);
      getAudioEngine().syncMasterInserts(next.masterInserts);
      lastPushWasCoalescible = false;
    },

    addTrack: (name) => {
      const project = get().project;
      const track = createTrack(name ?? `Track ${project.tracks.length + 1}`, project.tracks.length);
      setProject(touch({ ...project, tracks: [...project.tracks, track] }), {
        extra: { selectedTrackId: track.id },
      });
      return track;
    },

    removeTrack: (trackId) => {
      const project = get().project;
      const selectedTrackId = get().selectedTrackId === trackId ? null : get().selectedTrackId;
      setProject(touch({ ...project, tracks: project.tracks.filter((t) => t.id !== trackId) }), {
        extra: { selectedTrackId },
      });
    },

    updateTrack: (trackId, patch) => {
      const project = get().project;
      const coalesce = Object.keys(patch).every((k) => k === "volumeDb" || k === "pan");
      setProject(
        touch({ ...project, tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)) }),
        { coalesce }
      );
      getAudioEngine().syncTracks(get().project.tracks);
    },

    armTrack: (trackId) => {
      // Only one track records at a time - keep arming exclusive.
      const project = get().project;
      const target = project.tracks.find((t) => t.id === trackId);
      const nextArmed = !target?.armed;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) => ({ ...t, armed: t.id === trackId ? nextArmed : false })),
        })
      );
    },

    addClip: (clip) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id === clip.trackId ? { ...t, clips: [...t.clips, clip] } : t
          ),
        })
      );
    },

    updateClip: (trackId, clipId, patch) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
          ),
        }),
        { coalesce: true }
      );
    },

    removeClip: (trackId, clipId) => {
      const project = get().project;
      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId ? t : { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
          ),
        })
      );
    },

    splitClipAtPlayhead: () => {
      const { project, selectedTrackId, currentTime } = get();
      const track = project.tracks.find((t) => t.id === selectedTrackId);
      if (!track) return;
      const clip = track.clips.find(
        (c) => currentTime > c.startTime + MIN_CLIP_SEC && currentTime < c.startTime + c.duration - MIN_CLIP_SEC
      );
      if (!clip) return;

      const splitAt = currentTime - clip.startTime;
      const left: AudioClip = { ...clip, duration: splitAt, fadeOutSec: 0 };
      const right: AudioClip = {
        ...clip,
        id: crypto.randomUUID(),
        startTime: currentTime,
        duration: clip.duration - splitAt,
        sourceOffset: clip.sourceOffset + splitAt,
        fadeInSec: 0,
      };

      setProject(
        touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== track.id
              ? t
              : { ...t, clips: t.clips.flatMap((c) => (c.id === clip.id ? [left, right] : [c])) }
          ),
        })
      );
    },

    selectTrack: (trackId) => set({ selectedTrackId: trackId }),

    addEffect: (target, type) => {
      const instance = createEffectInstance(type);
      mutateInserts(target, (inserts) => [...inserts, instance]);
    },
    setEffectChain: (target, inserts) => {
      mutateInserts(target, () => inserts);
    },
    removeEffect: (target, effectId) => {
      mutateInserts(target, (inserts) => inserts.filter((e) => e.id !== effectId));
    },
    moveEffect: (target, effectId, direction) => {
      mutateInserts(target, (inserts) => {
        const index = inserts.findIndex((e) => e.id === effectId);
        const newIndex = index + direction;
        if (index === -1 || newIndex < 0 || newIndex >= inserts.length) return inserts;
        const next = [...inserts];
        [next[index], next[newIndex]] = [next[newIndex], next[index]];
        return next;
      });
    },
    updateEffectParams: (target, effectId, params) => {
      mutateInserts(
        target,
        (inserts) => inserts.map((e) => (e.id === effectId ? ({ ...e, params } as EffectInstance) : e)),
        { coalesce: true }
      );
    },
    toggleEffectBypass: (target, effectId) => {
      mutateInserts(target, (inserts) =>
        inserts.map((e) => (e.id === effectId ? { ...e, bypassed: !e.bypassed } : e))
      );
    },

    setBpm: (bpm) => setProject(touch({ ...get().project, bpm }), { coalesce: true }),
    setTimeSignature: (num, den) =>
      setProject(touch({ ...get().project, timeSignature: [num, den] }), { coalesce: true }),
    setLoop: (patch) =>
      setProject(touch({ ...get().project, loop: { ...get().project.loop, ...patch } })),
    toggleMetronome: () => {
      const project = get().project;
      const enabled = !project.metronomeEnabled;
      setProject(touch({ ...project, metronomeEnabled: enabled }));
      getAudioEngine().setMetronomeEnabled(enabled, get().project.tracks, project.bpm);
    },

    play: () => {
      const { project, currentTime } = get();
      getAudioEngine().play(project.tracks, currentTime, project.loop, project.bpm);
      set({ isPlaying: true });
    },
    pause: () => {
      getAudioEngine().pause();
      set({ isPlaying: false, currentTime: getAudioEngine().getCurrentTime() });
    },
    stop: () => {
      getAudioEngine().stop();
      set({ isPlaying: false, currentTime: 0 });
    },
    seek: (time) => {
      const { project } = get();
      getAudioEngine().seek(time, project.tracks, project.loop, project.bpm);
      set({ currentTime: time });
    },

    startRecording: async () => {
      const state = get();
      if (state.isRecording) return;

      let project = state.project;
      let armedTrack = project.tracks.find((t) => t.armed);
      if (!armedTrack) {
        armedTrack =
          project.tracks.find((t) => t.id === state.selectedTrackId) ??
          createTrack(`Vocal ${project.tracks.length + 1}`, project.tracks.length);
        if (!project.tracks.some((t) => t.id === armedTrack!.id)) {
          project = touch({ ...project, tracks: [...project.tracks, armedTrack] });
        }
        project = touch({
          ...project,
          tracks: project.tracks.map((t) => (t.id === armedTrack!.id ? { ...t, armed: true } : t)),
        });
        setProject(project, { extra: { selectedTrackId: armedTrack.id } });
      }

      set({ recordingError: null });
      const result = await getAudioEngine().startRecording(
        project.tracks,
        project.loop,
        project.bpm,
        get().currentTime
      );
      if (!result.ok) {
        set({ recordingError: result.error });
        return;
      }
      set({ isRecording: true, isPlaying: true });
    },

    stopRecording: async () => {
      if (!get().isRecording) return;
      const result = getAudioEngine().stopRecording();
      set({ isRecording: false, isPlaying: false, currentTime: getAudioEngine().getCurrentTime() });
      if (!result || result.durationSec <= 0) return;

      const project = get().project;
      const armedTrack = project.tracks.find((t) => t.armed);
      if (!armedTrack) return;

      const sampleId = crypto.randomUUID();
      await getAudioEngine().decodeAndCache(sampleId, await result.blob.arrayBuffer());
      await putSample(sampleId, `${armedTrack.name} take`, result.blob);
      const asset: SampleAsset = {
        id: sampleId,
        name: `${armedTrack.name} take ${new Date().toLocaleTimeString()}`,
        durationSec: result.durationSec,
        sampleRate: getAudioEngine().getContext()?.sampleRate ?? 44100,
        channels: 1,
        createdAt: new Date().toISOString(),
      };
      await addSampleAsset(asset);

      const clip: AudioClip = {
        id: crypto.randomUUID(),
        trackId: armedTrack.id,
        sampleId,
        name: asset.name,
        startTime: result.startTime,
        duration: result.durationSec,
        sourceOffset: 0,
        gainDb: 0,
        fadeInSec: 0,
        fadeOutSec: 0,
        color: armedTrack.color,
      };
      get().addClip(clip);
    },

    renameProject: (name) => setProject(touch({ ...get().project, name }), { coalesce: true }),
    loadProject: (project) => {
      // Opening a different project starts a fresh undo history - carrying
      // over the previous project's history would let undo cross documents.
      getAudioEngine().stop();
      set({ project, currentTime: 0, isPlaying: false, selectedTrackId: null, past: [], future: [] });
      lastPushWasCoalescible = false;
    },
    newProject: () => {
      getAudioEngine().stop();
      set({
        project: createEmptyProject(),
        currentTime: 0,
        isPlaying: false,
        selectedTrackId: null,
        past: [],
        future: [],
      });
      lastPushWasCoalescible = false;
    },
    openProjectById: async (id) => {
      const project = await loadProjectFromDisk(id);
      if (!project) return false;
      get().loadProject(project);
      const sampleIds = Array.from(new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId))));
      await hydrateProjectSamples(sampleIds);
      return true;
    },
    recoverLastProject: async () => {
      const entries = await listProjects();
      const mostRecent = entries[0];
      if (!mostRecent) return false;
      return get().openProjectById(mostRecent.id);
    },
    persist: () => saveProject(get().project),
  };
});
