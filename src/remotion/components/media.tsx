import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import type {Motion, Scene} from '../../core/schema';
import {buildShotTimeline, secondsToFrames} from '../../core/timeline';
import type {VideoTemplate} from '../../templates/types';
import {ScienceAnimation} from './science-animation';

type Props = {
  scene: Scene;
  durationInFrames: number;
  assetBasePath: string;
  template: VideoTemplate;
  fps: number;
};

const motionTransform = (
  motion: Motion,
  frame: number,
  duration: number,
  intensity = 0.35,
): string => {
  const progress = interpolate(frame, [0, Math.max(1, duration - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const strength = Math.max(0, Math.min(1, intensity));
  const zoom = 0.02 + strength * 0.16;
  const travel = 1 + strength * 6;
  switch (motion) {
    case 'slow-zoom-in':
      return `scale(${1 + progress * zoom})`;
    case 'slow-zoom-out':
      return `scale(${1 + zoom - progress * zoom})`;
    case 'pan-left':
      return `scale(${1 + zoom}) translateX(${-travel * progress}%)`;
    case 'pan-right':
      return `scale(${1 + zoom}) translateX(${travel * progress - travel}%)`;
    case 'pan-up':
      return `scale(${1 + zoom}) translateY(${-travel * progress}%)`;
    case 'pan-down':
      return `scale(${1 + zoom}) translateY(${travel * progress - travel}%)`;
    case 'ken-burns-left':
      return `scale(${1.02 + progress * zoom}) translate(${travel / 2 - progress * travel}%, ${travel / 4 - progress * (travel / 2)}%)`;
    case 'ken-burns-right':
      return `scale(${1.02 + progress * zoom}) translate(${progress * travel - travel / 2}%, ${travel / 4 - progress * (travel / 2)}%)`;
    case 'gentle-float': {
      const wave = Math.sin(progress * Math.PI * 2);
      return `scale(${1 + zoom / 2}) translate(${wave * strength * 2}%, ${Math.cos(progress * Math.PI * 2) * strength * 1.5}%)`;
    }
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

export const Media = ({scene, durationInFrames, assetBasePath, template, fps}: Props) => {
  const frame = useCurrentFrame();
  const src = staticFile(`${assetBasePath}/${scene.assetPath}`);
  const sharedStyle: React.CSSProperties = {
    position: 'absolute',
    objectFit: 'cover',
    transform: motionTransform(scene.motion, frame, durationInFrames),
    ...layoutStyle(scene.layout, template),
  };

  const shotTimeline = buildShotTimeline(scene, fps);
  if (shotTimeline.length)
    return (
      <AbsoluteFill style={{overflow: 'hidden', background: template.backgroundColor}}>
        {shotTimeline.map(({shot, from, durationInFrames: shotFrames}) => {
          const selected = shot.selectedAsset;
          const isVideo = selected ? /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(selected) : false;
          const shotImageStyle: React.CSSProperties = {
            ...sharedStyle,
            inset: 0,
            width: '100%',
            height: '100%',
            transform: motionTransform(
              shot.motionPlan?.preset ?? scene.motion,
              frame - from,
              shotFrames,
              shot.motionPlan?.intensity,
            ),
          };
          return (
            <Sequence key={shot.id} from={from} durationInFrames={shotFrames} premountFor={15}>
              {shot.shotType === 'science-animation' && !selected ? (
                <ScienceAnimation purpose={shot.visualPurpose} />
              ) : shot.selectionCleared && !selected ? (
                <AbsoluteFill style={{background: template.backgroundColor}} />
              ) : selected ? (
                isVideo ? (
                  <OffthreadVideo
                    src={staticFile(`${assetBasePath}/${selected}`)}
                    startFrom={secondsToFrames(shot.sourceStart, fps)}
                    endAt={shot.sourceEnd ? secondsToFrames(shot.sourceEnd, fps) : undefined}
                    style={{...sharedStyle, inset: 0, width: '100%', height: '100%'}}
                    muted
                  />
                ) : (
                  <Img src={staticFile(`${assetBasePath}/${selected}`)} style={shotImageStyle} />
                )
              ) : scene.assetType === 'video' ? (
                <OffthreadVideo
                  src={src}
                  style={{...sharedStyle, inset: 0, width: '100%', height: '100%'}}
                  muted
                />
              ) : (
                <Img src={src} style={shotImageStyle} />
              )}
            </Sequence>
          );
        })}
        <AbsoluteFill style={{background: template.overlay}} />
      </AbsoluteFill>
    );
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
