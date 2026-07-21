# Cut Flow

Cut Flow 是一个本地优先的开发者自媒体短视频生产工作流。当前 MVP 读取结构化项目文件，将本地图片/视频、字幕、基础动效、转场和可选旁白合成为竖屏 MP4。

## 环境

- Node.js 22+
- pnpm 9+
- 首次渲染时需联网下载 Remotion 的浏览器运行时
- 系统 FFmpeg/ffprobe 为后续媒体探测所需；当前 Remotion 导出不要求预先全局安装 FFmpeg

## 开始使用

```bash
pnpm install
pnpm validate
pnpm dev
pnpm render
```

打开 `http://127.0.0.1:4173` 进入本地工作台。可以选择和拖拽镜头，修改字幕、旁白、时长、布局及动效，锁定镜头，上传本地素材，实时预览并直接导出 MP4。修改会通过 Schema 校验后自动保存。

展开左侧“生成视频脚本”可以从主题生成脚本、三段分镜、旁白 WAV 和词级字幕。默认使用本地 Mock Provider，不需要密钥；它生成静音占位配音以验证完整流程。使用 OpenAI Provider 前，在启动进程中设置 `OPENAI_API_KEY`，可按 `.env.example` 覆盖文本、TTS 和转录模型。

默认项目为 `projects/demo-project/project.json`，默认输出为 `out/demo.mp4`。示例故意不包含旁白文件，用于验证静音降级；把 WAV 音频放到 `projects/demo-project/audio/narration.wav` 即可启用。

自定义路径：

```bash
pnpm validate -- --project projects/my-project/project.json
pnpm render -- --project projects/my-project/project.json --output out/my-video.mp4
```

## 项目结构

- `src/core`：Schema、项目加载、路径校验和时间轴。
- `src/remotion`：Composition、镜头、媒体、字幕、动效和转场。
- `scripts`：校验和渲染 CLI。
- `projects/demo-project`：三镜头示例项目。
- `docs`：需求、技术、开发和实施计划。

## 当前能力与限制

已实现镜头卡片编辑器、拖拽排序、锁定、素材上传、自动保存、Remotion Player 实时预览、导出进度与视频下载；生成层支持可替换的文本/TTS/转录 Provider、本地 Mock、OpenAI 适配器、脚本缓存、旁白生成和词级时间对齐；渲染层支持三种布局、五种图片动效、逐词高亮字幕、字幕安全区、无转场/淡入淡出、图片/视频组件、静音降级和 H.264 MP4 导出。当前尚未实现完整素材库、AI 图片/视频生成和 Electron。
