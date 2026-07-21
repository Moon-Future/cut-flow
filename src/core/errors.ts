export class ProjectError extends Error {
  public constructor(
    public readonly code:
      'INVALID_JSON' | 'INVALID_PROJECT' | 'ASSET_NOT_FOUND' | 'PATH_OUTSIDE_PROJECT',
    message: string,
    public readonly fieldPath?: string,
    public readonly sceneId?: string,
  ) {
    super(message);
    this.name = 'ProjectError';
  }
}
