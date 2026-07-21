import path from 'node:path';
import {ProjectError} from '../src/core/errors';
import {loadProject} from '../src/core/project-loader';
import {buildTimeline} from '../src/core/timeline';

const getProjectPath = (): string => {
  const index = process.argv.indexOf('--project');
  const value = index >= 0 ? process.argv.at(index + 1) : undefined;
  return value ? path.resolve(value) : path.resolve('projects/demo-project/project.json');
};

try {
  const {project, warnings} = await loadProject(getProjectPath());
  warnings.forEach((warning) =>
    console.warn(`WARNING ${warning.code} ${warning.fieldPath}: ${warning.message}`),
  );
  const timeline = buildTimeline(project);
  console.log(`Valid project: ${project.project.title}`);
  console.log(
    `${project.scenes.length} scenes, ${timeline.durationInFrames} frames at ${project.project.fps} FPS`,
  );
} catch (error) {
  if (error instanceof ProjectError) {
    console.error(
      `${error.code}${error.fieldPath ? ` ${error.fieldPath}` : ''}${error.sceneId ? ` (${error.sceneId})` : ''}: ${error.message}`,
    );
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
