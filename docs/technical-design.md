# Cut Flow 技术文档

## 1. 架构目标

系统以结构化项目模型为单一事实来源，将内容生成、素材管理、时间计算和视频渲染解耦。MVP 采用浏览器预览加本地命令行渲染，稳定后再封装 Electron。

## 2. 技术栈

- 包管理与工作区：pnpm workspace
- 语言与界面：TypeScript、React
- 视频编排与渲染：Remotion
- 项目校验：Zod，并可导出 JSON Schema
- 媒体探测与预处理：FFmpeg/ffprobe
- 状态管理（P1 UI）：Zustand
- 样式（P1 UI）：Tailwind CSS
- 桌面端（P2）：Electron
- 测试：Vitest、React Testing Library（需要组件测试时）
- 规范：ESLint、Prettier、TypeScript strict mode

## 3. 职责边界

```text
AI Provider    生成脚本、分镜语义、素材提示词、旁白或转录
Core           校验项目、计算时序、规范化路径、生成渲染输入
Media          探测/转码/裁剪/音量标准化并管理素材与缓存
Remotion       按确定性规则绘制镜头、字幕、动效、转场和模板
App/Electron   文件操作、编辑交互、任务状态和用户提示
```

Remotion 负责视频“长什么样”，FFmpeg 负责媒体“如何转换”，AI 只负责内容语义，不能逐帧控制输出。

## 4. 逻辑架构

```text
project.json
    ↓ parse + Zod validate
NormalizedProject ──→ Asset Validator / Media Probe
    ↓                         ↓
Timeline Builder ←── duration metadata
    ↓
Composition Props
    ↓
Remotion Preview / Render
    ↓
MP4 (+ P2: PNG/SRT/TXT)
```

AI 接入后，其输出先经过 Provider、结构化解析、Schema 校验与修复，再合并进项目模型，不能直接进入渲染组件。

## 5. 核心数据模型

```ts
type ProjectFile = {
  version: 1;
  project: {
    title: string;
    platform?: 'douyin' | 'xiaohongshu' | 'wechat-channels' | 'bilibili';
    width: number;
    height: number;
    fps: number;
    durationTarget?: number;
  };
  style: {
    template: string;
    fontFamily: string;
    captionPosition: 'top' | 'center' | 'bottom';
    captionAnimation: 'none' | 'fade' | 'word-highlight';
    transition: 'none' | 'fade';
    backgroundMusicVolume?: number;
  };
  narrationAudio?: string | null;
  scenes: Scene[];
};

type Scene = {
  id: string;
  narration: string;
  caption: string;
  assetType: 'image' | 'video';
  assetPath: string;
  assetQuery?: string;
  duration: number;
  layout: 'full-screen' | 'center-card' | 'split-top-bottom';
  motion: 'none' | 'slow-zoom-in' | 'slow-zoom-out' | 'pan-left' | 'pan-right';
};
```

规范要求：

- 文件必须带 `version`，为未来迁移提供依据。
- 项目文件存相对项目目录的路径，运行时解析为规范化绝对路径。
- 时间对外使用秒，进入 Remotion 前统一转换成整数帧。
- `scene.id` 在项目内唯一；时长必须大于零。
- `assetType` 与实际组件严格对应，不通过扩展名猜测渲染组件。
- 后续词级字幕作为独立 `captions` 数据加入，避免破坏镜头模型。

## 6. 时间轴算法

1. 校验每个镜头时长。
2. 使用 `Math.round(duration * fps)` 生成镜头帧数。
3. 按镜头顺序计算 `from` 和 `durationInFrames`。
4. 转场时间不得超过相邻任一镜头时长；MVP 可使用固定上限。
5. 总帧数由镜头帧数与转场重叠规则唯一计算。
6. 音频存在时读取真实时长并报告与镜头总时长偏差；MVP 不隐式拉伸音频。

P1 的 TTS 对齐流程为：合并旁白 → TTS → 转录/时间戳 → 校准镜头 → 生成句级及词级字幕。

## 7. 渲染设计

- `Root`：注册 Composition 并加载已校验的输入。
- `VideoComposition`：构建全局序列、音频和模板上下文。
- `SceneSequence`：负责镜头帧区间和转场。
- `ImageScene` / `VideoScene`：分别加载图片与视频。
- `Layout`：实现三种布局，避免素材组件重复布局逻辑。
- `Motion`：将受支持的动效映射为确定性插值。
- `Caption`：处理安全区、描边、阴影和动画。
- `Template`：统一颜色、字体、字幕、背景和转场参数。

组件必须只依赖 props 和当前帧，不读取任意全局可变状态，以保证预览和离线渲染一致。

## 8. 媒体与路径处理

- 使用 `node:path` 解析路径，不手工拼接 `/` 或 `\\`。
- 项目文件路径相对于项目根目录；禁止通过 `..` 越出允许的项目目录。
- 渲染前检查必需素材是否存在、类型是否匹配。
- ffprobe 获取编码、分辨率、帧率、声道和时长。
- 不兼容素材先转为内部标准格式，再传给渲染器。
- 缺失旁白为可恢复警告；缺失镜头视觉素材为阻塞错误。

素材元数据至少包含 ID、类型、来源、路径、关键词、尺寸、授权、原始链接、创建时间和商用许可。

## 9. AI Provider 设计（P1/P2）

```ts
interface TextProvider {
  generateScript(input: ScriptInput): Promise<VideoScript>;
}
interface TTSProvider {
  synthesize(input: TTSInput): Promise<AudioResult>;
}
interface TranscriptionProvider {
  transcribe(file: string): Promise<TranscriptResult>;
}
interface ImageProvider {
  generate(prompt: string): Promise<GeneratedAsset>;
}
interface VideoProvider {
  generate(prompt: string): Promise<GeneratedAsset>;
}
```

Provider 统一处理超时、取消、重试、速率限制和错误映射。模型输出必须为严格 JSON，经 Zod 校验；允许有限次数的结构修复，但禁止把自由 Markdown 当作项目数据。

## 10. 缓存与幂等性

- 缓存键：步骤版本 + 输入内容 + 有效参数 + Provider/模型版本的稳定哈希。
- 缓存对象：脚本、TTS、转录、AI 素材、媒体预处理、最终渲染。
- 缓存写入使用临时文件完成后原子替换，避免中断留下伪成功文件。
- 项目修改只使受影响步骤失效；锁定镜头禁止被自动重生成覆盖。

## 11. 错误模型

错误至少包含 `code`、`message`、`path`、`sceneId`（适用时）、`recoverable` 和 `cause`。界面展示用户可执行的修复建议，日志保留底层原因。

主要错误类别：Schema、路径/权限、素材缺失、媒体不兼容、渲染失败、Provider 失败、导出失败和用户取消。

## 12. 安全与合规

- API 密钥仅存本地安全配置或环境变量，不写入项目和日志。
- Electron 阶段启用上下文隔离，通过白名单 IPC 暴露文件与渲染能力。
- 渲染命令不得直接拼接用户输入，FFmpeg 参数使用参数数组。
- 导入素材保留授权信息；网络素材和声音克隆默认不进入 MVP。
- 日志对密钥、令牌和可能的私人路径做脱敏。

## 13. 关键技术决策

| 决策         | 选择                  | 理由                                 |
| ------------ | --------------------- | ------------------------------------ |
| 首版形态     | 浏览器预览 + CLI 渲染 | 最快验证核心闭环，降低 Electron 干扰 |
| 编辑模型     | 镜头卡片              | 满足自动生产，避开多轨时间轴复杂度   |
| 单一事实来源 | 版本化 `project.json` | 易校验、重放、局部修改和自动化       |
| 视频渲染     | Remotion              | React 组件化、预览与程序化渲染统一   |
| 媒体处理     | FFmpeg/ffprobe        | 成熟、跨平台、覆盖探测与转码         |
| AI 接入      | 可替换 Provider       | 避免供应商绑定并便于测试             |

## 14. AI 素材与异步任务架构

```text
VisualShot
  ↓ GenerationRequest
ImageProvider / VideoProvider / ImageToVideoProvider / DigitalHumanProvider
  ↓ async job
GenerationCandidate[] → 用户选择 → selectedAsset
  ↓
Remotion + FFmpeg 最终剪辑
```

Provider 除文本、TTS 和转录外扩展为：

```ts
interface ImageProvider {
  generate(input: ImageGenerationInput): Promise<GenerationJob>;
}
interface VideoProvider {
  generate(input: VideoGenerationInput): Promise<GenerationJob>;
}
interface ImageToVideoProvider {
  generate(input: ImageToVideoInput): Promise<GenerationJob>;
}
interface DigitalHumanProvider {
  generate(input: DigitalHumanInput): Promise<GenerationJob>;
}
```

生成任务状态为 `queued | running | needs-selection | succeeded | failed | cancelled`。候选版本不可被重试覆盖；选择候选只更新镜头当前引用。任务和候选写入项目目录，API 密钥不进入项目。

参考视频分析流水线为：媒体探测 → 音频提取与转录 → 场景切分 → 关键帧抽取 → 视觉分类 → 字幕/包装分析 → 叙事结构分析 → 风格档案。风格档案只保存统计和抽象规则。
