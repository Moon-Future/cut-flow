import {useState} from 'react';
import {useStudioStore} from '../store';

export const SceneList = ({onSelect}: {onSelect?: () => void}) => {
  const {project, selectedSceneId, lockedSceneIds, selectScene, reorderScenes, toggleLock} =
    useStudioStore();
  const [dragging, setDragging] = useState<string | null>(null);
  if (!project) return null;
  return (
    <div className="scene-list">
      {project.scenes.map((scene, index) => {
        const locked = lockedSceneIds.includes(scene.id);
        return (
          <article
            key={scene.id}
            className={`scene-card ${selectedSceneId === scene.id ? 'selected' : ''} ${dragging === scene.id ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDragging(scene.id)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragging) reorderScenes(dragging, scene.id);
              setDragging(null);
            }}
            onClick={() => {
              selectScene(scene.id);
              onSelect?.();
            }}
          >
            <div className="scene-index">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <i />
            </div>
            <div className="scene-copy">
              <strong>{scene.caption}</strong>
              <p>{scene.narration || '暂无旁白'}</p>
              <div>
                <span>{scene.duration.toFixed(1)}s</span>
                <span>{scene.layout}</span>
              </div>
            </div>
            <button
              className={`lock-button ${locked ? 'locked' : ''}`}
              aria-label={locked ? '解锁镜头' : '锁定镜头'}
              onClick={(event) => {
                event.stopPropagation();
                toggleLock(scene.id);
              }}
            >
              {locked ? '锁' : '○'}
            </button>
          </article>
        );
      })}
    </div>
  );
};
