import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import type {Scene} from '../../core/schema';
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
    case 'pan-up':
      return `scale(1.08) translateY(${-3 * progress}%)`;
    case 'pan-down':
      return `scale(1.08) translateY(${3 * progress - 3}%)`;
    case 'ken-burns-left':
      return `scale(${1.03 + progress * 0.09}) translate(${2 - progress * 4}%, ${1 - progress * 1.5}%)`;
    case 'ken-burns-right':
      return `scale(${1.03 + progress * 0.09}) translate(${progress * 4 - 2}%, ${1 - progress * 1.5}%)`;
    case 'gentle-float': {
      const wave = Math.sin(progress * Math.PI * 2);
      return `scale(1.06) translate(${wave * 0.8}%, ${Math.cos(progress * Math.PI * 2) * 0.6}%)`;
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
    transform: motionTransform(scene, frame, durationInFrames),
    ...layoutStyle(scene.layout, template),
  };

  const shotTimeline = buildShotTimeline(scene, fps);
  if (shotTimeline.length)
    return (
      <AbsoluteFill style={{overflow: 'hidden', background: template.backgroundColor}}>
        {shotTimeline.map(({shot, from, durationInFrames: shotFrames}) => {
          const selected = shot.selectedAsset;
          const isVideo = selected ? /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(selected) : false;
          return (
            <Sequence key={shot.id} from={from} durationInFrames={shotFrames} premountFor={15}>
              {shot.shotType === 'science-animation' && !selected ? (
                <ScienceAnimation purpose={shot.visualPurpose} />
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
                  <Img
                    src={staticFile(`${assetBasePath}/${selected}`)}
                    style={{...sharedStyle, inset: 0, width: '100%', height: '100%'}}
                  />
                )
              ) : scene.assetType === 'video' ? (
                <OffthreadVideo
                  src={src}
                  style={{...sharedStyle, inset: 0, width: '100%', height: '100%'}}
                  muted
                />
              ) : (
                <Img src={src} style={{...sharedStyle, inset: 0, width: '100%', height: '100%'}} />
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
