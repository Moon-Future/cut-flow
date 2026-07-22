import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import type {ProjectFile, Scene} from '../../core/schema';
import {Caption} from './caption';
import {Media} from './media';
import {getTemplate} from '../../templates/registry';

type Props = {
  scene: Scene;
  style: ProjectFile['style'];
  durationInFrames: number;
  fadeFrames: number;
  isFirst: boolean;
  isLast: boolean;
  assetBasePath: string;
  fps: number;
};

export const SceneView = ({
  scene,
  style,
  durationInFrames,
  fadeFrames,
  isFirst,
  isLast,
  assetBasePath,
  fps,
}: Props) => {
  const frame = useCurrentFrame();
  const template = getTemplate(style.template);
  const shouldFade = style.transition === 'fade' && fadeFrames > 0;
  const fadeIn =
    shouldFade && !isFirst
      ? interpolate(frame, [0, fadeFrames], [0, 1], {extrapolateRight: 'clamp'})
      : 1;
  const fadeOut =
    shouldFade && !isLast
      ? interpolate(frame, [durationInFrames - fadeFrames, durationInFrames - 1], [1, 0], {
          extrapolateLeft: 'clamp',
        })
      : 1;

  return (
    <AbsoluteFill
      style={{opacity: Math.min(fadeIn, fadeOut), backgroundColor: template.backgroundColor}}
    >
      <Media
        scene={scene}
        durationInFrames={durationInFrames}
        assetBasePath={assetBasePath}
        template={template}
        fps={fps}
      />
      <Caption
        text={scene.caption}
        words={scene.words}
        position={style.captionPosition}
        animation={style.captionAnimation}
        fontFamily={style.fontFamily}
        activeColor={template.captionActiveColor}
      />
      <div
        style={{
          position: 'absolute',
          top: 62,
          left: 70,
          color: template.accentColor,
          font: '700 24px system-ui',
          letterSpacing: 4,
        }}
      >
        {template.brandLabel}
      </div>
    </AbsoluteFill>
  );
};
