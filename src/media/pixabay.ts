export type PixabayMediaKind = 'image' | 'video';

export type PixabaySearchResult = {
  id: string;
  kind: PixabayMediaKind;
  previewUrl: string;
  downloadUrl: string;
  pageUrl: string;
  author: string;
  width: number;
  height: number;
  duration?: number;
  views: number;
  downloads: number;
  likes: number;
};

export type PixabaySearchResponse = {
  query: string;
  kind: PixabayMediaKind;
  cached: boolean;
  results: PixabaySearchResult[];
};
