import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import type {ProjectFile} from '../core/schema';
import {buildTimeline, secondsToFrames} from '../core/timeline';
import {SceneView} from './components/scene-view';

export type VideoCompositionProps = {
  project: ProjectFile;
  narrationAvailable: boolean;
  assetBasePath: string;
};

export const VideoComposition = ({
  project,
  narrationAvailable,
  assetBasePath,
}: VideoCompositionProps) => {
  const timeline = buildTimeline(project);
  const fadeFrames = secondsToFrames(project.style.transitionDuration, project.project.fps);

  return (
    <AbsoluteFill style={{backgroundColor: '#080b12'}}>
      {timeline.scenes.map(({scene, from, durationInFrames}, index) => (
        <Sequence key={scene.id} from={from} durationInFrames={durationInFrames} premountFor={30}>
          <SceneView
            scene={scene}
            style={project.style}
            durationInFrames={durationInFrames}
            fadeFrames={fadeFrames}
            isFirst={index === 0}
            isLast={index === timeline.scenes.length - 1}
            assetBasePath={assetBasePath}
          />
        </Sequence>
      ))}
      {narrationAvailable && project.narrationAudio ? (
        <Audio src={staticFile(`${assetBasePath}/${project.narrationAudio}`)} />
      ) : null}
    </AbsoluteFill>
  );
};
