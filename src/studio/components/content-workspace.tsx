import type {ProjectFile, VideoType} from '../../core/schema';
import {useStudioStore} from '../store';
import {GenerationPanel} from './generation-panel';

type Props = {
  project: ProjectFile;
  onGenerated: (project: ProjectFile) => void;
  onAudioReady: () => void;
};

const platformLabels: Record<string, string> = {
  douyin: '抖音 / 快手',
  xiaohongshu: '小红书',
  'wechat-video': '视频号',
  bilibili: 'B站',
  youtube: 'YouTube',
  custom: '自定义',
};

export const ContentWorkspace = ({project, onGenerated, onAudioReady}: Props) => {
  const {
    updateContent,
    updateProjectSettings,
    updateStyle,
    updateScene,
    duplicateScene,
    deleteScene,
    restoreCopyVersion,
  } = useStudioStore();
  const totalChars = project.scenes.reduce((sum, scene) => sum + scene.narration.length, 0);
  const totalDuration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const hookScore = Math.min(100, 62 + Math.min(32, (project.content?.hook.length ?? 0) * 1.5));
  const clarityScore = Math.min(100, 72 + Math.min(20, project.scenes.length * 3));
  const rhythmScore = Math.min(100, 68 + Math.min(24, project.scenes.length * 4));
  const copyVersions = project.copyVersions ?? [];
  const currentVersionIndex = copyVersions.findIndex(
    (item) => item.id === project.activeCopyVersionId,
  );
  const currentVersion =
    currentVersionIndex >= 0 ? copyVersions[currentVersionIndex] : undefined;
  const providerNames: Record<string, string> = {
    mock: '本地演示',
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    doubao: '豆包',
  };

  return (
    <section className="content-studio">
      <aside className="copy-config stage-panel">
        <header>
          <div>
            <strong>文案配置信息</strong>
            <span>定义主题、受众和表达方式</span>
          </div>
        </header>
        <div className="stage-form">
          <label>
            <span>选题与内容方向</span>
            <input
              value={project.content?.topic ?? ''}
              onChange={(event) => updateContent({topic: event.target.value})}
              placeholder={`例如：用生活化例子解释“为什么天空是蓝色的”`}
            />
            <small className="field-help">
              告诉 AI 这条视频具体讲什么、从什么角度讲。留空时可直接使用项目标题。
            </small>
          </label>
          <label>
            <span>视频类型</span>
            <select
              value={project.content?.videoType ?? 'science-explainer'}
              onChange={(event) => updateContent({videoType: event.target.value as VideoType})}
            >
              <option value="science-explainer">科普讲解</option>
              <option value="knowledge-narration">知识口播</option>
              <option value="digital-human">数字人口播</option>
              <option value="product-showcase">产品展示</option>
              <option value="storytelling">故事叙事</option>
            </select>
          </label>
          <label>
            <span>目标观众</span>
            <input
              value={project.content?.audience ?? ''}
              onChange={(event) => updateContent({audience: event.target.value})}
              placeholder="例如：想用 AI 做短视频的新媒体从业者"
            />
          </label>
          <label>
            <span>视频目的</span>
            <select
              value={project.content?.purpose ?? '科普'}
              onChange={(event) => updateContent({purpose: event.target.value})}
            >
              <option>科普</option>
              <option>涨粉</option>
              <option>引发讨论</option>
              <option>产品推广</option>
              <option>课程引流</option>
              <option>建立个人品牌</option>
            </select>
          </label>
          <label>
            <span>发布平台</span>
            <select
              value={project.project.platform ?? 'douyin'}
              onChange={(event) =>
                updateProjectSettings({
                  platform: event.target.value as ProjectFile['project']['platform'],
                })
              }
            >
              {Object.entries(platformLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>叙事语气</span>
            <select
              value={project.style.tone ?? '自然清晰'}
              onChange={(event) => updateStyle({tone: event.target.value})}
            >
              <option>自然清晰</option>
              <option>轻松幽默</option>
              <option>专业严谨</option>
              <option>情绪故事感</option>
            </select>
          </label>
          <label>
            <span>核心观点</span>
            <textarea
              rows={5}
              value={project.content?.description ?? ''}
              onChange={(event) => updateContent({description: event.target.value})}
              placeholder="希望观众记住的核心结论"
            />
          </label>
          <label>
            <span>补充资料</span>
            <textarea
              rows={6}
              value={project.content?.sourceText ?? ''}
              onChange={(event) => updateContent({sourceText: event.target.value})}
              placeholder="可填写案例、产品信息、数据、经历或已有观点；没有可留空"
            />
          </label>
        </div>
        <div className="copy-generation">
          <header>
            <strong>AI 文案生成</strong>
            <span>确认左侧内容设定后，由你手动触发生成</span>
          </header>
          <GenerationPanel
            defaultOpen
            prominent
            generationContext={{
              topic: project.content?.topic?.trim() || project.project.title,
              videoType: project.content?.videoType ?? 'science-explainer',
              tone: project.style.tone ?? '自然清晰',
              audience: project.content?.audience?.trim() || '短视频平台的普通观众',
              purpose: project.content?.purpose ?? '科普',
              coreViewpoint:
                project.content?.description?.trim() ||
                `观众应理解并记住：${project.content?.topic || project.project.title}`,
              sourceMaterial: project.content?.sourceText?.trim() ?? '',
              platformLabel:
                platformLabels[project.project.platform ?? 'douyin'] ?? '自定义平台',
            }}
            onGenerated={onGenerated}
            onAudioReady={onAudioReady}
          />
        </div>
      </aside>

      <main className="copy-editor stage-panel">
        <header>
          <div>
            <strong>文案编辑器</strong>
            <span>
              {project.scenes.length} 个段落 · {totalChars} 字 · 约 {Math.round(totalDuration)} 秒
            </span>
          </div>
          {currentVersion ? (
            <span className="ai-copy-badge">
              AI 生成 · {providerNames[currentVersion.provider] ?? currentVersion.provider} · V
              {currentVersionIndex + 1}
            </span>
          ) : (
            <span className="manual-copy-badge">手动文案</span>
          )}
          <button onClick={() => duplicateScene(project.scenes.at(-1)!.id)}>＋ 添加段落</button>
        </header>
        {copyVersions.length ? (
          <div className="copy-version-bar">
            <div>
              <strong>AI 文案历史</strong>
              <small>共保留 {copyVersions.length} 个版本，切换后仍可继续编辑</small>
            </div>
            <select
              value={project.activeCopyVersionId ?? ''}
              onChange={(event) => restoreCopyVersion(event.target.value)}
            >
              {copyVersions
                .map((version, index) => ({version, index}))
                .reverse()
                .map(({version, index}) => (
                  <option value={version.id} key={version.id}>
                    V{index + 1} · {providerNames[version.provider] ?? version.provider} ·{' '}
                    {new Date(version.createdAt).toLocaleString('zh-CN')}
                  </option>
                ))}
            </select>
          </div>
        ) : null}
        <div className="copy-segments">
          {project.scenes.map((scene, index) => (
            <article key={scene.id}>
              <header>
                <b>
                  {scene.copyRole === 'digital-human'
                    ? `数字人口播 ${index + 1}`
                    : scene.copyRole === 'visual-explanation'
                      ? `画面讲解 ${index + 1}`
                      : index === 0
                        ? '开头 Hook'
                        : index === project.scenes.length - 1
                          ? '结尾 CTA'
                          : `正文 ${String(index).padStart(2, '0')}`}
                </b>
                <span>{scene.duration.toFixed(1)} 秒</span>
                <div>
                  <button onClick={() => duplicateScene(scene.id)}>复制</button>
                  <button
                    disabled={project.scenes.length <= 1}
                    onClick={() => deleteScene(scene.id)}
                  >
                    删除
                  </button>
                </div>
              </header>
              <input
                value={scene.caption}
                onChange={(event) => updateScene(scene.id, {caption: event.target.value})}
              />
              <textarea
                rows={index === 0 || index === project.scenes.length - 1 ? 4 : 7}
                value={scene.narration}
                onChange={(event) => updateScene(scene.id, {narration: event.target.value})}
              />
              <footer>
                <span>画面意图</span>
                <input
                  value={scene.visualIntent ?? ''}
                  onChange={(event) => updateScene(scene.id, {visualIntent: event.target.value})}
                />
                <small>{scene.narration.length} 字</small>
              </footer>
            </article>
          ))}
        </div>
      </main>

      <aside className="copy-analysis">
        <section className="stage-panel">
          <header>
            <strong>文案分析</strong>
            <span>实时估算</span>
          </header>
          <div className="analysis-summary">
            <div>
              <span>预计时长</span>
              <b>{Math.round(totalDuration)} 秒</b>
            </div>
            <div>
              <span>预计字数</span>
              <b>{totalChars} 字</b>
            </div>
          </div>
          <div className="score-grid">
            <i style={{'--score': `${hookScore * 3.6}deg`} as React.CSSProperties}>
              <b>{Math.round(hookScore)}</b>
              <span>开头吸引力</span>
            </i>
            <i style={{'--score': `${clarityScore * 3.6}deg`} as React.CSSProperties}>
              <b>{clarityScore}</b>
              <span>口语化程度</span>
            </i>
            <i style={{'--score': `${rhythmScore * 3.6}deg`} as React.CSSProperties}>
              <b>{rhythmScore}</b>
              <span>节奏评分</span>
            </i>
          </div>
          <ul>
            <li>✓ 包含明确开场 Hook</li>
            <li>✓ 段落结构清晰</li>
            <li>✓ 已配置画面意图</li>
          </ul>
        </section>
        <section className="stage-panel cover-preview">
          <header>
            <strong>视频封面预览</strong>
            <span>{project.project.width < project.project.height ? '9:16' : '16:9'}</span>
          </header>
          <div>
            <strong>{project.project.title}</strong>
            <small>{project.content?.hook || project.scenes[0]?.caption}</small>
          </div>
        </section>
        <section className="stage-panel outline-panel">
          <header>
            <strong>文案结构大纲</strong>
          </header>
          {project.scenes.map((scene, index) => (
            <button key={scene.id}>
              <b>{index + 1}</b>
              <span>{scene.caption}</span>
              <small>{scene.duration.toFixed(0)}s</small>
            </button>
          ))}
        </section>
      </aside>
    </section>
  );
};
