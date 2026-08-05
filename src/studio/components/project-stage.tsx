import {useState} from 'react';
import type {ProjectFile} from '../../core/schema';
import {AssetsWorkspace} from './assets-workspace';
import {ContentWorkspace} from './content-workspace';
import {ProjectDashboard} from './project-dashboard';
import {StoryboardWorkspace} from './storyboard-workspace';
import {VoiceWorkspace} from './voice-workspace';
import {CoverWorkspace} from './cover-workspace';
import type {WorkspaceSection} from './workspace-sidebar';
import {SettingsWorkspace} from './settings-workspace';
import type {AssetSelectionTarget} from '../asset-selection';
import {AudioMergeWorkspace} from './audio-merge-workspace';

type Props = {
  section: Exclude<WorkspaceSection, 'edit'>;
  project: ProjectFile;
  onNavigate: (section: WorkspaceSection) => void;
  onGenerated: (project: ProjectFile) => void;
  onAudioReady: () => void;
  onAssets: (target?: AssetSelectionTarget) => void;
  onRender: () => void;
  currentProjectId: string;
  onNewProject: () => void;
  onOpenProject: (projectId: string) => Promise<void>;
  audioAvailable: boolean;
};

const sectionTitles: Record<Exclude<WorkspaceSection, 'edit'>, [string, string]> = {
  overview: ['项目概览', '查看当前进度并继续下一步'],
  content: ['主题与脚本', '确定主题，生成并确认完整口播脚本'],
  storyboard: ['分镜与素材', '按每段旁白准备画面，缺什么就补什么'],
  voice: ['配音与字幕', '生成或导入配音，并检查字幕时间'],
  assets: ['素材', '按分镜统一选用、替换和移除项目素材'],
  cover: ['封面制作', '制作适配抖音主页展示的 3:4 封面'],
  export: ['交付', '整理剪辑生产包，或生成一条粗剪参考视频'],
  'audio-merge': ['音频合并', '将多条音频按顺序合成为一个文件'],
  settings: ['设置', '配置本机 AI 服务与密钥'],
};

const previousSection: Partial<Record<Exclude<WorkspaceSection, 'edit'>, WorkspaceSection>> = {
  content: 'overview',
  voice: 'content',
  storyboard: 'voice',
  assets: 'storyboard',
  cover: 'storyboard',
  export: 'cover',
};

const nextSection: Partial<Record<Exclude<WorkspaceSection, 'edit'>, WorkspaceSection>> = {
  content: 'voice',
  voice: 'storyboard',
  storyboard: 'cover',
  assets: 'cover',
  cover: 'export',
};

export const ProjectStage = ({
  section,
  project,
  onNavigate,
  onGenerated,
  onAudioReady,
  onAssets,
  onRender,
  currentProjectId,
  onNewProject,
  onOpenProject,
  audioAvailable,
}: Props) => {
  const [assetTargetShotId, setAssetTargetShotId] = useState<string | null>(null);
  const [packageExport, setPackageExport] = useState<{
    status: 'idle' | 'running' | 'success' | 'error';
    message?: string;
    output?: string;
    warningCount?: number;
  }>({status: 'idle'});
  const totalDuration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const [title, description] = sectionTitles[section];
  const exportEditingPackage = async () => {
    setPackageExport({status: 'running', message: '正在整理脚本、字幕、配音和镜头素材…'});
    try {
      const response = await fetch('/api/export/editing-package', {method: 'POST'});
      const value = (await response.json()) as {
        message?: string;
        output?: string;
        warnings?: unknown[];
        error?: string;
      };
      if (!response.ok) throw new Error(value.error ?? '剪辑生产包导出失败');
      setPackageExport({
        status: 'success',
        message: value.message ?? '剪辑生产包已生成',
        output: value.output,
        warningCount: value.warnings?.length ?? 0,
      });
    } catch (error) {
      setPackageExport({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <section className="project-stage">
      {!['overview', 'settings', 'audio-merge'].includes(section) ? (
        <header className="stage-heading">
          <div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <div className="stage-heading-actions">
            {section === 'storyboard' ? (
              <button className="secondary-button" onClick={() => onAssets()}>
                打开素材库
              </button>
            ) : null}
            {previousSection[section] ? (
              <button
                className="secondary-button"
                onClick={() => onNavigate(previousSection[section]!)}
              >
                ← 上一步
              </button>
            ) : null}
            {nextSection[section] ? (
              <button className="primary-button" onClick={() => onNavigate(nextSection[section]!)}>
                下一步 →
              </button>
            ) : null}
          </div>
        </header>
      ) : null}

      {section === 'overview' ? (
        <ProjectDashboard
          project={project}
          currentProjectId={currentProjectId}
          onNewProject={onNewProject}
          onOpenProject={onOpenProject}
          onNavigate={onNavigate}
          onAssets={onAssets}
        />
      ) : null}

      {section === 'content' ? (
        <ContentWorkspace project={project} onGenerated={onGenerated} onAudioReady={onAudioReady} />
      ) : null}
      {section === 'storyboard' ? (
        <StoryboardWorkspace
          project={project}
          projectId={currentProjectId}
          onGoToAssets={(shotId) => {
            const sceneId =
              project.scenes.find((scene) => scene.shots?.some((shot) => shot.id === shotId))?.id ??
              project.scenes[0]!.id;
            setAssetTargetShotId(shotId);
            onAssets({sceneId, shotId});
          }}
        />
      ) : null}
      {section === 'voice' ? (
        <VoiceWorkspace
          project={project}
          projectId={currentProjectId}
          audioAvailable={audioAvailable}
          onGenerated={onGenerated}
          onAudioReady={onAudioReady}
        />
      ) : null}
      {section === 'audio-merge' ? <AudioMergeWorkspace projectId={currentProjectId} /> : null}
      {section === 'assets' ? (
        <AssetsWorkspace
          project={project}
          projectId={currentProjectId}
          initialShotId={assetTargetShotId}
          onOpenLibrary={() => onAssets()}
        />
      ) : null}
      {section === 'cover' ? (
        <CoverWorkspace project={project} projectId={currentProjectId} />
      ) : null}
      {section === 'export' ? (
        <div className="stage-empty">
          <b>⇧</b>
          <h2>准备交付到专业剪辑软件</h2>
          <p>
            {project.scenes.length} 个镜头 · {Math.round(totalDuration)} 秒 ·{' '}
            {project.project.width} × {project.project.height}
          </p>
          <div className="stage-export-actions">
            <button
              className="primary-button"
              disabled={packageExport.status === 'running'}
              onClick={() => void exportEditingPackage()}
            >
              {packageExport.status === 'running' ? '正在整理…' : '导出剪辑生产包'}
            </button>
            <button className="render-reference-button" onClick={onRender}>
              <span className="render-reference-icon">▶</span>
              <span>
                <strong>生成粗剪参考</strong>
                <small>MP4 · 用于快速检查成片</small>
              </span>
            </button>
          </div>
          <small>生产包包含脚本、分镜表、SRT 字幕、配音、编号素材和剪辑说明。</small>
          {packageExport.status !== 'idle' ? (
            <div className={`stage-export-result ${packageExport.status}`}>
              <strong>{packageExport.message}</strong>
              {packageExport.output ? <span>{packageExport.output}</span> : null}
              {packageExport.warningCount ? (
                <small>{packageExport.warningCount} 项缺失内容已写入剪辑说明</small>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {section === 'settings' ? <SettingsWorkspace /> : null}
    </section>
  );
};
