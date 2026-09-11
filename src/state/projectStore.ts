import { create } from "zustand";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { saveProject } from "@/lib/storage/projectStore";
import {
  createEmptyProject,
  createTrack,
  type AudioClip,
  type Project,
  type Track,
  type TrackId,
} from "@/types/project";

interface ProjectState {
  project: Project;
  currentTime: number;
  isPlaying: boolean;
  selectedTrackId: TrackId | null;

  addTrack: (name?: string) => Track;
  removeTrack: (trackId: TrackId) => void;
  updateTrack: (trackId: TrackId, patch: Partial<Track>) => void;
  addClip: (clip: AudioClip) => void;
  updateClip: (trackId: TrackId, clipId: string, patch: Partial<AudioClip>) => void;
  removeClip: (trackId: TrackId, clipId: string) => void;
  selectTrack: (trackId: TrackId | null) => void;

  setBpm: (bpm: number) => void;
  setTimeSignature: (num: number, den: number) => void;
  setLoop: (patch: Partial<Project["loop"]>) => void;
  toggleMetronome: () => void;

  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;

  renameProject: (name: string) => void;
  loadProject: (project: Project) => void;
  newProject: () => void;
  persist: () => void;
}

function touch(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

export const useProjectStore = create<ProjectState>((set, get) => {
  let unsubscribeTime: (() => void) | null = null;

  const attachEngineClock = () => {
    unsubscribeTime?.();
    unsubscribeTime = getAudioEngine().onTimeUpdate((t) => set({ currentTime: t }));
  };
  attachEngineClock();

  return {
    project: createEmptyProject(),
    currentTime: 0,
    isPlaying: false,
    selectedTrackId: null,

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

    selectTrack: (trackId) => set({ selectedTrackId: trackId }),

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
