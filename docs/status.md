# LWB UI Editor — 项目状态文档

> **本文档是 Dev Agent 和 QA Agent 协作的唯一状态源。**
> 两个 Agent 在每个任务的生命周期中更新本文档，确保端到端可追溯。

> 版本: v1.4
> 创建日期: 2026-04-15
> 配套文档: [requirements.md](requirements.md) v0.9 · [tasks.md](tasks.md) v1.3

## 0. 当前阶段说明（v1.1 新增）

- **M0 进度**：**T0.1–T0.7 均已交付**：应用侧 T0.1–T0.3、T0.6、T0.7 为 `passed`；引擎 POC **T0.4、T0.5** 为 `dev_done`（**QA 测试暂缓**，见第 0 节）。M0 里程碑可视为 **已收口（交付维度）**。
- **QA Agent 当前不进入 `testing` 状态**，避免把"未实现"误判为"实现错误"。QA 在本阶段做：
  1. 测试方案与文档审查（已产出本轮歧义清单）
  2. 准备 fixture（示例 YAML、压测脚本）与基线快照
  3. 风险与依赖追踪（见第 6 节）
- **Unity / Unreal 导出链路 QA 验收暂缓**（涉及 T0.4、T0.5、T3.1–T3.3、T4.1、T4.2）。这些任务可正常进入 `dev_done`，但停留在 `dev_done` 直到人工解锁。原因：当前优先验证应用主链路（M0–M2），引擎工程的搭建与试运行成本另行排期。
- 本阶段结束的判定：**T0.1 进入 `dev_done`** —— 之后 QA 才正式进入用例执行流程（**已满足**）。

---

## 1. 使用规则

### 1.1 状态流转

每个任务的状态严格按以下流程流转：

```
pending → in_progress → dev_done → testing → passed ──→ accepted
                │            │         │
                │            │         └─→ failed → in_progress（退回修复，retry +1）
                │            └─→ blocked（等待外部依赖）
                └─→ blocked
```

| 状态 | 含义 | 更新方 |
|------|------|--------|
| `pending` | 尚未开始 | — |
| `blocked` | 被前置任务或外部因素阻塞，`blocked_by` 字段记录原因 | Dev |
| `in_progress` | Dev 正在开发中 | Dev |
| `dev_done` | Dev 自测通过，已提交 commit，等待 QA | Dev |
| `testing` | QA 正在验证中 | QA |
| `passed` | QA 验证全部测试用例通过 | QA |
| `failed` | QA 验证发现问题，退回 Dev | QA |
| `accepted` | 最终验收完成 | QA |

### 1.2 Dev Agent 职责

1. 开始任务前检查所有前置依赖是否已 `accepted`（或至少 `passed`）。**例外**：若某前置任务在 [tasks.md](tasks.md)「测试范围说明」中标注为 **QA 测试暂缓**，则该任务达到 `dev_done` 即视为满足依赖（**`dev_done` 等同 `passed`**，用于解锁后续任务）；不要求其进入 `testing`/`passed`
2. 开发过程中将状态设为 `in_progress`，填写 `started_at` 时间
3. 自测通过后：
   - 提交 git commit，message 格式：`[T{id}] {任务标题}`
   - 填写 `commit` 字段
   - 状态设为 `dev_done`，填写 `dev_done_at`
4. 被退回时：`retry` +1，状态回到 `in_progress`，在 `notes` 中记录修复内容
5. **同一时间只能有 1 个 `in_progress` 任务**（POC 可例外并行）

### 1.3 QA Agent 职责

1. 监听 `dev_done` 状态的任务（**且任务不在"测试暂缓"清单中** — 见第 0 节）
2. 进入前置检查：依赖任务全部 `passed/accepted`；若依赖项为 **QA 测试暂缓** 任务，则 `dev_done` 即可。否则不进入 `testing`
3. 状态设为 `testing`
4. 按 tasks.md 中的测试用例逐条执行验证
5. 产出报告 `qa-reports/T{id}.md`，格式见附录 A
6. 全部 Pass → 状态设为 `passed`，填写 `tested_at`
7. 任何 Fail → 状态设为 `failed`，`fail_reason` 记录概要
8. **Fail 超过 2 次**（retry ≥ 2）→ 在 `notes` 中标记 `ESCALATE`，等待人工介入

**QA 不主动测试的情形（不视为缺陷，记入备注）**：
- 任务状态为 `pending`（Dev 尚未交付）
- 任务在"测试暂缓"清单（Unity/Unreal 导出链路）
- 任务依赖未全部满足：`passed`/`accepted`，或对暂缓任务为 `dev_done`（见 1.2 条 1 之例外）

### 1.4 更新频率

- Dev/QA 每次状态变更时**立即更新本文档**
- 人工 review 时可通过 git log 追溯变更历史

---

## 2. 里程碑总览

| 里程碑 | 状态 | 任务总数 | 完成数 | 进度 |
|--------|------|---------|--------|------|
| M0 — 工程搭建与 POC | `completed` | 7 | 7 | 100% |
| M1 — 基础编辑器 | `in_progress` | 14 | 14 | 100% |
| M2 — 完整控件 & 资源 & 编辑操作 | `pending` | 12 | 0 | 0% |
| M3 — Unity 导出 | `pending` | 3 | 0 | 0% |
| M4 — Unreal 导出 | `pending` | 2 | 0 | 0% |
| M5 — 打磨 | `pending` | 3 | 0 | 0% |
| **总计** | | **41** | **21** | 51% |

---

## 3. 关键决策记录

关键技术决策在此处记录，一旦决定后续任务以此为准。

| # | 决策项 | 状态 | 结论 | 决策日期 | 关联任务 |
|---|--------|------|------|---------|---------|
| D1 | Unreal 导出方案（A:Python / B:C++ / C:JSON+插件） | `已定` | **主路径 A（Python）+ 兜底 C（JSON+插件）**；见 `docs/poc-reports/T0.5-unreal-python.md` | 2026-04-16 | T0.5 → T4.1 |
| D2 | 文件监听方案（plugin-fs watch / 社区插件） | `已定` | 采用 **tauri-plugin-fs**（`watch` feature）+ 前端 `watch`/`watchImmediate`；见 `docs/poc-reports/T0.3-file-watch.md` | 2026-04-15 | T0.3 |
| D3 | 画布渲染引擎（Konva.js / 替代方案） | `已定` | 采用 **Konva.js**；依据 `docs/poc-reports/T0.6-konva-perf.md` | 2026-04-16 | T0.6 |

> **D1 是整个项目最大风险点。** T0.5 的 POC 结论直接决定 M4 的工作量（可能翻倍）。
> 必须在 M3 启动前完成 T0.5 并填写此决策。

---

## 4. 任务状态明细

### M0 — 工程搭建与 POC

| ID | 任务标题 | 依赖 | 状态 | retry | commit | 报告 | 备注 |
|----|---------|------|------|-------|--------|------|------|
| T0.1 | Tauri 2 + Vue 3 + TS 项目初始化 | — | `passed` | 0 | e178c33 | [qa-reports/T0.1.md](../qa-reports/T0.1.md) | |
| T0.2 | 文件系统 & 对话框 & 窗口关闭拦截验证 | T0.1 | `passed` | 0 | e178c33 | [qa-reports/T0.2.md](../qa-reports/T0.2.md) | |
| T0.3 | 文件监听方案验证 | T0.2 | `passed` | 0 | e178c33 | [qa-reports/T0.3.md](../qa-reports/T0.3.md) | D2 已更新 |
| T0.4 | Unity C# Editor 脚本 POC | — | `dev_done` | 0 | 115d73d | | 独立引擎工程；**QA 测试暂缓**（见第 0 节） |
| T0.5 | Unreal Python 脚本 POC ⚠️ | — | `dev_done` | 0 | 115d73d | | D1 已更新；**QA 测试暂缓** |
| T0.6 | Konva.js 画布性能 POC | T0.1 | `passed` | 0 | 06ffd32 | [qa-reports/T0.6.md](../qa-reports/T0.6.md) | D3 已更新 |
| T0.7 | 中文 IME 输入验证 | T0.1 | `passed` | 0 | 5369499 | [qa-reports/T0.7.md](../qa-reports/T0.7.md) | |

### M1 — 基础编辑器

| ID | 任务标题 | 依赖 | 状态 | retry | commit | 报告 | 备注 |
|----|---------|------|------|-------|--------|------|------|
| T1.1 | YAML Schema 类型定义 | T0.1 | `passed` | 0 | c9704e8 | [qa-reports/T1.1.md](../qa-reports/T1.1.md) | |
| T1.2 | YAML 读写与校验 | T1.1, T0.2 | `passed` | 0 | a10a094 | [qa-reports/T1.2.md](../qa-reports/T1.2.md) | |
| T1.3 | Schema 版本升级框架 | T1.2 | `passed` | 0 | afcd967 | [qa-reports/T1.3.md](../qa-reports/T1.3.md) | |
| T1.4 | 命令模式撤销重做框架 | T1.1 | `passed` | 0 | 90c88e3 | [qa-reports/T1.4.md](../qa-reports/T1.4.md) | |
| T1.5 | 主窗口四面板布局 | T0.1 | `passed` | 0 | 6bc6aee | [qa-reports/T1.5.md](../qa-reports/T1.5.md) | |
| T1.6 | 新建/打开/保存项目 | T1.2, T1.5 | `passed` | 0 | 3aa6c17 | [qa-reports/T1.6.md](../qa-reports/T1.6.md) | |
| T1.7 | 画布基础渲染（Konva 集成） | T1.5, T1.6 | `passed` | 0 | c60d1fc | [qa-reports/T1.7.md](../qa-reports/T1.7.md) | |
| T1.8 | 画布缩放与平移 | T1.7 | `dev_done` | 0 | 1b1380a | [qa-reports/T1.8.md](../qa-reports/T1.8.md) | |
| T1.9 | 单选与多选 | T1.7 | `dev_done` | 0 | dda6a01 | [qa-reports/T1.9.md](../qa-reports/T1.9.md) | `SelectionStore` + schema 命中；Properties 待 T1.11 |
| T1.10 | 节点树面板（基础） | T1.9 | `dev_done` | 0 | 629f9b9 | [qa-reports/T1.10.md](../qa-reports/T1.10.md) | `NodeTree.vue`；锁定仅会话 |
| T1.11 | Properties 面板（基础属性） | T1.9, T1.4 | `dev_done` | 0 | f1ae784 | [qa-reports/T1.11.md](../qa-reports/T1.11.md) | `Properties.vue`；Ctrl+Z/Y；打开/新建清空历史 |
| T1.12 | 拖拽移动节点 | T1.9, T1.4 | `dev_done` | 0 | 945338e | [qa-reports/T1.12.md](../qa-reports/T1.12.md) | `renderer` 画布拖拽 + 方向键；单击已选不拆多选 |
| T1.13 | 画布鼠标指针状态 | T1.12 | `dev_done` | 0 | 4b3bc3f | [qa-reports/T1.13.md](../qa-reports/T1.13.md) | 悬停/手柄/拖拽/空格；`selectionOverlay` 命中 |
| T1.14 | 颜色选择器与 assetId 选择器 | T1.11 | `dev_done` | 0 | de94dc7 | [qa-reports/T1.14.md](../qa-reports/T1.14.md) | `ColorPicker` / `AssetPicker`；`assetPath` |

### M2 — 完整控件 & 资源 & 编辑操作

| ID | 任务标题 | 依赖 | 状态 | retry | commit | 报告 | 备注 |
|----|---------|------|------|-------|--------|------|------|
| T2.1 | Toolbar 控件添加按钮 | T1.11 | `pending` | 0 | | | |
| T2.2 | 右键菜单（画布 + 节点树） | T2.1, T1.10 | `pending` | 0 | | | |
| T2.3 | 复制粘贴删除 | T2.1, T1.4 | `pending` | 0 | | | |
| T2.4 | 层级调整 | T2.2, T1.4 | `pending` | 0 | | | |
| T2.5 | Resize 缩放 | T1.9, T1.4 | `pending` | 0 | | | |
| T2.6 | 对齐参考线与吸附 | T1.12 | `pending` | 0 | | | |
| T2.7 | 资源管理面板 | T1.6, T1.11 | `pending` | 0 | | | |
| T2.8 | 拖拽资源到画布创建 Image | T2.7 | `pending` | 0 | | | |
| T2.9 | Text 双击内联编辑 | T1.11, T0.7 | `pending` | 0 | | | |
| T2.10 | 节点树搜索与拖拽 | T1.10 | `pending` | 0 | | | |
| T2.11 | 文件监听冲突处理 | T0.3, T1.6 | `pending` | 0 | | | |
| T2.12 | 错误/异常处理与校验反馈 | T1.2, T1.11 | `pending` | 0 | | | |

### M3 — Unity 导出

| ID | 任务标题 | 依赖 | 状态 | retry | commit | 报告 | 备注 |
|----|---------|------|------|-------|--------|------|------|
| T3.1 | Unity C# 代码生成器 | T1.1, T1.2, T2.7, T0.4 | `pending` | 0 | | | **QA 测试暂缓** |
| T3.2 | 导出设置对话框 | T3.1 | `pending` | 0 | | | **QA 测试暂缓** |
| T3.3 | Unity 导出端到端回归 | T3.2 | `pending` | 0 | | | **QA 测试暂缓** |

### M4 — Unreal 导出

| ID | 任务标题 | 依赖 | 状态 | retry | commit | 报告 | 备注 |
|----|---------|------|------|-------|--------|------|------|
| T4.1 | Unreal 代码生成器（方案取决于 D1） | T0.5 | `pending` | 0 | | | 方案由 D1 决定；**QA 测试暂缓** |
| T4.2 | Unreal 导出端到端回归 | T4.1 | `pending` | 0 | | | **QA 测试暂缓** |

### M5 — 打磨

| ID | 任务标题 | 依赖 | 状态 | retry | commit | 报告 | 备注 |
|----|---------|------|------|-------|--------|------|------|
| T5.1 | 设置对话框 + 快捷键统一实现 | M2 | `pending` | 0 | | | |
| T5.2 | 性能回归 | M2 | `pending` | 0 | | | |
| T5.3 | 打包与分发 | M4 | `pending` | 0 | | | |

---

## 5. 推荐执行顺序与并行策略

### 5.1 Dev Agent 推荐执行顺序

以下是考虑了依赖关系和关键路径后的推荐执行序列。带 `‖` 标记的任务可与前一批并行。

```
── 批次 1（项目启动）──────────────────────────────
  T0.1  Tauri 脚手架初始化
  T0.4  Unity POC（独立工程，与 T0.1 并行）‖
  T0.5  Unreal POC（独立工程，与 T0.1 并行）‖

── 批次 2（基础能力验证）──────────────────────────
  T0.2  文件系统 & 窗口关闭拦截
  T0.6  Konva 性能 POC ‖
  T0.7  中文 IME POC ‖

── 批次 3（文件监听）──────────────────────────────
  T0.3  文件监听方案验证

── 批次 4（M1 核心数据层）────────────────────────
  T1.1  Schema 类型定义
  T1.5  主窗口布局 ‖

── 批次 5（M1 数据+布局完成后）───────────────────
  T1.2  YAML 读写与校验
  T1.4  撤销重做框架 ‖

── 批次 6 ─────────────────────────────────────
  T1.3  Schema 版本升级框架
  T1.6  新建/打开/保存项目

── 批次 7 ─────────────────────────────────────
  T1.7  画布基础渲染

── 批次 8 ─────────────────────────────────────
  T1.8  画布缩放与平移
  T1.9  单选与多选 ‖

── 批次 9 ─────────────────────────────────────
  T1.10 节点树面板
  T1.11 Properties 面板 ‖
  T1.12 拖拽移动节点 ‖

── 批次 10 ────────────────────────────────────
  T1.13 画布鼠标指针
  T1.14 颜色选择器与 assetId 选择器 ‖

── 批次 11（M2 开始）─────────────────────────────
  T2.1  Toolbar 控件添加
  T2.5  Resize 缩放 ‖
  T2.7  资源管理面板 ‖

── 批次 12 ────────────────────────────────────
  T2.2  右键菜单（画布 + 节点树）
  T2.3  复制粘贴删除 ‖
  T2.6  对齐参考线 ‖
  T2.8  拖拽资源到画布 ‖
  T2.9  Text 内联编辑 ‖
  T2.10 节点树搜索与拖拽 ‖

── 批次 13 ────────────────────────────────────
  T2.4  层级调整
  T2.11 文件监听冲突处理 ‖
  T2.12 错误/异常处理 ‖

── 批次 14（M3）──────────────────────────────────
  T3.1  Unity C# 代码生成器
  T3.2  导出设置对话框
  T3.3  Unity 端到端回归

── 批次 15（M4）──────────────────────────────────
  T4.1  Unreal 代码生成器
  T4.2  Unreal 端到端回归

── 批次 16（M5）──────────────────────────────────
  T5.1  设置对话框 + 快捷键 ‖
  T5.2  性能回归 ‖
  T5.3  打包与分发（依赖 M4 完成）
```

### 5.2 QA Agent 推荐策略

1. **滞后一个批次**：Dev 完成批次 N 的任务后，QA 开始测试批次 N 的任务，Dev 同时开始批次 N+1
2. **优先测试关键路径任务**：T0.2 → T0.3 → T1.2 → T1.6 → T1.7 这条链上的任务优先验收
3. **POC 任务特殊处理**：T0.4/T0.5 需要在真实引擎环境中验证，QA 应提前准备好 Unity 2022 和 Unreal 5 环境
4. **UI 交互测试**：M1 批次 8 以后的所有任务都需要在 `pnpm tauri dev` 的真实窗口中验证

---

## 6. 风险与阻塞追踪

| # | 风险/阻塞 | 严重度 | 状态 | 关联任务 | 缓解措施 |
|---|----------|--------|------|---------|---------|
| R1 | Unreal Python API 能力不足 | **高** | 已缓解（D1 已定：Python+JSON 混合） | T0.5 | 见 `docs/poc-reports/T0.5-unreal-python.md`；M4 前固定 UE 小版本 |
| R2 | Konva.js 300 节点性能不达标 | 中 | 已缓解（POC 通过，见 T0.6 报告） | T0.6 | 真机极端环境仍待 M5 回归 |
| R3 | Tauri 文件监听在 Windows 下不稳定 | 中 | 部分缓解 | T0.3 | 已选 plugin-fs watch；实机长期稳定性仍待观察 |
| R4 | 中文 IME 与 Canvas 快捷键冲突 | 低 | 已缓解（T0.7 POC） | T0.7 | 组合输入与可编辑目标分流；真机长期表现待观察 |

---

## 7. QA 报告索引

QA 验证报告存放于 `qa-reports/` 目录，命名规则：`T{id}.md`

| 任务 ID | 报告文件 | 结果 | 日期 |
|---------|---------|------|------|
| T0.1 | [qa-reports/T0.1.md](../qa-reports/T0.1.md) | Pass（含人工补测项） | 2026-04-15 |
| T0.2 | [qa-reports/T0.2.md](../qa-reports/T0.2.md) | Pass（含人工补测项） | 2026-04-15 |
| T0.3 | [qa-reports/T0.3.md](../qa-reports/T0.3.md) | Pass（含人工补测项） | 2026-04-15 |
| T0.6 | [qa-reports/T0.6.md](../qa-reports/T0.6.md) | Pass（含人工补测项） | 2026-04-16 |
| T0.7 | [qa-reports/T0.7.md](../qa-reports/T0.7.md) | Pass（含人工补测项） | 2026-04-16 |
| T1.1 | [qa-reports/T1.1.md](../qa-reports/T1.1.md) | Pass | 2026-04-16 |
| T1.2 | [qa-reports/T1.2.md](../qa-reports/T1.2.md) | Pass | 2026-04-16 |
| T1.3 | [qa-reports/T1.3.md](../qa-reports/T1.3.md) | Pass | 2026-04-16 |
| T1.4 | [qa-reports/T1.4.md](../qa-reports/T1.4.md) | Pass | 2026-04-16 |
| T1.5 | [qa-reports/T1.5.md](../qa-reports/T1.5.md) | Pass | 2026-04-16 |
| T1.6 | [qa-reports/T1.6.md](../qa-reports/T1.6.md) | Pass | 2026-04-16 |
| T1.7 | [qa-reports/T1.7.md](../qa-reports/T1.7.md) | Pass | 2026-04-16 |
| T1.8 | [qa-reports/T1.8.md](../qa-reports/T1.8.md) | Pass（自动化 + 结构交付） | 2026-04-16 |
| T1.9 | [qa-reports/T1.9.md](../qa-reports/T1.9.md) | Pass（自动化 + 结构交付） | 2026-04-16 |
| T1.10 | [qa-reports/T1.10.md](../qa-reports/T1.10.md) | Pass（自动化 + 结构交付） | 2026-04-16 |

> QA Agent 每验证完一个任务，在此表格追加一行。

---

## 附录 A：QA 报告模板

```markdown
# QA 报告 — T{id} {任务标题}

> 测试日期: YYYY-MM-DD
> 测试环境: Windows 10/11, 分辨率 XXXX×XXXX
> 应用版本: commit {hash}

## 测试结果汇总

| # | 用例描述 | 结果 | 备注 |
|---|---------|------|------|
| 1 | {用例1简述} | ✅ Pass / ❌ Fail | |
| 2 | {用例2简述} | ✅ Pass / ❌ Fail | |
| ... | | | |

## 总结

- 通过: X / Y
- 失败: Z / Y
- **最终结论**: Pass / Fail

## 失败详情（如有）

### 用例 N: {用例描述}

- **操作步骤**: ...
- **预期结果**: ...
- **实际结果**: ...
- **截图/日志**: ...
```

---

## 附录 B：Commit 与分支约定

| 约定 | 说明 |
|------|------|
| **初始化（一次性）** | 在 `main` 上做第一次初始 commit，message：`[init] 项目文档与脚手架初始化`，将现有文件（docs/、脚手架）纳入版本控制；然后从 `main` 切出 `dev` 分支：`git checkout -b dev` |
| 分支 | `main` 为稳定分支；日常开发在 `dev` 分支；每个里程碑完成后将 `dev` merge 到 `main` 并打 tag；**不在 main 上直接提交任务代码** |
| Commit 格式 | `[T{id}] {任务标题}` — 如 `[T1.2] YAML 读写与校验` |
| 原子性 | 每个任务对应一个 commit（除非 retry 需要追加 fix commit：`[T{id}] fix: {修复内容}`） |
| Tag | 每个里程碑完成后打 tag：`m0-done`、`m1-done`、… |
