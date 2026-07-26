import type {ProjectFile} from '../../core/schema';

export type WorkspaceSection =
  'overview' | 'content' | 'storyboard' | 'voice' | 'assets' | 'edit' | 'export' | 'settings';

const navItems: Array<[WorkspaceSection, string, string]> = [
  ['overview', '项目概览', '⌂'],
  ['content', '文案', '▤'],
  ['storyboard', '脚本与分镜', '▦'],
  ['voice', '配音', '◉'],
  ['assets', '素材', '□'],
  ['edit', '剪辑', '✂'],
  ['export', '导出', '⇧'],
  ['settings', '设置', '⚙'],
];

type Props = {
  section: WorkspaceSection;
  project: ProjectFile | null;
  onNavigate: (section: WorkspaceSection) => void;
  onNewProject: () => void;
};

export const WorkspaceSidebar = ({section, project, onNavigate, onNewProject}: Props) => (
  <aside className="edit-sidebar">
    <button className="edit-logo" onClick={() => onNavigate('overview')}>
      <b>◆</b>
      <span>
        <strong>CutFlow</strong>
        <small>让文案自动流动成视频</small>
      </span>
    </button>
    <button className="new-project-nav" onClick={onNewProject}>
      ＋ 新建项目
    </button>
    <nav>
      {navItems
        .filter(([value]) => section !== 'overview' || value === 'overview' || value === 'settings')
        .map(([value, label, icon]) => (
        <button
          key={value}
          className={section === value ? 'active' : ''}
          disabled={!project && !['overview', 'settings'].includes(value)}
          onClick={() => onNavigate(value)}
        >
          <i>{icon}</i>
          <span>{label}</span>
          {project && ['content', 'storyboard'].includes(value) ? <em>✓</em> : null}
        </button>
        ))}
      {section === 'overview' && project ? (
        <p className="nav-entry-hint">双击最近项目，进入文案、脚本与剪辑工作区</p>
      ) : null}
    </nav>
    <section className="project-specs">
      <strong>项目设置</strong>
      {project ? (
        <>
          <span>
            ▯ {project.project.width < project.project.height ? '9:16 竖屏' : '16:9 横屏'}
          </span>
          <span>▦ {project.project.fps} FPS</span>
          <span>◎ 中文（简体）</span>
        </>
      ) : (
        <span>选择或创建项目后显示</span>
      )}
    </section>
  </aside>
);
