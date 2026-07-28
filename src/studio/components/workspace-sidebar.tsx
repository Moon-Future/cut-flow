import type {ProjectFile} from '../../core/schema';

export type WorkspaceSection =
  | 'overview'
  | 'content'
  | 'storyboard'
  | 'voice'
  | 'assets'
  | 'edit'
  | 'cover'
  | 'export'
  | 'settings';

const navItems: Array<[WorkspaceSection, string, string]> = [['overview', '我的项目', '⌂']];

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
        <small>从选题到剪辑生产包</small>
      </span>
    </button>
    <button className="new-project-nav" onClick={onNewProject}>
      ＋ 新建项目
    </button>
    <nav>
      {navItems.map(([value, label, icon]) => (
        <button
          key={value}
          className={section === value ? 'active' : ''}
          disabled={!project && !['overview', 'settings'].includes(value)}
          onClick={() => onNavigate(value)}
        >
          <i>{icon}</i>
          <span>{label}</span>
        </button>
      ))}
      {section === 'overview' && project ? (
        <p className="nav-entry-hint">选择项目后，在项目顶部按步骤完成制作。</p>
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
    <button
      className={`sidebar-settings ${section === 'settings' ? 'active' : ''}`}
      onClick={() => onNavigate('settings')}
    >
      <i>⚙</i>
      <span>设置</span>
    </button>
  </aside>
);
