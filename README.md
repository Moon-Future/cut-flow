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

应用启动后先进入项目列表，可以创建、选择和切换视频项目。创建时可选择科普讲解、知识口播、数字人口播、产品展示或故事叙事。新项目只保存主题，不会自动生成内容；用户需要在内容页确认视频类型、主题、Provider 和目标时长后点击“生成文案与脚本”。生成完成后展示完整口播文案、脚本段落和视觉分镜，再进入剪辑与素材工作台。流程条可返回已完成步骤，内容页和剪辑页均提供明确的“上一步”按钮。剪辑页采用统一左侧操作栏，镜头列表、镜头设置、素材和导出入口不再分散在屏幕两侧。

视觉镜头卡片支持复用本地图片/视频候选，也支持使用 OpenAI Image API 生成 3 张竖屏图片草稿。AI 图片默认使用 `gpt-image-2`、`1024x1792` 和低质量模式，生成文件会保存到当前项目的 `assets/generated` 并登记到素材库。选中图片后可创建 Sora 图生视频任务；任务在后台排队并轮询，完成的 MP4 进入视频候选，选中后自动回填当前镜头和场景。可通过 `OPENAI_IMAGE_MODEL`、`OPENAI_IMAGE_QUALITY` 和 `OPENAI_VIDEO_MODEL` 调整模型配置。

点击顶部“素材库”可以搜索和筛选本地图片或视频，查看来源、授权方式及商用许可，并应用到当前镜头。新导入素材会写入 `projects/demo-project/assets.json`；脚本生成时会根据 `visualPrompt` 和素材关键词自动选择可商用素材。

默认项目为 `projects/demo-project/project.json`，默认输出为 `out/demo.mp4`。示例故意不包含旁白文件，用于验证静音降级；把 WAV 音频放到 `projects/demo-project/audio/narration.wav` 即可启用。

自定义路径：

```bash
pnpm validate -- --project projects/my-project/project.json
pnpm render -- --project projects/my-project/project.json --output out/my-video.mp4
```

## Windows 桌面版

开发模式启动桌面工作台：

```bash
pnpm desktop:dev
```

剪辑工作台采用单一左侧流程导航，并将分镜列表、当前镜头素材、竖屏预览、
属性面板和视频/字幕/配音/音乐时间线放在同一页面。素材支持预览替换、
替换当前镜头、插入为新镜头和历史版本回退；替换画面不会改动字幕、
配音和镜头时长。

项目创建、项目概览、视频文案、脚本与分镜、配音、素材、剪辑和导出共用
同一个固定侧栏应用框架。切换阶段只更新右侧工作区，不再跳转到旧的独立页面。

生成 Windows 安装包：

```bash
pnpm desktop:pack
```

安装包输出到 `release/Cut-Flow-0.1.0-Setup.exe`。桌面版首次启动会把示例项目复制到 `%APPDATA%/cut-flow/workspace`，后续编辑不会修改安装目录；启动日志位于 `%APPDATA%/cut-flow/logs/desktop.log`，渲染日志位于 `%APPDATA%/cut-flow/workspace/logs/render.log`。卸载应用不会自动删除工作区，确认不再需要项目后可手动删除该目录。

## 项目结构

- `src/core`：Schema、项目加载、路径校验和时间轴。
- `src/remotion`：Composition、镜头、媒体、字幕、动效和转场。
- `scripts`：校验和渲染 CLI。
- `projects/demo-project`：三镜头示例项目。
- `docs`：需求、技术、开发和实施计划。

## 当前能力与限制

已实现镜头卡片编辑器、拖拽排序、锁定、素材上传、授权元数据、本地素材库、关键词匹配、自动保存、Remotion Player 实时预览、导出进度与视频下载；生成层支持可替换的文本/TTS/转录 Provider、本地 Mock、OpenAI 脚本与图片适配器、脚本缓存、旁白生成、词级时间对齐和图片候选版本；渲染层支持参数化 `game-dev-log` 模板、三种布局、五种图片动效、逐词高亮字幕、字幕安全区、无转场/淡入淡出、图片/视频组件、静音降级和 H.264 MP4 导出；桌面层支持 Electron 单实例、安全上下文、独立工作区、运行日志和 Windows NSIS 安装包。当前尚未实现真实 AI 视频生成、自动更新和 macOS 安装包。
