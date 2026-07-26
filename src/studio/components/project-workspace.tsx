import {useState} from 'react';
import {CreateProjectPage} from './create-project-page';
import {SettingsWorkspace} from './settings-workspace';
import {WorkspaceSidebar, type WorkspaceSection} from './workspace-sidebar';

type Props = {
  onOpen: (projectId: string, startInContent: boolean) => Promise<void>;
  onNavigate: (section: WorkspaceSection) => void;
  onClose: () => void;
};

export const ProjectWorkspace = ({onOpen, onNavigate, onClose}: Props) => {
  const [section, setSection] = useState<WorkspaceSection>('overview');
  return (
    <div className="edit-app">
      <WorkspaceSidebar
        section={section}
        project={null}
        onNavigate={(value) => {
          setSection(value);
          onNavigate(value);
        }}
        onNewProject={() => setSection('overview')}
      />
      <main className="edit-main stage-mode create-workspace">
        {section === 'settings' ? (
          <SettingsWorkspace />
        ) : (
          <CreateProjectPage onOpen={onOpen} onClose={onClose} />
        )}
      </main>
    </div>
  );
};
