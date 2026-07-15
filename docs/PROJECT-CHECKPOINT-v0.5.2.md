# 桌面精灵项目检查点 v0.5.2

> 记录日期：2026-07-15
> 当前阶段：第一轮外观与交互优化结束，暂停继续打磨，保留可恢复开发状态。
> 当前正式平台：Apple Silicon macOS，未签名开发版。

## 1. 唯一开发主线

后续继续开发时，以以下目录为准：

```text
/Users/jun/Documents/Codex/2026-07-12/bang-2/designs/desktop-spirit-mvp
```

当前唯一正式发布包：

```text
/Users/jun/Documents/Codex/2026-07-12/bang-2/work/release/桌面精灵-v0.5.2.app
```

可恢复源码检查点：

```text
/Users/jun/Documents/Codex/2026-07-12/bang-2/work/checkpoints/desktop-spirit-v0.5.2-source-checkpoint.zip
```

压缩包不包含 `node_modules`、`dist` 和 `dist-app`，恢复后需要重新执行 `npm install`。对应校验值保存在同目录的 `CHECKSUMS-v0.5.2.txt`。

不要从这些历史目录继续开发：

- `work/electron_shell/`：早期 Electron 外壳实验。
- `outputs/desktop-spirit-*-v0.3.1*`：二维版本历史发布物。
- `work/3d/output/`：第一轮低质量单图 3D 实验。
- `work/3d/v2/output/body-seed42/`：比例压矮、细节丢失的失败白模。
- `assets/turn-frames-v4/`、`assets/action-frames-v4/`：二维转身与动作旧素材。
- `assets/wings/`：曾测试过的二维翅膀切换贴图，当前正式版未使用。

## 2. 当前版本基线

| 项目 | 当前值 |
| --- | --- |
| 应用版本 | `0.5.2` |
| 包名 | `com.codex.desktopspirit` |
| UI | React 19 + Vite 8 |
| 桌面外壳 | Electron 43 |
| 3D 渲染 | Three.js 0.180 |
| 发布架构 | macOS arm64 |
| 窗口尺寸 | 420 × 720 |
| 正式模型 | `assets/models/desktop-spirit-animated.glb` |
| 模型体积 | 约 23 MB |
| 网格 | 1 个 SkinnedMesh |
| 骨骼 | Mixamo Standard Skeleton，65 骨 |
| 三角面 | 139,972 |
| 材质/贴图 | 1 个 PBR 材质，3 张 2048² 贴图 |
| 正式包体积 | 约 355 MB |

关键完整性校验：

```text
GLB SHA-256
b06d1fc91be43dab488fcfe62271ec391d57ecb5575590015ebdc13482f03448

release app.asar SHA-256
f988ab6adf6dc83b88f735d7ea53bc2a4956146ce70f805f13e128935544adc8
```

正式模型与 3D 工作区基线文件内容一致：

```text
designs/desktop-spirit-mvp/assets/models/desktop-spirit-animated.glb
work/3d/v2/rigged/runtime/desktop-spirit-v052.glb
```

## 3. 当前已经实现的产品能力

### 桌面窗口

- 透明、无边框、无阴影、始终置顶的桌宠窗口。
- 左键拖动移动桌宠，允许继续拖入屏幕边缘。
- 点击与拖动有位移阈值，不会把拖动误判为点击。
- 多显示器位置恢复与越界回收。
- 单实例锁，避免同时启动多个版本。
- 全局快捷键：
  - `⌘⇧O`：显示/隐藏桌宠。
  - `⌘⇧E`：开启/关闭点击穿透。

### 3D 角色

- 使用真实 GLB 网格和骨骼，不再通过二维方向图片伪装旋转。
- 右键拖动或 `Shift + 左键拖动`控制 0–360° 朝向。
- 角色旋转由模型根节点负责，转身动画只提供脚步和重心变化，避免双重旋转。
- 眼睛和头部会根据鼠标位置进行轻微注视。
- 待机站姿混合了呼吸动作和挥手动作中更自然的躯干姿态，减少后仰。

### 动作

当前 GLB 内含 7 段动画：

| 动画名 | 来源/用途 | 时长 |
| --- | --- | ---: |
| `idle_breathing` | Mixamo Breathing Idle | 6.87 秒 |
| `wave` | Mixamo Waving | 1.30 秒 |
| `turn_left_90` | Mixamo Left Turn 90 | 1.33 秒 |
| `turn_right_90` | Mixamo Right Turn 90 | 1.33 秒 |
| `focus` | Mixamo Thinking | 6.03 秒 |
| `stretch_source` | Female Dance Pose 的单帧源姿态 | 0.03 秒 |
| `charge_source` | Female Laying Pose 的单帧源姿态 | 0.03 秒 |

运行时在 `src/Spirit3D.jsx` 中进一步生成：

- `idle_natural`：自然站姿。
- `stretch`：从待机进入伸展姿态再返回。
- `charge`：从待机进入倾斜充能姿态再返回。
- `focus` 的头部稳定版，避免马尾和头顶装饰偏移过大。

动作映射：

```text
wave   -> 挥手
focus  -> 专注
rest   -> 伸展
charge -> 充能
```

### 3D 晶翼

- 当前使用 Three.js 运行时程序化生成的第三版 3D 晶翼，不使用二维角度贴图。
- 左右各 3 片修长主翼，并保留 1 片向下弯曲的下翼。
- 晶翼厚度已经压薄，连续转身时不会突然切换贴图。
- 中央机甲和能量环已经缩小，减少遮挡背部。
- 下方弯翼已从髋部骨骼移到背部翼架，与主翼共用骨骼和根部连接脊。
- 当前关键比例位于 `src/Spirit3D.jsx` 的 `createEnergyAccessories()`：
  - `backPlate.scale = 0.62`
  - `core.scale = 0.70`
  - `bladeSpecs` 控制三片主翼长度、宽度和厚度。
  - `createHipCrescent()` 控制开放式下弯翼。

### 本地 Codex 对话

- 主进程优先寻找本机 Codex 可执行文件。
- 每次对话建立临时工作目录并启动独立 `codex exec` 会话。
- 会话使用只读、无审批策略，并通过提示词禁止读取项目文件或执行命令。
- 桌宠不读取也不保存 Codex 登录令牌。
- 返回值被限制为桌宠需要的 `text`、`mood`、`action`。
- 本地 Codex 不可用时回退到离线规则回复。

### Codex 进度提醒

- 插件源：`integrations/desktop-spirit-bridge/`。
- Hooks 监听任务开始、工具执行、权限等待和任务结束。
- 进度由脚本原子写入：

```text
~/.codex/desktop-spirit-progress.json
```

- Electron 主进程只读取任务标题、状态、简短信息、百分比和更新时间，不读取完整对话 transcript。

### 托盘与退出

- macOS Retina Template 托盘图标。
- 托盘菜单包含显示/隐藏、点击穿透、置顶、重置位置和退出。
- 设置面板内也有退出入口。
- MacBook 刘海遮挡托盘项目时，可在设置中点击“打开系统菜单”。

## 4. 代码结构

```text
desktop-spirit-mvp/
├── assets/
│   ├── models/                  # 正式 GLB 和 PBR 纹理
│   ├── trayTemplate*.png        # macOS 托盘模板图标
│   └── ...                      # 历史二维素材，当前不参与正式渲染
├── build/                       # 应用图标
├── docs/
│   ├── 3d-model-requirements.md
│   ├── PROJECT-CHECKPOINT-v0.5.2.md
│   └── SOP-Codex-3D-Desktop-Spirit.md
├── electron/
│   ├── main.cjs                 # 窗口、托盘、Codex、进度文件、IPC
│   ├── preload.cjs              # 白名单 IPC
│   └── window-state.cjs         # 设置与窗口位置持久化
├── integrations/
│   └── desktop-spirit-bridge/   # Codex Hooks 插件
├── src/
│   ├── App.jsx                  # UI、输入、拖动、动作和状态
│   ├── Spirit3D.jsx             # Three.js、GLB、动画、注视和晶翼
│   └── styles.css               # 桌宠 UI 样式
├── test/                        # 窗口恢复测试
└── package.json
```

3D 制作工作区：

```text
work/3d/v2/
├── input/                       # 四视图人体输入
├── output/                      # 3D 生成和减面阶段
├── rig-input/                   # Mixamo 上传包
├── rigged/
│   ├── base/                    # T-Pose 骨骼模型
│   ├── animations/source/       # Mixamo FBX 源动作
│   ├── animations/converted/    # 转换和去位移后的 GLB
│   └── runtime/                 # 合并后的运行模型
├── qa/                          # 八方向和动作抽帧截图
├── QA.md                        # 3D 阶段质量记录
└── *.mjs                        # 转换、合并、修复和检查脚本
```

## 5. 恢复开发的最短路径

### 第一次恢复

```bash
cd /Users/jun/Documents/Codex/2026-07-12/bang-2/designs/desktop-spirit-mvp
npm install
npm run check
```

### 网页快速预览

```bash
npm run dev:web
```

打开：

```text
http://127.0.0.1:4311/?rotation=0
```

可将 `rotation` 改为 `45`、`90`、`135`、`180`、`225`、`270`、`315` 检查各角度。

### Electron 本地运行

```bash
npm start
```

### 重新打包

```bash
npm run package:mac
```

输出：

```text
dist-app/mac-arm64/桌面精灵.app
```

正式发布时继续执行“只保留一个版本”的规则：

```bash
rm -rf /Users/jun/Documents/Codex/2026-07-12/bang-2/work/release/桌面精灵-v*.app
ditto \
  /Users/jun/Documents/Codex/2026-07-12/bang-2/designs/desktop-spirit-mvp/dist-app/mac-arm64/桌面精灵.app \
  /Users/jun/Documents/Codex/2026-07-12/bang-2/work/release/桌面精灵-v0.5.2.app
```

如果版本号有变化，必须同步修改 `package.json` 和 `package-lock.json`，并替换目标文件名。

## 6. 当前验证状态

最近一次验证：

- Electron 主进程、preload、窗口状态脚本语法检查通过。
- Node 测试 6/6 通过。
- Vite 正式构建通过。
- 0°、45°、180° 外观检查通过。
- 晶翼连续旋转检查通过。
- `work/release` 中只存在 `桌面精灵-v0.5.2.app`。

已知构建提示：

- Vite 会提示主 JavaScript chunk 大于 500 kB；这是性能优化项，不影响当前运行。
- 当前应用没有 Apple Developer ID 签名，首次启动可能需要 Finder 右键“打开”。

## 7. 当前仍有的限制

这些不是本轮阻断问题，但应作为下一阶段待办：

1. 面部没有完整表情系统，仅有头部/眼睛注视；尚无眨眼、口型和情绪 BlendShape。
2. 马尾没有独立物理骨链，快速动作中仍可能略显僵硬。
3. 晶翼是程序化附件，没有骨骼蒙皮；可以继续增加微摆、呼吸和能量脉冲。
4. 下弯翼虽然已经接入同一翼架，仍可继续雕琢根部机甲和晶片层次。
5. 语音开关还没有真实 TTS/ASR。
6. 本地 Codex 对话是独立临时会话，不等于直接操作当前 Codex 任务。
7. 进度百分比是 Hooks 事件驱动的估算，不是 Codex 内部真实进度。
8. 没有长期记忆、日程提醒、系统状态感知和自动更新。
9. 仅打包 Apple Silicon 开发版；没有 Intel/Windows 版本、签名和公证。
10. 当前项目目录没有 Git 仓库；继续重大开发前建议先初始化 Git 并提交本检查点。

## 8. 建议的下一阶段优先级

### P0：可维护性

- 初始化 Git，并提交 `v0.5.2-checkpoint` 标签。
- 把当前 3D 参数抽到独立配置文件，减少直接修改 `Spirit3D.jsx`。
- 给动作映射、GLB 动画清单和晶翼参数增加自动测试。

### P1：陪伴感

- 增加眨眼、视线平滑、轻微头部跟随和情绪表情。
- 给待机加入随机微动作，但设置冷却时间，避免打扰。
- 增加 TTS，并提供音量、语速和静音时段。

### P2：3D 表现

- 马尾骨链或弹簧物理。
- 晶翼根部重新建模，增加细小机械连接与材质层次。
- 对透明晶体做排序和性能优化。
- 将 139,972 面进一步优化到桌宠长期常驻更合适的预算。

### P3：AI 与任务系统

- Codex 回复流式显示。
- 任务开始/等待确认/完成使用不同动作和语音。
- 本地可控记忆、提醒、日历和专注计时器。
- 对进度文件增加过期检测和失败状态。

### P4：发布

- Developer ID 签名、Hardened Runtime、公证。
- 自动更新与崩溃日志。
- Intel macOS 与 Windows 构建验证。

## 9. 给下一次 Codex 任务的恢复提示词

复制下面这段作为新任务的第一条消息：

```text
继续开发桌面精灵项目。请先完整阅读：
1. designs/desktop-spirit-mvp/docs/PROJECT-CHECKPOINT-v0.5.2.md
2. designs/desktop-spirit-mvp/README.md
3. work/3d/v2/QA.md

唯一开发主线是 designs/desktop-spirit-mvp，当前正式版是 work/release/桌面精灵-v0.5.2.app。
先运行 npm run check，确认现有基线无回归。不要从 outputs、work/electron_shell 或二维帧资产恢复旧实现。
修改完成后检查 0°、45°、90°、180° 视角和所有动作；重新打包时删除旧 release 包，只保留一个最新版本。
```

## 10. 检查点结论

v0.5.2 已经从“图片会动的桌宠”升级成可连续旋转、有骨骼动作、能与本地 Codex 对话并接收 Codex 任务进度的 3D 桌面精灵。当前适合暂停视觉微调，把它作为下一阶段功能扩展的稳定起点。
