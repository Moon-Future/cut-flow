import {AbsoluteFill} from 'remotion';
import type {VisualShot} from '../../core/schema';
import {VisualLayer} from './visual-layer';

type Props = {
  shot: VisualShot;
  assetBasePath: string;
  durationInFrames: number;
  fps: number;
};

export const LayeredShot = ({shot, assetBasePath, durationInFrames, fps}: Props) => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    {[...(shot.layers ?? [])]
      .sort((a, b) => a.position.zIndex - b.position.zIndex)
      .map((layer) => (
        <VisualLayer
          key={layer.id}
          layer={layer}
          assetBasePath={assetBasePath}
          durationInFrames={durationInFrames}
          fps={fps}
        />
      ))}
  </AbsoluteFill>
);
