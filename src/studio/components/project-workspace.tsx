import {CreateProjectPage} from './create-project-page';
import {WorkspaceSidebar, type WorkspaceSection} from './workspace-sidebar';

type Props = {
  onOpen: (projectId: string, startInContent: boolean) => Promise<void>;
  onNavigate: (section: WorkspaceSection) => void;
  onClose: () => void;
};

export const ProjectWorkspace = ({onOpen, onNavigate, onClose}: Props) => (
  <div className="edit-app">
    <WorkspaceSidebar
      section="overview"
      project={null}
      onNavigate={onNavigate}
      onNewProject={() => undefined}
    />
    <main className="edit-main stage-mode create-workspace">
      <CreateProjectPage onOpen={onOpen} onClose={onClose} />
    </main>
  </div>
);
