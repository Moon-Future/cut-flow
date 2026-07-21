import {Composition} from 'remotion';
import {buildTimeline} from '../core/timeline';
import {VideoComposition} from './video-composition';
import {demoProject} from './demo-project';

export const RemotionRoot = () => {
  const timeline = buildTimeline(demoProject);
  return (
    <Composition
      id="CutFlowVideo"
      component={VideoComposition}
      durationInFrames={timeline.durationInFrames}
      fps={demoProject.project.fps}
      width={demoProject.project.width}
      height={demoProject.project.height}
      defaultProps={{
        project: demoProject,
        narrationAvailable: false,
        assetBasePath: 'demo-project',
      }}
      calculateMetadata={({props}) => {
        const calculated = buildTimeline(props.project);
        return {
          durationInFrames: calculated.durationInFrames,
          fps: props.project.project.fps,
          width: props.project.project.width,
          height: props.project.project.height,
        };
      }}
    />
  );
};
