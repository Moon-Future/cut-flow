import type {ProjectFile, Scene, VisualShot} from './schema';

export type TimelineScene = {
  scene: Scene;
  from: number;
  durationInFrames: number;
};

export type Timeline = {
  scenes: TimelineScene[];
  durationInFrames: number;
};
export type TimelineShot = {shot: VisualShot; from: number; durationInFrames: number};

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

export const buildShotTimeline = (scene: Scene, fps: number): TimelineShot[] => {
  if (!scene.shots?.length) return [];
  const targetFrames = secondsToFrames(scene.duration, fps);
  const totalWeight = scene.shots.reduce((sum, shot) => sum + shot.duration, 0);
  let cursor = 0;
  return scene.shots.map((shot, index) => {
    const remaining = targetFrames - cursor;
    const durationInFrames =
      index === scene.shots!.length - 1
        ? Math.max(1, remaining)
        : Math.max(1, Math.round(targetFrames * (shot.duration / totalWeight)));
    const item = {shot, from: cursor, durationInFrames};
    cursor += durationInFrames;
    return item;
  });
};
