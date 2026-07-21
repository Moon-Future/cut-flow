import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import type {ZodError} from 'zod';
import {ProjectError} from './errors';
import {projectFileSchema, type ProjectFile} from './schema';

export type ProjectWarning = {
  code: 'NARRATION_NOT_FOUND';
  message: string;
  fieldPath: 'narrationAudio';
};

export type LoadedProject = {
  project: ProjectFile;
  projectRoot: string;
  warnings: ProjectWarning[];
};

const resolveInsideProject = (projectRoot: string, relativePath: string): string => {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ProjectError(
      'PATH_OUTSIDE_PROJECT',
      `Path leaves the project directory: ${relativePath}`,
    );
  }
  return resolved;
};

const exists = async (filePath: string): Promise<boolean> => {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
};

const formatZodError = (error: ZodError): string =>
  error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('\n');

export const loadProject = async (projectFilePath: string): Promise<LoadedProject> => {
  const absoluteProjectFile = path.resolve(projectFilePath);
  const projectRoot = path.dirname(absoluteProjectFile);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(absoluteProjectFile, 'utf8')) as unknown;
  } catch (error) {
    throw new ProjectError(
      'INVALID_JSON',
      `Could not read JSON at ${absoluteProjectFile}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const parsed = projectFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProjectError('INVALID_PROJECT', formatZodError(parsed.error));
  }

  for (const [index, scene] of parsed.data.scenes.entries()) {
    const assetPath = resolveInsideProject(projectRoot, scene.assetPath);
    if (!(await exists(assetPath))) {
      throw new ProjectError(
        'ASSET_NOT_FOUND',
        `Visual asset does not exist: ${assetPath}`,
        `scenes.${index}.assetPath`,
        scene.id,
      );
    }
  }

  const warnings: ProjectWarning[] = [];
  if (parsed.data.narrationAudio) {
    const narrationPath = resolveInsideProject(projectRoot, parsed.data.narrationAudio);
    if (!(await exists(narrationPath))) {
      warnings.push({
        code: 'NARRATION_NOT_FOUND',
        fieldPath: 'narrationAudio',
        message: `Narration audio not found; preview and render will be silent: ${narrationPath}`,
      });
    }
  }

  return {project: parsed.data, projectRoot, warnings};
};
