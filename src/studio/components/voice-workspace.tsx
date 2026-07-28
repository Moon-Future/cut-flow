import {useRef, useState} from 'react';
import type {ProjectFile} from '../../core/schema';
import {useStudioStore} from '../store';

type Props = {
  project: ProjectFile;
  projectId: string;
  audioAvailable: boolean;
  onGenerated: (project: ProjectFile) => void;
  onAudioReady: () => void;
};

const AUDIO_ACCEPT = '.wav,.mp3,.m4a,.aac,.flac,.ogg,audio/*';

export const VoiceWorkspace = ({
  project,
  projectId,
  audioAvailable,
  onGenerated,
  onAudioReady,
}: Props) => {
  const {selectedSceneId, selectScene, updateScene} = useStudioStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [controlInstruction, setControlInstruction] = useState(
    '自然清晰的中文讲解，语速适中，避免播音腔',
  );
  const fullAudioInput = useRef<HTMLInputElement>(null);
  const selectedScene = project.scenes.find((scene) => scene.id === selectedSceneId);
  const duration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);

  const uploadAudio = async (file: File) => {
    const response = await fetch('/api/assets', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        'X-Target-Directory': encodeURIComponent('audio'),
      },
      body: file,
    });
    const value = (await response.json()) as {assetPath?: string; error?: string};
    if (!response.ok || !value.assetPath) throw new Error(value.error ?? '导入配音失败');
    return value.assetPath;
  };

  const importFullAudio = async (file: File) => {
    setBusy('full');
    setMessage('');
    try {
      const audioPath = await uploadAudio(file);
      onGenerated({...project, narrationAudio: audioPath});
      onAudioReady();
      setMessage('完整配音已导入，可在右侧试听。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const importSceneAudio = async (sceneId: string, file: File) => {
    setBusy(sceneId);
    setMessage('');
    try {
      const audioPath = await uploadAudio(file);
      onGenerated({
        ...project,
        scenes: project.scenes.map((scene) =>
          scene.id === sceneId ? {...scene, narrationAudio: audioPath} : scene,
        ),
      });
      setMessage('当前段落配音已导入。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const generateVoxCpm = async () => {
    if (!selectedScene) return;
    setBusy(`voxcpm-${selectedScene.id}`);
    setMessage('正在等待 VoxCPM 公共服务生成，请勿重复提交…');
    try {
      const response = await fetch('/api/voice/voxcpm-demo', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sceneId: selectedScene.id,
          text: selectedScene.narration,
          controlInstruction,
        }),
      });
      const value = (await response.json()) as {audioPath?: string; error?: string};
      if (!response.ok || !value.audioPath) throw new Error(value.error ?? 'VoxCPM 生成失败');
      onGenerated({
        ...project,
        scenes: project.scenes.map((scene) =>
          scene.id === selectedScene.id ? {...scene, narrationAudio: value.audioPath} : scene,
        ),
      });
      setMessage('VoxCPM 已生成当前段落配音。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="voice-studio">
      <aside className="voice-config stage-panel">
        <header>
          <div>
            <strong>配音来源</strong>
            <span>导入现有音频，或体验 VoxCPM</span>
          </div>
        </header>
        <div className="voice-source-panel">
          <section>
            <strong>手动导入</strong>
            <p>支持 WAV、MP3、M4A、AAC、FLAC、OGG；原文件会保存在项目素材中。</p>
            <input
              ref={fullAudioInput}
              hidden
              type="file"
              accept={AUDIO_ACCEPT}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFullAudio(file);
                event.target.value = '';
              }}
            />
            <button
              className="primary-action"
              disabled={Boolean(busy)}
              onClick={() => fullAudioInput.current?.click()}
            >
              {busy === 'full' ? '正在导入…' : audioAvailable ? '替换完整配音' : '导入完整配音'}
            </button>
            <small>也可在中间每个段落内单独导入或替换配音。</small>
          </section>
          <section>
            <div className="experimental-title">
              <strong>VoxCPM 公共体验</strong>
              <span>实验性</span>
            </div>
            <p>只生成当前选中段落。公共服务可能排队、限流或不可用。</p>
            <label>
              <span>声音与表达要求</span>
              <textarea
                rows={4}
                value={controlInstruction}
                onChange={(event) => setControlInstruction(event.target.value)}
              />
            </label>
            <button
              className="secondary-action"
              disabled={!selectedScene || Boolean(busy)}
              onClick={() => void generateVoxCpm()}
            >
              {busy?.startsWith('voxcpm-') ? '生成中…' : '生成当前段落'}
            </button>
            <small>文本会发送到公开的 Hugging Face Demo，请勿提交敏感内容。</small>
          </section>
          {message ? <p className="voice-message">{message}</p> : null}
        </div>
      </aside>

      <main className="voice-editor stage-panel">
        <header>
          <div>
            <strong>旁白段落</strong>
            <span>{project.scenes.length} 段 · {Math.round(duration)} 秒</span>
          </div>
          <span className={audioAvailable ? 'ready-pill' : 'pending-pill'}>
            {audioAvailable ? '完整配音已就绪' : '尚未导入完整配音'}
          </span>
        </header>
        <div className="voice-segments">
          {project.scenes.map((scene, index) => (
            <article
              key={scene.id}
              data-scene-navigator={scene.id}
              className={scene.id === selectedSceneId ? 'selected' : ''}
              onClick={() => selectScene(scene.id)}
            >
              <header>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <strong>{scene.caption}</strong>
                <span>{scene.duration.toFixed(1)}s</span>
                <label className="segment-import" onClick={(event) => event.stopPropagation()}>
                  {busy === scene.id ? '导入中…' : scene.narrationAudio ? '替换' : '导入'}
                  <input
                    hidden
                    type="file"
                    accept={AUDIO_ACCEPT}
                    disabled={Boolean(busy)}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void importSceneAudio(scene.id, file);
                      event.target.value = '';
                    }}
                  />
                </label>
              </header>
              <textarea
                rows={3}
                value={scene.narration}
                onChange={(event) => updateScene(scene.id, {narration: event.target.value})}
              />
              {scene.narrationAudio ? (
                <div className="segment-audio">
                  <audio controls src={`/${projectId}/${scene.narrationAudio}`} />
                  <button
                    title="移除当前段落配音"
                    onClick={(event) => {
                      event.stopPropagation();
                      onGenerated({
                        ...project,
                        scenes: project.scenes.map((item) =>
                          item.id === scene.id ? {...item, narrationAudio: null} : item,
                        ),
                      });
                    }}
                  >
                    移除
                  </button>
                </div>
              ) : (
                <div className="mini-wave"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
              )}
            </article>
          ))}
        </div>
      </main>

      <aside className="voice-preview">
        <section className="stage-panel">
          <header>
            <strong>完整配音预览</strong>
            <span>{Math.round(duration)} 秒</span>
          </header>
          {audioAvailable && project.narrationAudio ? (
            <>
              <audio controls src={`/${projectId}/${project.narrationAudio}`} />
              <button
                className="text-action voice-remove-full"
                onClick={() => onGenerated({...project, narrationAudio: null})}
              >
                移除完整配音
              </button>
            </>
          ) : (
            <div className="empty-audio">
              <b>◉</b>
              <p>导入完整配音后可在这里试听；分段音频在对应段落内试听。</p>
            </div>
          )}
        </section>
        <section className="stage-panel voice-check">
          <header><strong>配音检查</strong></header>
          <ul>
            <li>✓ 文案段落完整</li>
            <li>{project.scenes.filter((scene) => scene.narrationAudio).length} / {project.scenes.length} 段已有独立配音</li>
            <li>{audioAvailable ? '✓ 完整配音已就绪' : '○ 可导入完整配音作为主音轨'}</li>
            <li>○ 建议试听并检查配音与镜头时长</li>
          </ul>
        </section>
      </aside>
    </section>
  );
};
