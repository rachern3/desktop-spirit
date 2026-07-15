# 桌面精灵 3D 模型基线与后续要求

项目已经在 v0.5.0 完成真 3D 升级，v0.5.2 的当前运行模型为带 Humanoid 骨骼、PBR 贴图和 7 段动画的 GLB。本文件保留未来替换或重制模型时必须满足的要求。

## 当前基线

- 文件：`assets/models/desktop-spirit-animated.glb`
- 格式：GLB
- 坐标：Y 轴向上
- 网格：1 个 SkinnedMesh
- 骨骼：Mixamo Standard Skeleton 65 骨
- 三角面：139,972
- 材质：1 个 PBR 材质
- 贴图：Base Color、Normal、Metallic-Roughness，2048²
- 动画：`idle_breathing`、`wave`、`turn_left_90`、`turn_right_90`、`focus`、`stretch_source`、`charge_source`

## 替换模型的必需内容

- 完整 Humanoid 骨骼：Hips、Spine、Chest、Neck、Head、双臂、双手、双腿。
- 双手手指骨骼，避免挥手时整条手臂僵硬。
- 模型原点与脚底对齐。
- 所有原地动作不得产生累计 Root/Hips 位移。
- 正、侧、背轮廓一致，无重复手脚或额外部件。
- PBR 材质与 UV 可在 Three.js 中正确读取。

## 建议增强

- 头发和马尾使用独立骨链或弹簧骨。
- 面部具备 Blink、Look、Happy、Relaxed 等 BlendShape。
- 翅膀、背甲和髋部透明能量件独立分件。
- 翅膀可挂到上脊柱骨骼，并保留微摆控制。
- 材质按身体、金属、头发、眼睛和透明晶体合理拆分，但避免过多 Draw Call。

## 建议性能预算

- 三角面：50,000–120,000 为下一轮优化目标；当前 139,972 可运行但仍有优化空间。
- 单张贴图：不超过 2048×2048。
- 透明层：尽量减少重叠，避免深度排序问题。
- 动作：Idle、Wave、Focus、Stretch、Charge，循环动作首尾连续。

## 接入验收

1. 0°、45°、90°、135°、180°、225°、270°、315° 八方向检查。
2. 检查手指、肩甲、髋甲、膝甲、头发和马尾。
3. 对每段动作检查开始、中间、结束和返回待机。
4. 使用脚本检查 Hips 平移和旋转的首尾误差。
5. 检查动作中人物不离开窗口、脚底不累计漂移。
6. 在 Electron 正式窗口中检查透明材质、帧率和内存。

详细制作历史见：

- `work/3d/v2/QA.md`
- `docs/PROJECT-CHECKPOINT-v0.5.2.md`
- `docs/SOP-Codex-3D-Desktop-Spirit.md`
