import {chmod, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {aiSettingsFile} from './settings';
import {normalizeTopicTitle, type TopicRecommendation} from './topic-recommendations';

export type FavoriteTopic = TopicRecommendation & {savedAt: string};

const favoritesFile = () => path.join(path.dirname(aiSettingsFile()), 'topic-favorites.json');

export const loadTopicFavorites = async (): Promise<FavoriteTopic[]> => {
  try {
    const value = JSON.parse(await readFile(favoritesFile(), 'utf8')) as unknown;
    if (!Array.isArray(value)) return [];
    const items: unknown[] = value;
    return items.filter((item): item is FavoriteTopic => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Record<string, unknown>;
      return typeof record.title === 'string' && typeof record.savedAt === 'string';
    });
  } catch {
    return [];
  }
};

export const saveTopicFavorites = async (favorites: FavoriteTopic[]): Promise<void> => {
  const file = favoritesFile();
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, `${JSON.stringify(favorites, null, 2)}\n`, {encoding: 'utf8', mode: 0o600});
  await chmod(file, 0o600).catch(() => undefined);
};

export const setTopicFavorite = async (
  topic: TopicRecommendation,
  favorite: boolean,
): Promise<FavoriteTopic[]> => {
  const current = await loadTopicFavorites();
  const key = normalizeTopicTitle(topic.title);
  const remaining = current.filter((item) => normalizeTopicTitle(item.title) !== key);
  const next = favorite ? [{...topic, savedAt: new Date().toISOString()}, ...remaining] : remaining;
  await saveTopicFavorites(next);
  return next;
};
