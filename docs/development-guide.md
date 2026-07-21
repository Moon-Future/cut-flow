# Cut Flow 开发文档

## 1. 开发原则

- 先跑通端到端渲染，再接 AI、编辑界面和桌面封装。
- 每次开发一个可验证的垂直切片，不同时铺开全部模块。
- `project.json` 是输入契约，任何外部数据先校验再使用。
- AI 输出参数，渲染代码按确定性规则生成帧。
- 每项任务完成后运行类型检查、测试、lint、校验和至少一次相关渲染。

## 2. 建议目录

```text
cut-flow/
├─ apps/
│  ├─ studio/                 # 浏览器编辑与 Remotion 预览
│  └─ desktop/                # P2 Electron 壳
├─ packages/
│  ├─ core/                   # Schema、项目加载、时间轴、错误模型
│  ├─ renderer/               # Composition、镜头、字幕、模板、转场
│  ├─ media/                  # ffprobe、FFmpeg、素材与缓存
│  ├─ ai/                     # P1 Provider 接口及实现
│  └─ shared/                 # 跨包类型和工具
├─ projects/
│  └─ demo-project/
│     ├─ project.json
│     ├─ assets/
│     ├─ audio/
│     ├─ cache/
│     └─ exports/
├─ scripts/
│  ├─ validate-project.ts
│  └─ render-video.ts
├─ docs/
├─ package.json
└─ pnpm-workspace.yaml
```

目录可在首轮实现中小幅简化，但包边界必须保留，避免把 Schema、媒体 IO 和 React 渲染混入同一文件。

## 3. 基础命令契约

根目录至少提供：

```bash
pnpm dev        # 启动浏览器预览/Studio
pnpm preview    # 预览 demo-project
pnpm validate   # 校验项目 Schema 和素材
pnpm render     # 渲染 demo-project MP4
pnpm typecheck  # TypeScript 严格类型检查
pnpm lint       # ESLint
pnpm test       # 单元/组件测试
pnpm format     # Prettier 检查或格式化
```

脚本必须从仓库根目录运行，Windows 与 macOS 命令语义保持一致。需要参数时建议支持 `--project` 和 `--output`，并提供合理默认值。

## 4. 编码规范

- 开启 TypeScript `strict`，禁止未说明的 `any`。
- 对跨包公开函数标注输入和返回类型。
- 用可辨识联合类型表达布局、动效、转场和错误种类。
- React 组件按职责拆分；媒体 IO 不在组件渲染期间执行。
- 不手写平台路径分隔符；所有文件路径经统一工具解析和校验。
- 时间值命名带单位，例如 `durationSeconds`、`durationInFrames`。
- 所有枚举值在 Schema、类型和实现间保持单一来源。
- 错误不可静默吞掉；可降级场景产生结构化 warning。

## 5. 项目加载流程

1. 读取项目文件并解析 JSON。
2. 使用 Zod 校验字段、枚举、范围和唯一 ID。
3. 将相对路径解析到项目根目录，并检查目录越界。
4. 检查素材存在性及 `assetType` 一致性。
5. 使用 ffprobe 补充媒体元数据。
6. 生成不可变的 `NormalizedProject`。
7. 根据 fps 计算时间轴并传给 Composition。

CLI 错误必须包含 JSON 路径或镜头 ID，例如：

```text
ASSET_NOT_FOUND scenes[1].assetPath (scene-002): .../assets/missing.png
```

## 6. 新增功能的实现方式

### 6.1 新增布局或动效

先扩展 Schema 的枚举与类型，再添加独立实现、示例项目用例和帧边界测试。不得只修改渲染分支而遗漏校验层。

### 6.2 新增模板

模板只能配置颜色、字体、字幕、背景、转场和支持布局。业务内容和项目数据不能写死在模板组件中。

### 6.3 新增 AI Provider

先对接口建立伪实现和契约测试，再接真实服务。密钥从环境读取；输出经 Schema 校验；重试只针对可恢复错误。

### 6.4 新增导出格式

将平台预设与编码参数分离。渲染 Composition 后再由媒体层处理封装或派生文件，避免 UI 直接调用 FFmpeg。

## 7. 测试策略

### 7.1 单元测试

- Schema：合法项目、边界值、非法枚举、重复 ID。
- 路径：Windows/macOS 分隔符、相对路径、目录越界、缺失文件。
- 时间轴：秒转帧、镜头累计、转场重叠、总帧数。
- 动效：首帧、末帧和 clamp 行为。
- 缓存：相同输入命中、参数变化失效。

### 7.2 集成测试

- 加载 demo-project 后生成正确 Composition props。
- 图片和视频组件选择正确。
- 无旁白时返回 warning 并可继续。
- 渲染短尺寸、短时长 fixture，验证输出文件及 ffprobe 元数据。

### 7.3 端到端验收

- 在全新环境安装依赖。
- 运行全部质量命令。
- 预览示例项目。
- 实际导出一条 MP4 并用 ffprobe 验证分辨率、帧率、编码和音频。
- 人工检查字幕安全区、动效、转场、音画和结尾帧。

## 8. 完成定义（Definition of Done）

每个开发任务必须满足：

- 需求和边界已实现，无隐含范围扩张。
- 新增/修改逻辑有相应测试。
- 类型检查、测试、lint 通过。
- 涉及渲染的变更已实际渲染验证。
- 错误及降级行为可理解、可定位。
- README 或相关 docs 已同步。
- 未破坏 demo-project 和已有命令。

## 9. 本地配置约定

- `.env.example` 只列变量名和说明，不包含真实密钥。
- `.gitignore` 排除 `.env`、缓存、临时文件和大体积导出物。
- 小型、可自由分发的 fixture 可入库；真实用户素材不得入库。
- FFmpeg 可采用系统依赖或受控二进制包，但安装方式必须在 README 中明确，并在启动时检测。

## 10. Codex 单任务模板

```text
目标：实现一个明确模块或垂直切片。
范围：列出允许修改的包和功能。
不做：列出本轮排除项。
验收：给出可执行命令与可观察结果。

请先检查现有实现和文档，然后直接完成代码、测试和必要文档更新。
完成后运行 typecheck、test、lint；若涉及渲染，实际渲染 demo-project 并修复发现的问题。
不要破坏已有功能，不要只提供示例代码或教程。
```
