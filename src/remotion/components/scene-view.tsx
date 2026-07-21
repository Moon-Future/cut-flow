import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import type {ProjectFile, Scene} from '../../core/schema';
import {Caption} from './caption';
import {Media} from './media';

type Props = {
  scene: Scene;
  style: ProjectFile['style'];
  durationInFrames: number;
  fadeFrames: number;
  isFirst: boolean;
  isLast: boolean;
  assetBasePath: string;
};

export const SceneView = ({
  scene,
  style,
  durationInFrames,
  fadeFrames,
  isFirst,
  isLast,
  assetBasePath,
}: Props) => {
  const frame = useCurrentFrame();
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
    <AbsoluteFill style={{opacity: Math.min(fadeIn, fadeOut), backgroundColor: '#080b12'}}>
      <Media scene={scene} durationInFrames={durationInFrames} assetBasePath={assetBasePath} />
      <Caption
        text={scene.caption}
        words={scene.words}
        position={style.captionPosition}
        animation={style.captionAnimation}
        fontFamily={style.fontFamily}
      />
      <div
        style={{
          position: 'absolute',
          top: 62,
          left: 70,
          color: '#7fe7ff',
          font: '700 24px system-ui',
          letterSpacing: 4,
        }}
      >
        CUT FLOW · DEV LOG
      </div>
    </AbsoluteFill>
  );
};
