# 3D 桌面精灵

基于 React、Three.js 和 Electron 的 macOS 3D 桌面陪伴精灵。当前正式版本为 `v0.5.2`，优先支持 Apple Silicon Mac。

## 当前能力

- 透明、无边框、始终置顶的桌面窗口。
- 左键拖动移动；允许继续拖入屏幕边缘。
- 右键拖动或 `Shift + 左键拖动`控制 0–360° 角色朝向。
- Mixamo 65 骨骼 GLB，含呼吸待机、挥手、专注、伸展、充能和左右转身。
- Three.js 运行时 3D 晶翼，连续转身不切换二维贴图。
- 点击互动、输入框和结构化离线回复。
- 本地 Codex 对话：临时、只读的独立 `codex exec` 会话。
- Codex 生命周期进度：Hooks 提醒任务开始、等待确认和完成。
- macOS Retina Template 托盘图标与托盘菜单。
- 显示/隐藏、点击穿透、置顶、重置位置和退出。
- 全局快捷键、单实例锁、多显示器位置回收和设置持久化。
- `contextIsolation`、sandbox 和白名单 IPC。

## 生成可运行版本

仓库不提交 `.app` 打包产物。执行 `npm run package:mac` 后，可在下面的位置找到应用：

```text
dist-app/mac-arm64/桌面精灵.app
```

当前开发包未使用 Apple Developer ID 签名。如果 macOS 阻止首次启动，请在 Finder 中右键应用并选择“打开”。

## 操作

- 左键拖动：移动桌面精灵。
- 右键拖动：连续转身。
- `Shift + 左键拖动`：触控板备用转身方式。
- 点击角色：陪伴互动。
- `⌘⇧E`：开启/关闭鼠标点击穿透。
- `⌘⇧O`：显示/隐藏桌面精灵。

## 源码运行

```bash
git clone git@github.com:rachern3/desktop-spirit.git
cd desktop-spirit
npm install
npm run check
npm start
```

网页预览：

```bash
npm run dev:web
```

打开 `http://127.0.0.1:4311/`。

构建 Apple Silicon `.app`：

```bash
npm run package:mac
```

## 主要结构

```text
assets/models/                         正式 GLB 与 PBR 贴图
electron/main.cjs                      窗口、托盘、Codex、进度和 IPC
electron/preload.cjs                   安全白名单 IPC
electron/window-state.cjs              设置与窗口状态
src/App.jsx                            UI、拖动、旋转和动作交互
src/Spirit3D.jsx                       Three.js、动画、注视和晶翼
src/styles.css                         视觉样式
integrations/desktop-spirit-bridge/    Codex Hooks 插件
test/                                  窗口状态测试
docs/                                  检查点、SOP 和 3D 要求
```

## 本地 Codex

桌宠优先寻找本机已登录的 Codex CLI。对话会启动临时、只读、无审批的独立会话，并限制它不读取项目文件、不执行命令。桌宠不会读取或保存登录令牌。本地 Codex 不可用时自动回退到离线规则回复。

Codex 进度桥插件将最小任务状态原子写入：

```text
~/.codex/desktop-spirit-progress.json
```

桌宠不会读取完整任务 transcript。安装或更新 Hook 后，请在新的 Codex 任务中检查并信任桌面精灵进度桥。

## 文档

- [当前开发检查点](docs/PROJECT-CHECKPOINT-v0.5.2.md)
- [小白实操版：如何用 Codex 从 0 做出 3D 桌面精灵](docs/SOP-Codex-3D-Desktop-Spirit.md)
- [3D 模型接入要求](docs/3d-model-requirements.md)

## 当前限制

- 尚无完整表情 BlendShape、眨眼和口型。
- 马尾还没有独立物理骨链。
- 语音开关尚未接入真实 TTS/ASR。
- Codex 进度百分比是 Hooks 事件估算。
- 当前仅提供 arm64 未签名开发包；公开分发仍需签名和公证。

后续继续开发前，请先阅读检查点并运行 `npm run check`。
