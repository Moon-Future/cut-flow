import type {ProjectFile, Scene} from './schema';

export type TimelineScene = {
  scene: Scene;
  from: number;
  durationInFrames: number;
};

export type Timeline = {
  scenes: TimelineScene[];
  durationInFrames: number;
};

export const secondsToFrames = (seconds: number, fps: number): number =>
  Math.max(1, Math.round(seconds * fps));

export const buildTimeline = (project: ProjectFile): Timeline => {
  let cursor = 0;
  const scenes = project.scenes.map((scene) => {
    const durationInFrames = secondsToFrames(scene.duration, project.project.fps);
    const item = {scene, from: cursor, durationInFrames};
    cursor += durationInFrames;
    return item;
  });
  return {scenes, durationInFrames: cursor};
};
