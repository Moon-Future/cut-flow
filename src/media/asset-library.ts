import {z} from 'zod';

export const assetMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['image', 'video', 'audio']),
  source: z.enum(['local', 'generated', 'online']),
  path: z.string().min(1),
  license: z.enum(['user-owned', 'cc0', 'licensed', 'unknown']),
  commercialUse: z.boolean(),
  originalUrl: z.url().nullable().optional(),
  createdAt: z.iso.datetime(),
  keywords: z.array(z.string().min(1)).default([]),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().positive().optional(),
  author: z.string().min(1).optional(),
  sourceName: z.string().min(1).optional(),
  licenseUrl: z.url().optional(),
  projectId: z.string().min(1).optional(),
  projectTitle: z.string().min(1).optional(),
  originProjectId: z.string().min(1).optional(),
  originProjectTitle: z.string().min(1).optional(),
});

export const assetLibrarySchema = z.object({
  version: z.literal(1),
  assets: z.array(assetMetadataSchema),
});

export type AssetMetadata = z.infer<typeof assetMetadataSchema>;
export type AssetLibrary = z.infer<typeof assetLibrarySchema>;

const normalizedTerms = (text: string): string[] =>
  text
    .toLocaleLowerCase()
    .split(/[\s,，。；;、/|_-]+/u)
    .map((term) => term.trim())
    .filter(Boolean);

export const scoreAsset = (asset: AssetMetadata, query: string): number => {
  const queryTerms = normalizedTerms(query);
  const candidate = normalizedTerms([asset.name, ...asset.keywords].join(' '));
  return queryTerms.reduce((score, term) => {
    if (candidate.includes(term)) return score + 4;
    if (candidate.some((word) => word.includes(term) || term.includes(word))) return score + 1;
    return score;
  }, 0);
};

export const matchAsset = (
  assets: AssetMetadata[],
  query: string,
  type?: 'image' | 'video',
): AssetMetadata | null => {
  const candidates = assets
    .filter((asset) => asset.commercialUse && asset.license !== 'unknown')
    .filter((asset) => !type || asset.type === type)
    .map((asset) => ({asset, score: scoreAsset(asset, query)}))
    .sort((a, b) => b.score - a.score || a.asset.name.localeCompare(b.asset.name));
  return candidates[0]?.score ? candidates[0].asset : null;
};
