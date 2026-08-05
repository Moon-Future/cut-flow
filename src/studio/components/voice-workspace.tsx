import {useEffect, useRef, useState} from 'react';
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
  const [controlInstruction, setControlInstruction] = useState('');
  const [edgeVoice, setEdgeVoice] = useState('zh-CN-XiaoxiaoNeural');
  const [edgeRate, setEdgeRate] = useState(0);
  const [voicePreset, setVoicePreset] = useState<'tim' | 'custom'>('tim');
  const [referenceAudioPath, setReferenceAudioPath] = useState('');
  const [referenceAudioName, setReferenceAudioName] = useState('');
  const [promptText, setPromptText] = useState(
    '你有没有发现香菜这东西爱的人爱的要死，恨的人恨得咬牙切齿，甚至有人给他起了个外号叫臭菜。',
  );
  const fullAudioInput = useRef<HTMLInputElement>(null);
  const referenceAudioInput = useRef<HTMLInputElement>(null);
  const selectedScene = project.scenes.find((scene) => scene.id === selectedSceneId);
  const selectedVoiceTask = selectedScene?.voiceGenerationTask;
  const runningVoiceCount = project.scenes.filter((scene) =>
    ['queued', 'running'].includes(scene.voiceGenerationTask?.status ?? ''),
  ).length;
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
      onGenerated({...project, narrationAudio: audioPath, narrationMode: 'full'});
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
      const candidate = {
        id: `voice-${Date.now()}`,
        path: audioPath,
        label: file.name,
        source: 'import' as const,
        createdAt: new Date().toISOString(),
      };
      onGenerated({
        ...project,
        scenes: project.scenes.map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                narrationAudio: audioPath,
                narrationAudioCandidates: [...(scene.narrationAudioCandidates ?? []), candidate],
              }
            : scene,
        ),
      });
      setMessage('当前段落配音已导入。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const mergeSceneAudio = async () => {
    setBusy('merge');
    setMessage('正在按段落顺序连续合并音频…');
    try {
      const response = await fetch('/api/voice/merge', {method: 'POST'});
      const value = (await response.json()) as {
        project?: ProjectFile;
        audioPath?: string;
        error?: string;
      };
      if (!response.ok || !value.project || !value.audioPath) {
        throw new Error(value.error ?? '合并分段音频失败');
      }
      onGenerated(value.project);
      onAudioReady();
      setMessage('分段音频已合并，并切换为完整音频模式。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const openAudioLocation = async () => {
    if (!project.narrationAudio) return;
    const response = await fetch('/api/files/open-location', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({filePath: project.narrationAudio}),
    });
    if (!response.ok) {
      const value = (await response.json()) as {error?: string};
      setMessage(value.error ?? '无法打开音频所在目录');
    }
  };

  const generateEdgeTtsScene = async (sceneId: string) => {
    const response = await fetch('/api/voice/edge-tts', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({sceneId, voice: edgeVoice, rate: edgeRate}),
    });
    const value = (await response.json()) as {project?: ProjectFile; error?: string};
    if (!response.ok || !value.project) {
      throw new Error(value.error ?? 'Edge TTS 生成失败');
    }
    onGenerated(value.project);
    return value.project;
  };

  const generateEdgeTts = async () => {
    if (!selectedScene) return;
    setBusy(`edge-tts-${selectedScene.id}`);
    setMessage('正在使用 Edge TTS 生成当前段落…');
    try {
      await generateEdgeTtsScene(selectedScene.id);
      setMessage('当前段落 Edge TTS 配音已生成。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const generateAllEdgeTts = async () => {
    setBusy('edge-tts-all');
    setMessage(`正在生成全部 ${project.scenes.length} 个段落…`);
    let completed = 0;
    try {
      for (const scene of project.scenes) {
        await generateEdgeTtsScene(scene.id);
        completed += 1;
        setMessage(`Edge TTS 已完成 ${completed}/${project.scenes.length} 个段落…`);
      }
      setMessage(`全部 ${completed} 个段落的 Edge TTS 配音已生成。`);
    } catch (error) {
      setMessage(
        `已完成 ${completed} 个段落；${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusy(null);
    }
  };

  const generateVoxCpm = async () => {
    if (!selectedScene) return;
    if (voicePreset === 'custom' && (!referenceAudioPath || !promptText.trim())) {
      setMessage('请上传参考音频并填写参考音频原文。');
      return;
    }
    setBusy(`voxcpm-${selectedScene.id}`);
    setMessage('正在等待 VoxCPM 公共服务生成，请勿重复提交…');
    try {
      const response = await fetch('/api/voice/task', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sceneId: selectedScene.id,
          text: selectedScene.narration,
          controlInstruction,
          referenceAudioPath: voicePreset === 'custom' ? referenceAudioPath : undefined,
          voicePreset: voicePreset === 'tim' ? 'tim' : undefined,
          promptText,
        }),
      });
      const value = (await response.json()) as {
        task?: NonNullable<typeof selectedScene.voiceGenerationTask>;
        error?: string;
      };
      if (!response.ok || !value.task) throw new Error(value.error ?? 'VoxCPM 任务提交失败');
      updateScene(selectedScene.id, {voiceGenerationTask: value.task});
      setMessage('任务已提交，可以切换段落或前往其他页面。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const generateAllVoxCpm = async () => {
    if (voicePreset === 'custom' && (!referenceAudioPath || !promptText.trim())) {
      setMessage('请上传参考音频并填写参考音频原文。');
      return;
    }
    const pendingScenes = project.scenes.filter(
      (scene) => !['queued', 'running'].includes(scene.voiceGenerationTask?.status ?? ''),
    );
    if (!pendingScenes.length) {
      setMessage('所有段落都已有音频生成任务正在进行。');
      return;
    }
    setBusy('voxcpm-all');
    setMessage(`正在批量提交 ${pendingScenes.length} 个段落…`);
    let submitted = 0;
    const failed: string[] = [];
    try {
      for (const scene of pendingScenes) {
        const response = await fetch('/api/voice/task', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            sceneId: scene.id,
            text: scene.narration,
            controlInstruction,
            referenceAudioPath: voicePreset === 'custom' ? referenceAudioPath : undefined,
            voicePreset: voicePreset === 'tim' ? 'tim' : undefined,
            promptText,
          }),
        });
        const value = (await response.json()) as {
          task?: NonNullable<typeof scene.voiceGenerationTask>;
          error?: string;
        };
        if (!response.ok || !value.task) {
          failed.push(`${scene.caption}：${value.error ?? '提交失败'}`);
          continue;
        }
        updateScene(scene.id, {voiceGenerationTask: value.task});
        submitted += 1;
      }
      setMessage(
        failed.length
          ? `已提交 ${submitted} 个段落，${failed.length} 个提交失败：${failed.join('；')}`
          : `已提交全部 ${submitted} 个段落。生成结果会逐段返回，超过 5 分钟的任务将自动失败。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const stopAllVoxCpm = async () => {
    const runningScenes = project.scenes.filter((scene) =>
      ['queued', 'running'].includes(scene.voiceGenerationTask?.status ?? ''),
    );
    if (!runningScenes.length) return;
    setBusy('stop-voxcpm-all');
    setMessage(`正在结束 ${runningScenes.length} 个音频生成任务…`);
    let stopped = 0;
    const failed: string[] = [];
    try {
      for (const scene of runningScenes) {
        const response = await fetch(`/api/voice/task?sceneId=${encodeURIComponent(scene.id)}`, {
          method: 'DELETE',
        });
        const value = (await response.json()) as {
          task?: NonNullable<typeof scene.voiceGenerationTask>;
          error?: string;
        };
        if (!response.ok || !value.task) {
          failed.push(`${scene.caption}：${value.error ?? '结束失败'}`);
          continue;
        }
        updateScene(scene.id, {voiceGenerationTask: value.task});
        stopped += 1;
      }
      setMessage(
        failed.length
          ? `已结束 ${stopped} 个任务，${failed.length} 个结束失败：${failed.join('；')}`
          : `已结束全部 ${stopped} 个音频生成任务。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const stopVoxCpm = async () => {
    if (!selectedScene || !['queued', 'running'].includes(selectedVoiceTask?.status ?? '')) return;
    setBusy(`stop-voxcpm-${selectedScene.id}`);
    setMessage('正在结束音频生成任务…');
    try {
      const response = await fetch(
        `/api/voice/task?sceneId=${encodeURIComponent(selectedScene.id)}`,
        {method: 'DELETE'},
      );
      const value = (await response.json()) as {
        task?: NonNullable<typeof selectedScene.voiceGenerationTask>;
        error?: string;
      };
      if (!response.ok || !value.task) throw new Error(value.error ?? '结束音频生成失败');
      updateScene(selectedScene.id, {voiceGenerationTask: value.task});
      setMessage('已结束当前段落的音频生成，可以重新生成。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const runningScenes = project.scenes.filter((scene) =>
      ['queued', 'running'].includes(scene.voiceGenerationTask?.status ?? ''),
    );
    if (!runningScenes.length) return;
    const timer = window.setInterval(() => {
      for (const scene of runningScenes) {
        void fetch(`/api/voice/task?sceneId=${encodeURIComponent(scene.id)}`)
          .then((response) => response.json())
          .then(
            (value: {
              narrationAudio?: string | null;
              narrationAudioCandidates?: typeof scene.narrationAudioCandidates;
              task?: typeof scene.voiceGenerationTask;
            }) => {
              if (!value.task) return;
              const currentScene = useStudioStore
                .getState()
                .project?.scenes.find((item) => item.id === scene.id);
              const currentTask = currentScene?.voiceGenerationTask;
              const nextCandidates =
                value.narrationAudioCandidates ?? currentScene?.narrationAudioCandidates;
              const taskUnchanged =
                currentTask?.id === value.task.id &&
                currentTask.status === value.task.status &&
                currentTask.updatedAt === value.task.updatedAt &&
                currentTask.error === value.task.error;
              const audioUnchanged =
                (value.narrationAudio ?? currentScene?.narrationAudio) ===
                currentScene?.narrationAudio;
              const candidatesUnchanged =
                (nextCandidates?.length ?? 0) ===
                  (currentScene?.narrationAudioCandidates?.length ?? 0) &&
                nextCandidates?.at(-1)?.path ===
                  currentScene?.narrationAudioCandidates?.at(-1)?.path;
              if (taskUnchanged && audioUnchanged && candidatesUnchanged) return;
              updateScene(scene.id, {
                narrationAudio: value.narrationAudio ?? currentScene?.narrationAudio,
                narrationAudioCandidates: nextCandidates,
                voiceGenerationTask: value.task,
              });
              if (value.task.status === 'succeeded') {
                setMessage(`${scene.caption} 配音生成完成。`);
              } else if (value.task.status === 'failed') {
                setMessage(value.task.error ?? `${scene.caption} 配音生成失败。`);
              }
            },
          )
          .catch(() => undefined);
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [project.scenes, updateScene]);

  return (
    <section className="voice-studio">
      <aside className="voice-config stage-panel">
        <header>
          <div>
            <strong>配音来源</strong>
            <span>导入音频，或使用 Edge TTS、VoxCPM 生成</span>
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
              className="voice-action-button import-action"
              disabled={Boolean(busy)}
              onClick={() => fullAudioInput.current?.click()}
            >
              <b>＋</b>
              <span>
                {busy === 'full' ? '正在导入…' : audioAvailable ? '替换完整配音' : '导入完整配音'}
              </span>
            </button>
            <small>也可在中间每个段落内单独导入或替换配音。</small>
          </section>
          <section>
            <div className="experimental-title">
              <strong>Edge TTS 免费配音</strong>
              <span>无需显卡</span>
            </div>
            <p>使用微软 Edge 在线朗读音色，不需要 API Key；仅提供预设声音，不支持声音克隆。</p>
            <label>
              <span>中文音色</span>
              <select value={edgeVoice} onChange={(event) => setEdgeVoice(event.target.value)}>
                <option value="zh-CN-XiaoxiaoNeural">晓晓 · 女声 · 自然通用</option>
                <option value="zh-CN-XiaoyiNeural">晓伊 · 女声 · 活泼年轻</option>
                <option value="zh-CN-YunxiNeural">云希 · 男声 · 年轻自然</option>
                <option value="zh-CN-YunyangNeural">云扬 · 男声 · 新闻旁白</option>
              </select>
            </label>
            <label>
              <span>
                语速：{edgeRate > 0 ? '+' : ''}
                {edgeRate}%
              </span>
              <input
                type="range"
                min={-30}
                max={30}
                step={5}
                value={edgeRate}
                onChange={(event) => setEdgeRate(Number(event.target.value))}
              />
            </label>
            <label>
              <span>当前段落文案</span>
              <textarea rows={4} value={selectedScene?.narration ?? ''} readOnly />
            </label>
            <div className="voxcpm-actions">
              <button
                className="voice-action-button voxcpm-action"
                disabled={!selectedScene?.narration.trim() || Boolean(busy)}
                onClick={() => void generateEdgeTts()}
              >
                <b>▶</b>
                <span>
                  {busy === `edge-tts-${selectedScene?.id}` ? '正在生成…' : '生成当前段落'}
                </span>
              </button>
            </div>
            <div className="batch-voxcpm-actions">
              <button
                className="voice-action-button batch-voxcpm-action"
                disabled={!project.scenes.length || Boolean(busy)}
                onClick={() => void generateAllEdgeTts()}
              >
                <b>▶▶</b>
                <span>{busy === 'edge-tts-all' ? '正在逐段生成…' : '一键生成所有段落'}</span>
              </button>
            </div>
            <small>该功能依赖联网的 Edge 朗读服务，接口变化或网络限制可能导致暂时不可用。</small>
          </section>
          <section>
            <div className="experimental-title">
              <strong>VoxCPM 公共体验</strong>
              <span>实验性</span>
            </div>
            <p>使用参考音频克隆音色，并生成当前选中段落的配音。</p>
            <label>
              <span>参考声音</span>
              <select
                value={voicePreset}
                onChange={(event) => {
                  const value = event.target.value as 'tim' | 'custom';
                  setVoicePreset(value);
                  if (value === 'tim') {
                    setPromptText(
                      '你有没有发现香菜这东西爱的人爱的要死，恨的人恨得咬牙切齿，甚至有人给他起了个外号叫臭菜。',
                    );
                  } else {
                    setPromptText('');
                  }
                }}
              >
                <option value="tim">影视飓风-Tim</option>
                <option value="custom">上传自定义参考音频</option>
              </select>
            </label>
            <input
              ref={referenceAudioInput}
              hidden
              type="file"
              accept={AUDIO_ACCEPT}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setBusy('reference');
                void uploadAudio(file)
                  .then((audioPath) => {
                    setReferenceAudioPath(audioPath);
                    setReferenceAudioName(file.name);
                    setMessage('参考音频已准备，可以生成当前段落音频。');
                  })
                  .catch((error: unknown) =>
                    setMessage(error instanceof Error ? error.message : String(error)),
                  )
                  .finally(() => setBusy(null));
                event.target.value = '';
              }}
            />
            {voicePreset === 'custom' ? (
              <button
                className="voice-reference-picker"
                disabled={Boolean(busy)}
                onClick={() => referenceAudioInput.current?.click()}
              >
                <b>♪</b>
                <span>
                  <strong>{referenceAudioName || '上传参考音频'}</strong>
                  <small>
                    {referenceAudioName ? '点击可替换' : '建议使用清晰、无背景音乐的人声片段'}
                  </small>
                </span>
              </button>
            ) : (
              <div className="voice-preset-ready">
                <b>♪</b>
                <span>已内置参考音频 tim-001.mp3</span>
              </div>
            )}
            <label>
              <span>参考音频原文</span>
              <textarea
                rows={4}
                value={promptText}
                readOnly={voicePreset === 'tim'}
                placeholder="逐字填写参考音频中说出的内容"
                onChange={(event) => setPromptText(event.target.value)}
              />
            </label>
            <label>
              <span>当前段落文案</span>
              <textarea rows={5} value={selectedScene?.narration ?? ''} readOnly />
            </label>
            <label>
              <span>补充表达要求（可选）</span>
              <textarea
                rows={3}
                value={controlInstruction}
                placeholder="例如：语速稍快，语气轻松自然，重点句适当加强"
                onChange={(event) => setControlInstruction(event.target.value)}
              />
            </label>
            <div className="voxcpm-actions">
              <button
                className="voice-action-button voxcpm-action"
                disabled={
                  !selectedScene ||
                  (voicePreset === 'custom' && (!referenceAudioPath || !promptText.trim())) ||
                  ['queued', 'running'].includes(selectedVoiceTask?.status ?? '') ||
                  Boolean(busy)
                }
                onClick={() => void generateVoxCpm()}
              >
                <b>◆</b>
                <span>
                  {['queued', 'running'].includes(selectedVoiceTask?.status ?? '')
                    ? '音频生成中…'
                    : '生成音频'}
                </span>
              </button>
              {['queued', 'running'].includes(selectedVoiceTask?.status ?? '') ? (
                <button
                  className="voice-action-button stop-voxcpm-action"
                  disabled={Boolean(busy)}
                  onClick={() => void stopVoxCpm()}
                >
                  {busy === `stop-voxcpm-${selectedScene?.id}` ? '正在结束…' : '结束'}
                </button>
              ) : null}
            </div>
            <div className="batch-voxcpm-actions">
              <button
                className="voice-action-button batch-voxcpm-action"
                disabled={
                  Boolean(busy) ||
                  !project.scenes.length ||
                  runningVoiceCount === project.scenes.length ||
                  (voicePreset === 'custom' && (!referenceAudioPath || !promptText.trim()))
                }
                onClick={() => void generateAllVoxCpm()}
              >
                <b>◆◆</b>
                <span>
                  {busy === 'voxcpm-all'
                    ? '正在提交全部段落…'
                    : runningVoiceCount > 0
                      ? `继续生成其余段落（${runningVoiceCount} 个进行中）`
                      : '一键生成所有段落'}
                </span>
              </button>
              {runningVoiceCount > 0 ? (
                <button
                  className="voice-action-button stop-all-voxcpm-action"
                  disabled={Boolean(busy)}
                  onClick={() => void stopAllVoxCpm()}
                >
                  {busy === 'stop-voxcpm-all' ? '正在结束…' : '结束全部'}
                </button>
              ) : null}
            </div>
            <small>文本会发送到公开的 Hugging Face Demo，请勿提交敏感内容。</small>
          </section>
          {message ? <p className="voice-message">{message}</p> : null}
        </div>
      </aside>

      <main className="voice-editor stage-panel">
        <header>
          <div>
            <strong>旁白段落</strong>
            <span>
              {project.scenes.length} 段 · {Math.round(duration)} 秒
            </span>
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
              {scene.narrationAudio && !(scene.narrationAudioCandidates?.length ?? 0) ? (
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
                    取消选择
                  </button>
                </div>
              ) : (
                <div className="mini-wave">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              )}
              {(scene.narrationAudioCandidates?.length ?? 0) > 0 ? (
                <div
                  className="voice-candidate-select"
                  onClick={(event) => event.stopPropagation()}
                >
                  <select
                    aria-label={`${scene.caption}配音版本`}
                    value={scene.narrationAudio ?? ''}
                    onChange={(event) =>
                      updateScene(scene.id, {narrationAudio: event.target.value || null})
                    }
                  >
                    <option value="">未选择</option>
                    {scene.narrationAudioCandidates?.map((candidate, candidateIndex) => (
                      <option key={candidate.id} value={candidate.path}>
                        {candidate.source === 'voxcpm'
                          ? `第 ${
                              scene.narrationAudioCandidates
                                ?.slice(0, candidateIndex + 1)
                                .filter((item) => item.source === 'voxcpm').length
                            } 次生成 · ${new Date(candidate.createdAt).toLocaleString('zh-CN')}`
                          : candidate.source === 'edge-tts'
                            ? `Edge TTS · ${candidate.label.replace(/^Edge TTS · /u, '')} · ${new Date(candidate.createdAt).toLocaleString('zh-CN')}`
                            : `导入 · ${candidate.label}`}
                      </option>
                    ))}
                  </select>
                  {scene.narrationAudio ? (
                    <audio controls src={`/${projectId}/${scene.narrationAudio}`} />
                  ) : (
                    <span>选择后可试听</span>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </main>

      <aside className="voice-preview">
        <section className="stage-panel">
          <header>
            <strong>主配音模式</strong>
            <span>{Math.round(duration)} 秒</span>
          </header>
          <div className="narration-mode-switch">
            <button
              className={project.narrationMode === 'full' ? 'active' : ''}
              onClick={() => {
                if (!project.narrationAudio) {
                  setMessage('尚未导入完整配音，请先导入后再切换。');
                  return;
                }
                onGenerated({...project, narrationMode: 'full'});
                setMessage('已切换为完整音频模式。');
              }}
            >
              完整音频
            </button>
            <button
              className={
                (project.narrationMode ?? (project.narrationAudio ? 'full' : 'segments')) ===
                'segments'
                  ? 'active'
                  : ''
              }
              onClick={() => {
                onGenerated({...project, narrationMode: 'segments'});
                setMessage('已切换为分段音频模式。');
              }}
            >
              分段音频
            </button>
          </div>
          <button
            type="button"
            className="voice-action-button merge-voice-action"
            disabled={
              busy === 'merge' || !project.scenes.some((scene) => Boolean(scene.narrationAudio))
            }
            onClick={() => void mergeSceneAudio()}
          >
            <b>⇢</b>
            <span>{busy === 'merge' ? '正在合并…' : '合并分段音频'}</span>
          </button>
          {audioAvailable && project.narrationAudio ? (
            <>
              <audio controls src={`/${projectId}/${project.narrationAudio}`} />
              <div className="voice-full-actions">
                <button
                  className="directory-action-button"
                  onClick={() => void openAudioLocation()}
                >
                  打开所在目录
                </button>
                <button
                  className="text-action voice-remove-full"
                  onClick={() =>
                    onGenerated({
                      ...project,
                      narrationAudio: null,
                      narrationMode: 'segments',
                    })
                  }
                >
                  移除完整配音
                </button>
              </div>
            </>
          ) : (
            <div className="empty-audio">
              <b>◉</b>
              <p>导入完整配音后可在这里试听；分段音频在对应段落内试听。</p>
            </div>
          )}
        </section>
        <section className="stage-panel voice-check">
          <header>
            <strong>配音检查</strong>
          </header>
          <ul>
            <li>✓ 文案段落完整</li>
            <li>
              {project.scenes.filter((scene) => scene.narrationAudio).length} /{' '}
              {project.scenes.length} 段已有独立配音
            </li>
            <li>
              当前导出：
              {(project.narrationMode ?? (project.narrationAudio ? 'full' : 'segments')) ===
              'segments'
                ? '分段音频'
                : '完整音频'}
            </li>
            <li>{audioAvailable ? '✓ 完整配音已就绪' : '○ 可导入完整配音作为主音轨'}</li>
            <li>○ 建议试听并检查配音与镜头时长</li>
          </ul>
        </section>
      </aside>
    </section>
  );
};
