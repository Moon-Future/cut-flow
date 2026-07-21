import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import type {Scene} from '../../core/schema';
import type {VideoTemplate} from '../../templates/types';

type Props = {
  scene: Scene;
  durationInFrames: number;
  assetBasePath: string;
  template: VideoTemplate;
};

const motionTransform = (scene: Scene, frame: number, duration: number): string => {
  const progress = interpolate(frame, [0, Math.max(1, duration - 1)], [0, 1], {
    extrapolateRight: 'clamp',
  });
  switch (scene.motion) {
    case 'slow-zoom-in':
      return `scale(${1 + progress * 0.08})`;
    case 'slow-zoom-out':
      return `scale(${1.08 - progress * 0.08})`;
    case 'pan-left':
      return `scale(1.08) translateX(${-3 * progress}%)`;
    case 'pan-right':
      return `scale(1.08) translateX(${3 * progress - 3}%)`;
    case 'none':
      return 'none';
  }
};

const layoutStyle = (layout: Scene['layout'], template: VideoTemplate): React.CSSProperties => {
  if (layout === 'center-card') {
    return {
      inset: '18% 7%',
      width: '86%',
      height: '64%',
      borderRadius: template.borderRadius,
      boxShadow: '0 30px 90px #000a',
    };
  }
  if (layout === 'split-top-bottom') {
    return {inset: '0 0 42%', width: '100%', height: '58%'};
  }
  return {inset: 0, width: '100%', height: '100%'};
};

export const Media = ({scene, durationInFrames, assetBasePath, template}: Props) => {
  const frame = useCurrentFrame();
  const src = staticFile(`${assetBasePath}/${scene.assetPath}`);
  const sharedStyle: React.CSSProperties = {
    position: 'absolute',
    objectFit: 'cover',
    transform: motionTransform(scene, frame, durationInFrames),
    ...layoutStyle(scene.layout, template),
  };

  return (
    <AbsoluteFill style={{overflow: 'hidden', background: template.backgroundColor}}>
      {scene.assetType === 'image' ? (
        <Img src={src} style={sharedStyle} />
      ) : (
        <OffthreadVideo src={src} style={sharedStyle} muted />
      )}
      <AbsoluteFill style={{background: template.overlay}} />
    </AbsoluteFill>
  );
};
