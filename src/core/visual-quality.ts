import type {ProjectFile} from './schema';

export type VisualQualityReport = {
  totalShots: number;
  missingAssets: number;
  averageShotDuration: number;
  longestStaticDuration: number;
  realFootageRatio: number;
  generatedRatio: number;
  programmaticRatio: number;
  publishable: boolean;
  warnings: string[];
};

export const analyzeVisualQuality = (project: ProjectFile): VisualQualityReport => {
  const shots = project.scenes.flatMap((scene) => scene.shots ?? []);
  const totalDuration = shots.reduce((sum, shot) => sum + shot.duration, 0);
  const ratio = (types: string[]) =>
    totalDuration === 0
      ? 0
      : shots
          .filter((shot) => types.includes(shot.shotType))
          .reduce((sum, shot) => sum + shot.duration, 0) / totalDuration;
  const missingAssets = shots.filter((shot) => shot.status === 'missing-asset').length;
  const realFootageRatio = ratio(['real-footage', 'stock-video']);
  const generatedRatio = ratio(['generated-video', 'generated-image']);
  const programmaticRatio = ratio(['science-animation']);
  const longestStaticDuration = Math.max(
    0,
    ...shots.filter((shot) => shot.shotType === 'generated-image').map((shot) => shot.duration),
  );
  const warnings: string[] = [];
  if (shots.length === 0) warnings.push('尚未生成视觉镜头计划');
  if (missingAssets > 0) warnings.push(`有 ${missingAssets} 个镜头缺少素材`);
  if (realFootageRatio === 0) warnings.push('没有真实视频或素材视频');
  if (longestStaticDuration > 4) warnings.push('存在超过 4 秒的静态生成图片');
  if (programmaticRatio > 0.5) warnings.push('程序化动画占比过高，成片可能像动态演示稿');
  return {
    totalShots: shots.length,
    missingAssets,
    averageShotDuration: shots.length ? totalDuration / shots.length : 0,
    longestStaticDuration,
    realFootageRatio,
    generatedRatio,
    programmaticRatio,
    publishable: shots.length > 0 && missingAssets === 0 && realFootageRatio > 0,
    warnings,
  };
};
