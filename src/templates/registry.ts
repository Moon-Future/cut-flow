import {gameDevLogTemplate} from './game-dev-log';
import type {VideoTemplate} from './types';

const fallbackTemplate: VideoTemplate = {
  ...gameDevLogTemplate,
  id: 'default',
  name: '默认模板',
  brandLabel: 'CUT FLOW',
};

const templates = new Map([[gameDevLogTemplate.id, gameDevLogTemplate]]);

export const getTemplate = (id: string): VideoTemplate => templates.get(id) ?? fallbackTemplate;
export const listTemplates = (): VideoTemplate[] => [...templates.values()];
