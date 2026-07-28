import {Img, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';
import type {VisualLayer as VisualLayerType} from '../../core/schema';
import {layerAnimationState} from '../motion/layer-animation';

type Props = {
  layer: VisualLayerType;
  assetBasePath: string;
  durationInFrames: number;
  fps: number;
};

const combine = (...states: ReturnType<typeof layerAnimationState>[]) => ({
  opacity: states.reduce((value, state) => value * state.opacity, 1),
  x: states.reduce((value, state) => value + state.x, 0),
  y: states.reduce((value, state) => value + state.y, 0),
  scale: states.reduce((value, state) => value * state.scale, 1),
  rotation: states.reduce((value, state) => value + state.rotation, 0),
});

export const VisualLayer = ({layer, assetBasePath, durationInFrames, fps}: Props) => {
  const frame = useCurrentFrame();
  const startFrame = layer.start * fps;
  const endFrame = Math.min(durationInFrames, (layer.end ?? durationInFrames / fps) * fps);
  if (frame < startFrame || frame >= endFrame) return null;

  const localFrame = frame - startFrame;
  const exit = layer.exit
    ? {...layer.exit, start: Math.max(0, endFrame / fps - layer.start - layer.exit.duration)}
    : undefined;
  const animation = combine(
    layerAnimationState(layer.enter, localFrame, fps, 'enter'),
    layerAnimationState(layer.idle, localFrame, fps, 'idle'),
    layerAnimationState(exit, localFrame, fps, 'exit'),
  );
  const effects = layer.effects;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${layer.position.x * 100}%`,
    top: `${layer.position.y * 100}%`,
    width: `${layer.position.width * 100}%`,
    height: layer.position.height ? `${layer.position.height * 100}%` : undefined,
    objectFit: layer.fit,
    opacity: layer.opacity * animation.opacity,
    transform: `translate(-50%, -50%) translate(${animation.x}px, ${animation.y}px) scale(${animation.scale}) rotate(${layer.position.rotation + animation.rotation}deg)`,
    transformOrigin: 'center',
    zIndex: layer.position.zIndex,
    filter: `blur(${effects?.blur ?? 0}px) brightness(${effects?.brightness ?? 1})`,
    textAlign: 'center',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 64,
    fontWeight: 900,
    lineHeight: 1.15,
    textShadow: effects?.outline
      ? '-3px -3px 0 #111, 3px -3px 0 #111, -3px 3px 0 #111, 3px 3px 0 #111'
      : effects?.shadow
        ? '0 12px 28px #000b'
        : undefined,
    boxShadow: layer.type !== 'text' && effects?.shadow ? '0 28px 60px #0008' : undefined,
  };

  if (layer.type === 'text') return <div style={style}>{layer.text}</div>;
  if (layer.type === 'shape')
    return <div style={{...style, height: style.height ?? '20%', background: '#ffffff22'}} />;
  if (!layer.assetPath) return null;
  const src = staticFile(`${assetBasePath}/${layer.assetPath}`);
  if (layer.type === 'video') return <OffthreadVideo src={src} style={style} muted />;
  return <Img src={src} style={style} />;
};
