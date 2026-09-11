import { create } from "zustand";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { saveProject } from "@/lib/storage/projectStore";
import { putSample } from "@/lib/storage/sampleStore";
import { addSampleAsset } from "@/lib/storage/sampleIndex";
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
  currentTime: number;
  isPlaying: boolean;
  selectedTrackId: TrackId | null;
  isRecording: boolean;
  recordingError: string | null;

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
  newProject: () => void;
  persist: () => void;
}

function touch(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

const MIN_CLIP_SEC = 0.05;

export const useProjectStore = create<ProjectState>((set, get) => {
  let unsubscribeTime: (() => void) | null = null;

  const attachEngineClock = () => {
    unsubscribeTime?.();
    unsubscribeTime = getAudioEngine().onTimeUpdate((t) => set({ currentTime: t }));
  };
  attachEngineClock();

  function mutateInserts(
    target: EffectTarget,
    updater: (inserts: EffectInstance[]) => EffectInstance[]
  ): void {
    const project = get().project;
    if (target === "master") {
      const nextProject = touch({ ...project, masterInserts: updater(project.masterInserts) });
      set({ project: nextProject });
      getAudioEngine().syncMasterInserts(nextProject.masterInserts);
      return;
    }
    const nextProject = touch({
      ...project,
      tracks: project.tracks.map((t) => (t.id === target ? { ...t, inserts: updater(t.inserts) } : t)),
    });
    set({ project: nextProject });
    getAudioEngine().syncTracks(nextProject.tracks);
  }

  return {
    project: createEmptyProject(),
    currentTime: 0,
    isPlaying: false,
    selectedTrackId: null,
    isRecording: false,
    recordingError: null,

    addTrack: (name) => {
      const project = get().project;
      const track = createTrack(name ?? `Track ${project.tracks.length + 1}`, project.tracks.length);
      set({ project: touch({ ...project, tracks: [...project.tracks, track] }), selectedTrackId: track.id });
      return track;
    },

    removeTrack: (trackId) => {
      const project = get().project;
      set({
        project: touch({ ...project, tracks: project.tracks.filter((t) => t.id !== trackId) }),
        selectedTrackId: get().selectedTrackId === trackId ? null : get().selectedTrackId,
      });
    },

    updateTrack: (trackId, patch) => {
      const project = get().project;
      set({
        project: touch({
          ...project,
          tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
        }),
      });
      getAudioEngine().syncTracks(get().project.tracks);
    },

    armTrack: (trackId) => {
      // Only one track records at a time - keep arming exclusive.
      const project = get().project;
      const target = project.tracks.find((t) => t.id === trackId);
      const nextArmed = !target?.armed;
      set({
        project: touch({
          ...project,
          tracks: project.tracks.map((t) => ({ ...t, armed: t.id === trackId ? nextArmed : false })),
        }),
      });
    },

    addClip: (clip) => {
      const project = get().project;
      set({
        project: touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id === clip.trackId ? { ...t, clips: [...t.clips, clip] } : t
          ),
        }),
      });
    },

    updateClip: (trackId, clipId, patch) => {
      const project = get().project;
      set({
        project: touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId
              ? t
              : { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }
          ),
        }),
      });
    },

    removeClip: (trackId, clipId) => {
      const project = get().project;
      set({
        project: touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== trackId ? t : { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
          ),
        }),
      });
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

      set({
        project: touch({
          ...project,
          tracks: project.tracks.map((t) =>
            t.id !== track.id
              ? t
              : { ...t, clips: t.clips.flatMap((c) => (c.id === clip.id ? [left, right] : [c])) }
          ),
        }),
      });
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
      mutateInserts(target, (inserts) =>
        inserts.map((e) => (e.id === effectId ? ({ ...e, params } as EffectInstance) : e))
      );
    },
    toggleEffectBypass: (target, effectId) => {
      mutateInserts(target, (inserts) =>
        inserts.map((e) => (e.id === effectId ? { ...e, bypassed: !e.bypassed } : e))
      );
    },

    setBpm: (bpm) => set({ project: touch({ ...get().project, bpm }) }),
    setTimeSignature: (num, den) =>
      set({ project: touch({ ...get().project, timeSignature: [num, den] }) }),
    setLoop: (patch) =>
      set({ project: touch({ ...get().project, loop: { ...get().project.loop, ...patch } }) }),
    toggleMetronome: () => {
      const project = get().project;
      const enabled = !project.metronomeEnabled;
      set({ project: touch({ ...project, metronomeEnabled: enabled }) });
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
        set({ project, selectedTrackId: armedTrack.id });
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
      addSampleAsset(asset);

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

    renameProject: (name) => set({ project: touch({ ...get().project, name }) }),
    loadProject: (project) => {
      getAudioEngine().stop();
      set({ project, currentTime: 0, isPlaying: false, selectedTrackId: null });
    },
    newProject: () => {
      getAudioEngine().stop();
      set({ project: createEmptyProject(), currentTime: 0, isPlaying: false, selectedTrackId: null });
    },
    persist: () => saveProject(get().project),
  };
});
