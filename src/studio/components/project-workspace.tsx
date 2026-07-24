import {ProjectHub} from './project-hub';
import {WorkspaceSidebar, type WorkspaceSection} from './workspace-sidebar';

type Props = {
  onOpen: (projectId: string) => Promise<void>;
  onNavigate: (section: WorkspaceSection) => void;
};

export const ProjectWorkspace = ({onOpen, onNavigate}: Props) => (
  <div className="edit-app">
    <WorkspaceSidebar
      section="overview"
      project={null}
      onNavigate={onNavigate}
      onNewProject={() => undefined}
    />
    <main className="edit-main stage-mode">
      <header className="edit-header">
        <div>
          <strong>我的项目</strong>
        </div>
        <span />
        <div>
          <span className="workspace-hint">创建项目后，在左侧完成整条视频流程</span>
        </div>
      </header>
      <ProjectHub embedded onOpen={onOpen} />
    </main>
  </div>
);
