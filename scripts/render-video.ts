import {existsSync} from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {loadProject} from '../src/core/project-loader';

const argument = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name);
  return (index >= 0 ? process.argv.at(index + 1) : undefined) ?? fallback;
};

const projectPath = path.resolve(argument('--project', 'projects/demo-project/project.json'));
const outputPath = path.resolve(argument('--output', 'out/demo.mp4'));
const {project, projectRoot, warnings} = await loadProject(projectPath);
warnings.forEach((warning) => console.warn(`WARNING ${warning.code}: ${warning.message}`));

const projectsRoot = path.resolve('projects');
const relativeProjectRoot = path.relative(projectsRoot, projectRoot);
if (relativeProjectRoot.startsWith('..') || path.isAbsolute(relativeProjectRoot)) {
  throw new Error(`Renderable projects must be stored inside ${projectsRoot}: ${projectRoot}`);
}
const assetBasePath = relativeProjectRoot.split(path.sep).join('/');

console.log('Bundling Remotion project...');
const serveUrl = await bundle({
  entryPoint: path.resolve('src/remotion/index.ts'),
  publicDir: path.resolve('projects'),
});
const inputProps = {
  project,
  narrationAvailable: Boolean(project.narrationAudio && warnings.length === 0),
  assetBasePath,
};
const installedChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browserExecutable =
  process.env.REMOTION_BROWSER_EXECUTABLE ??
  (existsSync(installedChrome) ? installedChrome : undefined);
const composition = await selectComposition({
  serveUrl,
  id: 'CutFlowVideo',
  inputProps,
  browserExecutable,
});

console.log(`Rendering ${composition.durationInFrames} frames to ${outputPath}...`);
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: outputPath,
  inputProps,
  browserExecutable,
  onProgress: ({progress}) => process.stdout.write(`\r${Math.round(progress * 100)}%`),
});
console.log(`\nRendered: ${outputPath}`);
