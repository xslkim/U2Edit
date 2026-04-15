# LWB UI Editor — 任务拆分

> 版本: v1.1
> 日期: 2026-04-15
> 配套需求文档: [requirements.md](requirements.md) v0.8

## 使用说明

本文档按里程碑（M0~M5）拆分任务，供两个 AI Agent 协作：

- **开发 Agent (Dev)**：按任务顺序实现，产出代码与构建产物
- **测试 Agent (QA)**：按每个任务的「测试用例」执行验证，产出验证报告

### 任务格式约定

每个任务包含：

- **ID**：`MX.Y` 唯一编号，便于引用
- **标题** / **依赖**：前置任务 ID
- **需求引用**：对应 requirements.md 的章节号
- **交付物 (Deliverables)**：具体的文件路径、函数签名、UI 可见行为
- **测试用例 (Test Cases)**：可执行、有明确预期的验证步骤。优先采用"操作 → 预期"的黑盒描述

### 全局规则

- 所有代码路径基于 [requirements.md 4.3](requirements.md) 的项目结构
- 所有任务完成时 TypeScript 必须 `tsc --noEmit` 通过，无 any 类型（除非加注释说明）
- 涉及用户交互的任务，QA 必须在 `pnpm tauri dev` 运行的真实窗口中验证，不允许只靠单测通过
- 单元测试使用 Vitest，E2E 交互测试使用手动脚本（QA Agent 通过 UI 自动化或人工步骤执行）
- 每个任务完成后提交一个 git commit，commit message 包含任务 ID

---

## M0 — 工程搭建与 POC

### T0.1 Tauri 2 + Vue 3 + TypeScript 项目初始化

- **依赖**：无
- **需求引用**：4.1, 4.2, 4.3
- **交付物**：
  - `package.json`、`vite.config.ts`、`tsconfig.json`、`src-tauri/` 完整脚手架
  - `src/App.vue` 显示一个占位文字 "LWB UI Editor"
  - `src-tauri/tauri.conf.json` 窗口尺寸 1400×900，标题 "LWB UI Editor"
  - `README.md` 包含 `pnpm install` / `pnpm tauri dev` / `pnpm tauri build` 命令说明
- **测试用例**：
  1. 克隆干净仓库，执行 `pnpm install` 无报错
  2. 执行 `pnpm tauri dev`，桌面窗口打开，尺寸约 1400×900，显示 "LWB UI Editor"
  3. 修改 `App.vue` 中的文字，窗口内容在 2 秒内热更新
  4. 执行 `pnpm tauri build`，在 `src-tauri/target/release/bundle/` 下生成 `.msi` 或 `.exe` 安装包，体积 < 15MB

### T0.2 文件系统 & 对话框 & 窗口关闭拦截验证

- **依赖**：T0.1
- **需求引用**：2.1, 4.2
- **交付物**：
  - 安装 `@tauri-apps/plugin-fs`、`@tauri-apps/plugin-dialog`
  - `src-tauri/tauri.conf.json` / `capabilities/` 配置文件读写权限
  - 临时 UI 按钮："选择目录"、"读 YAML"、"写 YAML"
  - `src/core/fileService.ts` 提供 `pickDirectory()`、`readText(path)`、`writeText(path, content)`、`exists(path)`
  - **窗口关闭拦截 POC**：在 `src/core/windowGuard.ts` 中使用 Tauri 2 的 `onCloseRequested` 拦截关闭事件；实现一个全局 dirty 标志，dirty 为 true 时阻止关闭并弹确认对话框
- **测试用例**：
  1. 点击"选择目录"，弹出原生目录选择对话框，选中后返回绝对路径
  2. 在项目目录写入 `test.yaml`（含中文内容），重新读取应完全一致（验证 UTF-8）
  3. 读取不存在的文件时 `exists()` 返回 false，`readText` 抛出可捕获的错误
  4. 路径包含空格（如 `C:\Users\张 三\test`）时读写正常
  5. 将 dirty 设为 true 后点击窗口 X，弹出确认对话框；点"取消"窗口保持打开；点"确认"窗口关闭
  6. dirty=false 时点 X 窗口直接关闭，不弹对话框
  7. Alt+F4 与标题栏 X 行为一致

### T0.3 文件监听方案验证（POC M0.3）

- **依赖**：T0.2
- **需求引用**：2.1
- **交付物**：
  - 选定并安装文件监听插件（优先 `plugin-fs` watch API，备选 `tauri-plugin-fs-watch`）
  - `src/core/fileWatcher.ts`：`watch(path, callback)` / `unwatch(path)` 接口
  - `docs/poc-reports/T0.3-file-watch.md` 记录选用的方案、限制、平台差异
- **测试用例**：
  1. 启动应用后监听 `test.yaml`，在系统记事本外部修改并保存，2 秒内触发 callback
  2. 连续修改 5 次（间隔 100ms），callback 触发次数 ≤ 5 次（防抖可接受）
  3. 删除并重新创建文件，仍能继续收到变更通知
  4. 文件被 VSCode 保存（原子 rename 写入）时也能正确触发

### T0.4 Unity C# Editor 脚本 POC（M0.4-0.7）

- **依赖**：无（纯 Unity 工程）
- **需求引用**：2.12.1, 2.12.3, 2.12.4, 2.12.5
- **交付物**：
  - `poc/unity/LwbUiImportPoc.cs`：手写硬编码 C# Editor 脚本
  - 脚本在 Unity 2022 LTS 下通过 `Tools/LWB UI POC` 菜单执行
  - 创建：Canvas（ScreenSpaceOverlay + CanvasScaler 1920×1080）→ Image → TextMeshPro → Button → Slider（含完整层级）→ Toggle → InputField
  - 导入 PNG 并自动设置 TextureImporter 为 Sprite
  - Pivot = center 的 Image 放置在 (100, 200)，位置在 Scene 中肉眼验证正确
  - `poc/unity/README.md` 步骤说明
- **测试用例**：
  1. 在空 Unity 2022 项目中运行脚本，Prefab 在 `Assets/UI/Poc/` 下生成
  2. 双击 Prefab 进入预制件编辑，Canvas 包含 Image/Text/Button/Slider/Toggle/InputField 6 种控件
  3. Slider 展开后包含 Background、Fill Area>Fill、Handle Slide Area>Handle 层级
  4. 拖入的 PNG 在 Project 窗口下 Texture Type 显示 "Sprite (2D and UI)"
  5. Pivot=center 的 Image，其 RectTransform.pivot = (0.5, 0.5)，anchoredPosition.y = -200（Y 取反后）
  6. TextMeshProUGUI 正确显示中文（需要带中文的 TMP Font Asset）

### T0.5 Unreal Python 脚本 POC（M0.8-0.9）⚠️ 关键风险点

- **依赖**：无（纯 Unreal 工程）
- **需求引用**：2.12.2, 2.12.3, 2.12.4
- **交付物**：
  - `poc/unreal/lwb_ui_import_poc.py`：Editor Utility Python 脚本
  - Unreal 5.x 下通过 Python 命令执行：创建 Widget Blueprint，包含 CanvasPanel + Image + TextBlock + Button（含子 TextBlock）+ Slider + CheckBox + EditableTextBox
  - 每个 CanvasPanel Slot 调用 `set_auto_size(False)`、`set_position`、`set_size`、`set_alignment`
  - `docs/poc-reports/T0.5-unreal-python.md` 结论报告，**明确标注**：
    - Python API 是否足以完成生产需求
    - 若不足，推荐备选方案（C++ 导出 / JSON+插件）
- **测试用例**：
  1. 空 Unreal 5 项目中启用 Python Editor Script Plugin 和 Editor Scripting Utilities 插件
  2. 运行脚本后生成 Widget Blueprint，双击打开 UMG 编辑器，控件层级与预期一致
  3. CanvasPanel 中的 Image 在 Designer 视图中位于 (100, 200) 处，尺寸 200×200
  4. Alignment=(0.5, 0.5) 的 Image 中心点与其 Position 坐标重合
  5. Python 脚本执行期间无 `unreal.LogWarning("... deprecated ...")`
  6. 报告给出明确结论："方案 A 可用" 或 "需切换方案 B/C，原因：…"

### T0.6 Konva.js 画布性能 POC（M0.10）

- **依赖**：T0.1
- **需求引用**：4.2, 5.性能
- **交付物**：
  - 临时页面：生成 300 个随机位置/尺寸的 Rect（模拟 Image 节点）
  - 支持鼠标拖拽移动单个 Rect、滚轮缩放整个画布
  - 右上角 FPS 计数器
- **测试用例**：
  1. 加载 300 节点，初始渲染时间 < 500ms
  2. 拖拽任一节点移动，FPS ≥ 55
  3. 滚轮缩放（按住不放连续缩放），FPS ≥ 55
  4. 窗口最小化后恢复，画布状态保留

### T0.7 中文 IME 输入验证（M0.11）

- **依赖**：T0.1
- **需求引用**：2.6.5
- **交付物**：
  - 临时页面：一个 `<input>`、一个 Konva Text + 双击转 DOM `<input>` 的内联编辑
  - 同时注册 Delete / Ctrl+Z 快捷键
- **测试用例**：
  1. 在 `<input>` 聚焦状态下用微软拼音输入 "你好"，组合期间（拼音候选显示时）按 Delete 不触发删除节点
  2. Konva Text 双击后输入中文，按 Enter 确认，Konva Text 显示正确中文
  3. 输入过程中按空格选字，不被误判为"空格+左键=画布平移"

---

## M1 — 基础编辑器

### T1.1 YAML Schema 类型定义

- **依赖**：T0.1
- **需求引用**：2.3, 2.4, 3.2, 3.3
- **交付物**：
  - `src/core/schema.ts`：完整 TS 类型
    - `Project`、`Meta`、`AssetRef`、`ExportConfig`
    - `Node` 判别联合（`ImageNode | TextNode | ButtonNode | PanelNode | SliderNode | ToggleNode | InputFieldNode`）
    - `Pivot`、`TextAlign`、`SliderDirection` 枚举
  - `src/core/schema.ts` 导出 `CURRENT_SCHEMA_VERSION = 1`
  - 每个节点类型的默认值构造函数 `createDefaultImage()` 等（对应 2.6.2 默认值表）
- **测试用例**：
  1. `createDefaultImage()` 返回对象 `width=100, height=100, pivot='topLeft', visible=true, opacity=1.0, tint='#FFFFFF', assetId=null`
  2. 所有 7 种节点默认值单测全部通过
  3. `tsc --noEmit` 无错误；尝试给 `ImageNode` 赋 `content` 字段时编译失败（类型区分正确）

### T1.2 YAML 读写与校验

- **依赖**：T1.1, T0.2
- **需求引用**：2.1, 2.11, 3.3
- **交付物**：
  - `src/core/project.ts`：
    - `loadProject(dir: string): Promise<{ project: Project; warnings: string[] }>`
    - `saveProject(dir: string, project: Project): Promise<void>`
    - `validate(project: Project): ValidationError[]`
  - 校验项：
    - **根节点唯一性**：nodes 数组有且仅有一个元素，type 必须为 panel
    - id 全局唯一、id 格式 `^[a-zA-Z_][a-zA-Z0-9_]*$`
    - 嵌套深度 ≤ 6
    - children 仅 panel/button 可有
    - assetId 必须存在于 assets 列表
    - 枚举值合法（type / pivot / textAlign / direction）
- **测试用例**：
  1. 加载 requirements.md 3.2 示例 YAML，得到 Project 对象，`warnings.length === 0`
  2. 加载包含重复 id 的 YAML，validate 返回对应错误，错误消息包含重复的 id 名
  3. id = "123abc" 时校验不通过
  4. 嵌套 7 层时校验不通过
  5. assetId = "不存在的id" 时校验返回 assetId 错误
  6. 保存后重新加载，对象深度相等（round-trip 无损）
  7. nodes 数组为空、含 2 个根节点、或根节点 type != panel 时均校验不通过

### T1.3 Schema 版本升级框架

- **依赖**：T1.2
- **需求引用**：2.11, 3.3
- **交付物**：
  - `src/core/migrations.ts`：`migrate(raw: any): { project: Project; upgraded: boolean; fromVersion: number }`
  - 升级链按 `schemaVersion` 逐级执行
  - 当前版本即 v1，无需实际迁移；预留 v1→v2 的升级函数注册接口（`registerMigration(from, to, fn)`）
  - 遇到高版本时抛 `UnsupportedSchemaError`
- **测试用例**：
  1. 加载 schemaVersion=1 的文件，upgraded=false
  2. 手动将 schemaVersion 改为 999，加载时抛 UnsupportedSchemaError
  3. 通过 `registerMigration` 注册一个测试用 v1→v2 转换（把所有节点 name 加后缀 "_v2"），加载 v1 文件后得到 v2 对象，upgraded=true，且**磁盘文件保持不变**直到用户触发保存

### T1.4 命令模式撤销重做框架

- **依赖**：T1.1
- **需求引用**：2.6.5
- **交付物**：
  - `src/core/history.ts`：
    - `Command { do(): void; undo(): void; label: string }`
    - `HistoryStack { push(cmd), undo(), redo(), canUndo(), canRedo(), clear() }`
    - 容量 100（规格 ≥50，留余量）；超出丢弃最早
  - 提供 `PatchNodeCommand`、`AddNodeCommand`、`RemoveNodeCommand`、`ReorderCommand`、`AddAssetCommand`、`RemoveAssetCommand`
- **测试用例**：
  1. push 3 个 cmd，undo 3 次状态完全回到初始
  2. undo 1 次 redo 1 次状态一致
  3. undo 后再 push 新 cmd，redo 栈清空（符合 linear history）
  4. push 超过 100 个，stack.length === 100，最早的被丢弃
  5. undo() 在栈空时不抛异常，返回 false

### T1.5 主窗口四面板布局

- **依赖**：T0.1
- **需求引用**：2.0
- **交付物**：
  - `src/App.vue` 使用 CSS Grid/Flex 实现 Toolbar + NodeTree + Canvas + Properties + Assets + StatusBar
  - NodeTree 宽度 220px，Properties 宽度 280px，分隔条可拖拽调整（最小 150px，最大 500px）
  - Properties/Assets 上下分栏，分隔条可拖拽
  - 每个面板可通过 Toolbar 的切换按钮或面板自身的折叠按钮隐藏/显示
- **测试用例**：
  1. 打开窗口，六个区域位置符合 2.0 图示
  2. 拖动 NodeTree 右边缘，宽度在 150~500px 之间变化，Canvas 区域同步伸缩，无抖动
  3. 折叠 Properties 后，Canvas 扩展至右边界
  4. 窗口拉伸到 2560×1440，布局正常不错位

### T1.6 新建/打开/保存项目

- **依赖**：T1.2, T1.5
- **需求引用**：2.1
- **交付物**：
  - Toolbar 按钮：新建 / 打开 / 保存
  - 新建项目对话框：输入目录（按钮选择）+ 项目名称（默认取目录名，可编辑）+ 分辨率（默认 1920×1080）
  - 新建后生成 `project.yaml`（带 root_panel）+ `assets/` 空目录
  - 打开项目：目录必须包含 `project.yaml`，否则报错
  - 保存：Ctrl+S 与 Toolbar 按钮
  - 窗口标题显示 `{项目名} [- *]`，未保存时显示 `*`
  - 关闭窗口（Alt+F4 或点 X）时若有未保存修改，弹确认对话框（保存 / 不保存 / 取消）
- **测试用例**：
  1. 新建项目后目录下存在 `project.yaml` 和空 `assets/` 子目录；`meta.name` 等于对话框中输入的项目名称
  2. 项目名称未手动修改时等于目录名；手动清空项目名称时阻止创建并提示
  3. 打开一个不含 `project.yaml` 的目录，弹出错误提示，不加载
  4. 修改任意属性后标题出现 `*`，Ctrl+S 后 `*` 消失
  5. 有未保存修改时按 Alt+F4，弹对话框；点"取消"窗口不关闭
  6. 点"不保存"窗口关闭，磁盘文件未变

### T1.7 画布基础渲染（Konva 集成）

- **依赖**：T1.5, T1.6
- **需求引用**：2.2
- **交付物**：
  - `src/canvas/renderer.ts`：根据 Project 对象渲染 Konva Stage
  - 深灰色画布外背景 + 白色画布区域（按 meta.canvasWidth/Height）
  - 渲染 Image、Text、Panel.background、Button.background+label 为 WYSIWYG
  - 渲染 Slider/Toggle/InputField 为背景图 + 控件类型图标 + 名称（简化渲染，见 2.3）
  - 资源缺失时显示红色占位矩形 + "Missing: xxx.png"
- **测试用例**：
  1. 加载示例 YAML 后画布正确显示 root_panel、title_text、start_btn 等
  2. 删除 assets 目录下某 PNG 重新加载，对应节点显示红色 "Missing" 占位
  3. Slider 节点显示背景 + 图标 + "VolumeSlider" 文字标签
  4. visible=false 的节点不渲染
  5. opacity=0.5 的节点渲染半透明，但其子节点完全不透明（验证不继承）

### T1.8 画布缩放与平移

- **依赖**：T1.7
- **需求引用**：2.2
- **交付物**：
  - 滚轮缩放（以指针为中心），范围 10%~500%
  - 中键拖拽平移；空格+左键拖拽平移（光标变抓手）
  - Ctrl+0 重置 100%（且居中画布）
  - Ctrl+1 适合窗口（画布四周留约 5% 后取最小缩放比）
  - Ctrl+G 切换网格显示（每 10/50/100px 三档视缩放切换）
  - StatusBar 显示：缩放百分比 | 画布分辨率 | 选中节点数 | 未保存标记（"●" 或 "已保存"）
- **测试用例**：
  1. 滚轮放大时鼠标下的像素位置不漂移（1px 内）
  2. 缩放到 5% 时自动限制在 10%
  3. Ctrl+0 后画布回到 100% 且居中
  4. 1920×1080 画布在 1400×900 窗口下按 Ctrl+1，缩放比约 0.65 左右且完整可见
  5. 中键拖拽时光标变抓手，松开后恢复
  6. Ctrl+G 切换网格，网格在画布白色区域内显示
  7. StatusBar 四项信息实时更新：缩放变化时百分比同步；选中 3 个节点时显示"已选中 3"；dirty 状态切换时标记同步

### T1.9 单选与多选

- **依赖**：T1.7
- **需求引用**：2.6.1
- **交付物**：
  - `src/canvas/selection.ts`：`SelectionStore`（响应式 Set<nodeId>）
  - 单击选中（命中最上层节点，嵌套穿透）
  - Ctrl+点击 追加/取消
  - Alt+点击 穿透下一层（点击位置下方 z-order 往下一个）
  - 空白拖拽框选：完全包围的节点被选中
  - 点击空白取消选中
  - Escape 取消选中（或取消正在进行的拖拽）
  - 选中节点显示蓝色外框 + 8 个 resize 手柄
- **测试用例**：
  1. 单击 Image 节点，节点被蓝色外框标记，Properties 面板显示其属性
  2. Ctrl+点击 另一个节点，两个节点都被选中
  3. 再次 Ctrl+点击 已选中节点，取消其选中
  4. 在画布空白拖拽矩形完全包围某节点，松开后该节点被选中；仅部分相交的节点不被选中
  5. 两个 Image 完全重叠时，单击选中顶层；Alt+点击 选中下层
  6. 点击空白，所有节点取消选中
  7. 按 Escape，取消所有选中

### T1.10 节点树面板（基础）

- **依赖**：T1.9
- **需求引用**：2.9
- **交付物**：
  - `src/panels/NodeTree.vue`
  - 递归展示节点（panel/button 可展开折叠）
  - 点击节点 → 选中同步（双向）
  - 选中节点时画布自动滚动到可见区域
  - 节点右侧：眼睛图标（visible 切换）、锁图标（lock，仅编辑器内存）
  - 双击节点名重命名
- **测试用例**：
  1. 展开 root_panel，看到所有子节点；层级缩进正确
  2. 节点树点击节点与画布选中双向同步
  3. 选中画布外某节点时，画布自动平移到包含该节点
  4. 点击眼睛图标，画布上节点消失，再点恢复；刷新保存后状态保留
  5. 点击锁图标，画布上该节点无法被选中/拖拽；重新打开项目后锁定状态重置为解锁
  6. 双击节点名进入编辑，输入新名按 Enter 确认；按 Escape 取消

### T1.11 Properties 面板（基础属性）

- **依赖**：T1.9, T1.4
- **需求引用**：2.4, 2.10
- **交付物**：
  - `src/panels/Properties.vue`
  - 分组显示：基础 / 变换 / 外观 / 控件特有
  - 编辑控件按 2.10 规范（文本框/数字框/下拉/开关/滑条+数字框）
  - 数字框支持方向键 ±1、Shift+方向键 ±10
  - **拖拽 label 调值**：在属性标签（如 "X:"）上按住鼠标左键水平拖拽实时改值，光标变为 ↔；拖拽过程不入栈，松开时入栈一次（遵循 2.6.5 颗粒度）；Shift 按住时步长 ×10
  - 属性修改通过 `PatchNodeCommand` 入历史栈
  - 多选时显示共有属性，混合值显示 "—"
  - 色块 / 取色器 / assetId 选择器在 T1.14 单独实现，本任务仅预留挂载点
- **测试用例**：
  1. 选中节点修改 x 为 200，画布上节点位置更新
  2. 数字框聚焦后按↑键，值 +1；Shift+↑ +10
  3. 在 "X:" 标签上按住左键向右拖 50 屏幕像素，x 值增加（约 50），光标变 ↔；松开后 Ctrl+Z 仅撤销一次回到原值
  4. Shift+拖 label 时步长明显更大（约 10 倍）
  5. 输入非法 id（如 "1abc"）时输入框标红并显示 tooltip
  6. 多选两个节点，共有属性可编辑；修改 opacity 同时应用到两个节点
  7. 两节点 x 不同时，x 输入框显示 "—"；输入新值后两节点 x 均更新
  8. 每次修改后 Ctrl+Z 能回到修改前值

### T1.14 颜色选择器与 assetId 选择器

- **依赖**：T1.11
- **需求引用**：2.10
- **交付物**：
  - `src/panels/ColorPicker.vue`：色块预览按钮 → 点击弹出浮层；浮层内含 HSV 面板（可视化拖选）+ Hue 滑条 + Alpha 滑条 + 十六进制输入框（支持 #RGB / #RRGGBB 格式）+ 取消/确认按钮
  - 浮层关闭时间：点击确认 / 点击外部 / Esc 均关闭（确认/外部关闭提交值，Esc 放弃）
  - 拖拽过程实时预览（画布实时更新），但仅在关闭时入栈一次
  - `src/panels/AssetPicker.vue`：缩略图预览按钮 → 点击弹出 assets 列表（缩略图网格）+ 搜索框 + 清除按钮（置 null）
  - 取色器与 assetId 选择器挂载到 T1.11 预留点
- **测试用例**：
  1. 点击 color 字段色块，弹出取色器浮层；拖选 HSV 面板画布节点颜色实时更新
  2. 在十六进制输入框输入 `#ff0000`，HSV 面板和色块同步；非法输入（如 `#xyz`）标红不生效
  3. 拖选过程中连续 30 帧变化，点确认后 Ctrl+Z 仅撤销一次
  4. Esc 关闭浮层时节点颜色回到打开前值
  5. 点击 assetId 字段打开选择器，列出所有 assets 缩略图
  6. 搜索框输入 "btn"，列表过滤；点某个缩略图后关闭浮层，节点 assetId 更新
  7. 点"清除"按钮，assetId 设为 null，画布对应节点显示占位

### T1.12 拖拽移动节点

- **依赖**：T1.9, T1.4
- **需求引用**：2.6.3
- **交付物**：
  - 自由拖拽修改 x/y
  - Shift+拖拽 锁定水平/垂直（按拖拽幅度较大轴）
  - 方向键 ±1px，Shift+方向键 ±10px
  - 多选整组拖拽保持相对位置
  - 拖拽中途不入栈，松开时一次入栈
  - 拖到 Panel 上不改变父子关系
  - 拖出父容器允许溢出
- **测试用例**：
  1. 拖拽 Image 到新位置，松开后 x/y 更新
  2. Shift+拖拽 主要向右移动 100px 向下 20px，仅 x 改变（锁定水平）
  3. 按 → 键 1 次节点右移 1px
  4. 多选 3 个节点一起拖拽，相对位置保持
  5. 拖拽过程中连续 60 次帧更新，Ctrl+Z 仅撤销 1 次（验证颗粒度）
  6. 子节点拖出父 Panel 外，依然作为该 Panel 子节点（坐标可能为负）

### T1.13 画布鼠标指针状态

- **依赖**：T1.12
- **需求引用**：2.2 鼠标指针样式表
- **交付物**：根据状态切换指针（默认箭头 / 悬停节点手形 / 拖拽移动十字 / resize 双箭头 / 平移抓手）
- **测试用例**：
  1. 空白区域光标为箭头
  2. 悬停节点光标变手形
  3. 拖拽节点时光标变十字移动
  4. 悬停 8 个 resize 手柄分别显示 ↔ ↕ ↗ ↘ 相应方向
  5. 按住空格光标变抓手，松开恢复

---

## M2 — 完整控件 & 资源 & 编辑操作

### T2.1 Toolbar 控件添加按钮

- **依赖**：T1.11
- **需求引用**：2.6.2, 2.8
- **交付物**：
  - 7 种控件图标按钮 + tooltip
  - 点击后按 2.6.2 父节点规则插入节点（视口中央坐标转画布坐标）
  - id/name 自动 `{type}_{自增}`
  - 使用 `AddNodeCommand` 入历史栈
- **测试用例**：
  1. 点击 Image 按钮，视口中央出现 100×100 Image，id="image_1"
  2. 连续点击 3 次 Image，id 分别为 image_1/2/3（不重复）
  3. 选中 Panel 后点击 Text，Text 成为 Panel 子节点
  4. 选中 Image（非容器）后点击 Text，Text 与 Image 同级
  5. 无选中时点击按钮，节点加入 root_panel
  6. Ctrl+Z 撤销，节点消失

### T2.2 右键菜单（画布 + 节点树）

- **依赖**：T2.1, T1.10
- **需求引用**：2.6.6, 2.9
- **交付物**：
  - 统一的 `src/components/ContextMenu.vue` 组件
  - 画布空白右键：添加控件 → 7 种子菜单 / 粘贴（剪贴板为空时禁用）
  - 画布节点上右键：复制 / 粘贴 / 删除 / 上移 / 下移 / 置顶 / 置底 / 锁定 / 解锁
  - **节点树节点上右键**：复制 / 粘贴 / 删除 / 上移 / 下移 / 置顶 / 置底（不含锁定,锁定通过节点树锁图标操作）
  - 添加控件在右键位置创建节点
- **测试用例**：
  1. 画布空白右键菜单，点 "添加 Text"，Text 出现在点击位置
  2. 画布节点右键点"置顶"，该节点移到 children 数组末尾，渲染在最上层
  3. 画布节点右键"锁定"后节点无法被画布选中，节点树锁图标更新
  4. 剪贴板为空时，"粘贴" 菜单项置灰禁用
  5. 节点树右键菜单显示 7 项操作，点"删除"节点从树与画布同步消失
  6. 节点树右键"置顶"与画布右键"置顶"产生相同结果（children 数组末尾）
  7. 在 root_panel 节点树右键，"删除"项置灰（根节点不可删）

### T2.3 复制粘贴删除

- **依赖**：T2.1, T1.4
- **需求引用**：2.6.5
- **交付物**：
  - Ctrl+C：复制选中节点（含子节点）到内存剪贴板
  - Ctrl+V：粘贴到当前容器，偏移 (10,10)，新 id
  - Ctrl+D：等同复制+粘贴（偏移 10,10）
  - Delete：删除选中节点
  - Ctrl+A：选中当前容器直接子节点（见修订定义）
  - 所有操作入历史栈
- **测试用例**：
  1. 选中 Panel 含 2 子节点，Ctrl+C Ctrl+V 后新 Panel 与所有子节点都复制且 id 全新
  2. Ctrl+D 偏移位置 (10,10)
  3. Delete 后节点消失，Ctrl+Z 恢复
  4. 无选中时按 Ctrl+A，选中 root_panel 所有直接子节点；选中子节点内某个后按 Ctrl+A，选中其父的所有直接子节点
  5. root_panel 不可删除（按 Delete 无效）

### T2.4 层级调整（上移/下移/置顶/置底）

- **依赖**：T2.2, T1.4
- **需求引用**：2.5, 2.6.6
- **交付物**：右键菜单或快捷键调整 children 数组位置
- **测试用例**：
  1. 三节点 A/B/C，选 B 置顶，数组变为 [A, C, B]，B 渲染在最上
  2. 置底后在最下
  3. 上移/下移每次相邻交换一次
  4. 已在顶/底执行对应操作无效（不报错）

### T2.5 Resize 缩放

- **依赖**：T1.9, T1.4
- **需求引用**：2.6.4
- **交付物**：
  - 8 个手柄拖拽改 width/height
  - Shift+角拖拽 等比缩放
  - 最小 10×10
  - Pivot 点保持不动（改变 x/y 以维持 pivot 锚点）
  - Text 仅改容器尺寸，fontSize 不变
  - 松开鼠标入栈一次
- **测试用例**：
  1. pivot=topLeft 节点从右下角拖拽 +50，width+50 height+50，x/y 不变
  2. pivot=center 节点从右下角拖拽，节点中心位置不变，宽高增加
  3. Shift+角拖拽，宽高比保持原始比例
  4. 拖拽到宽度 < 10 时停在 10
  5. 缩放 Text 容器时 fontSize 保持不变

### T2.6 对齐参考线与吸附

- **依赖**：T1.12
- **需求引用**：2.6.3
- **交付物**：
  - 拖拽/Resize 时实时检测同级节点边缘/中心对齐
  - 吸附阈值 5 屏幕像素（不随缩放变化）
  - 显示彩色参考线（水平红色/垂直绿色）
- **测试用例**：
  1. 拖拽节点边缘接近同级节点边缘 < 5 屏幕像素时，吸附并显示参考线
  2. 画布缩放到 200% 后吸附阈值仍为 5 屏幕像素（不是 10 画布像素）
  3. 松开鼠标参考线消失

### T2.7 资源管理面板

- **依赖**：T1.6, T1.11
- **需求引用**：2.7
- **交付物**：
  - `src/panels/Assets.vue`
  - 顶部：导入按钮 + 搜索框
  - 缩略图网格（64×64），悬停 tooltip 显示文件名+尺寸
  - 导入：多选文件对话框 → 复制到 `assets/` → 更新 YAML
  - 重名：弹覆盖/重命名/取消
  - 右键删除：检查引用，有引用时警告列表
- **测试用例**：
  1. 导入 3 个 PNG，assets 列表新增 3 项，缩略图正确显示
  2. 再次导入同名文件，弹对话框；选"重命名"自动加后缀 _1
  3. 搜索框输入 "btn"，仅显示 id 或文件名包含 btn 的资源
  4. 删除被节点引用的资源，弹警告列出引用节点；取消后资源仍在
  5. 删除未引用资源，`assets/` 下文件同步删除

### T2.8 拖拽资源到画布创建 Image

- **依赖**：T2.7
- **需求引用**：2.6.2, 2.7
- **交付物**：
  - 资源缩略图拖到画布，松手处创建 Image，width/height=原始尺寸，pivot=topLeft
  - **父节点判定规则**：以**落点下的最上层容器节点**（panel/button）为父节点；若落点下无容器，则以 root_panel 为父节点。坐标自动转换为相对该父节点的坐标
  - 该规则与工具栏/右键菜单的"按当前选中判定父节点"规则不同，此处基于落点更符合直觉
- **测试用例**：
  1. 拖 100×200 的 PNG 到画布空白处 (500, 300)，父节点为 root_panel，创建 Image x=500 y=300 width=100 height=200
  2. 拖到 Panel（相对 root_panel 位于 (100,100)）内部位置 (150, 120)，父节点为该 Panel，相对坐标为 (50, 20)
  3. 拖到 Button 内部时，父节点为该 Button（添加为 children 元素）
  4. 拖到 Image（非容器）上方，穿透到其下的容器或 root_panel，不把 Image 当父节点
  5. 操作入历史栈可撤销

### T2.9 Text 双击内联编辑

- **依赖**：T1.11, T0.7
- **需求引用**：2.6.5
- **交付物**：
  - Konva Text 双击覆盖 DOM `<textarea>` 在同位置
  - Enter 或点击外部确认，Escape 取消
  - 支持中文 IME（组合期间不入栈，确认后整体一次）
- **测试用例**：
  1. 双击 Text 出现 textarea，焦点在其中
  2. 输入中文后 Enter 确认，Text 内容更新
  3. Esc 取消，Text 内容不变
  4. 组合字符期间按 Delete 不删除节点

### T2.10 节点树搜索与拖拽

- **依赖**：T1.10
- **需求引用**：2.9
- **交付物**：
  - 搜索框按 name/id 实时过滤，命中项高亮，父节点自动展开
  - 节点间拖拽：拖到节点间调整同级顺序，拖到 Panel/Button 上成为其子节点
  - 拒绝拖入非容器；拒绝超过 6 层嵌套（tooltip 提示）
- **测试用例**：
  1. 搜索 "btn"，仅显示匹配节点和其路径上父节点
  2. 清空搜索，树恢复完整
  3. 拖 Text 到 Panel 上，成为其子节点，父子关系变更
  4. 拖 Image 到另一 Image 上，拒绝（后者非容器）
  5. 拖出 6 层嵌套时拒绝，tooltip 显示超限提示

### T2.11 文件监听冲突处理

- **依赖**：T0.3, T1.6
- **需求引用**：2.1
- **交付物**：
  - 监听打开的 `project.yaml`
  - 防抖：用户拖拽/resize/输入框聚焦时延后弹对话框
  - 无未保存修改：对话框提供 重新加载 / 忽略
  - 有未保存修改：对话框提供 保存我的修改 / 重新加载 / 取消
- **测试用例**：
  1. 外部编辑 YAML 保存，无未保存修改时弹"重新加载 / 忽略"对话框
  2. 有未保存修改时弹三按钮对话框，文字明确提示"将丢弃这些修改"
  3. 用户正在拖拽节点时外部变更，对话框延后至拖拽结束
  4. 连续 5 次外部变更只弹 1 次（合并）

### T2.12 错误/异常处理与校验反馈

- **依赖**：T1.2, T1.11
- **需求引用**：2.11
- **交付物**：
  - 打开损坏 YAML 弹错误对话框（含行号）
  - 保存时校验：id 重复/id 格式非法时阻止保存并列出错误
  - 属性面板 id 输入框非法时标红 + tooltip
  - assetId 字段引用无效时标红，画布显示占位
  - Schema 版本升级提示
- **测试用例**：
  1. 手动改坏 YAML（缺闭合括号），打开时对话框显示解析错误和大致行号
  2. 属性面板把 A 节点 id 改为 B 节点的 id，Ctrl+S 失败并弹错误列表
  3. 输入 id="1abc" 时输入框红框，tooltip 提示
  4. 将 assetId 改为不存在值，字段红框，画布显示 "Missing"

---

## M3 — Unity 导出

### T3.1 Unity C# 代码生成器

- **依赖**：T1.1, T1.2, T2.7（资源管理）, T0.4（Unity POC 结论）
- **需求引用**：2.12.1, 2.12.3, 2.12.4, 2.12.5, 2.12.6
- **交付物**：
  - `src/export/unity.ts`：`generateUnityScript(project: Project, exportConfig, sourceAssetPath: string): string`
  - **`sourceAssetPath` 由调用方在运行时传入当前项目 assets 目录的绝对路径，内嵌进生成的 C# 脚本字符串常量，不写回 YAML**
  - 输出内容：
    - `using` 声明 + `[MenuItem]` 入口
    - Canvas 创建（ScreenSpaceOverlay + CanvasScaler）
    - 按节点树递归生成 GameObject，正确设置 RectTransform（含 pivot 映射表 + Y 取反）
    - 复合控件按 2.12.5 层级创建
    - 图片复制逻辑（从 `sourceAssetPath` 复制到 `assetRootPath`）
    - PNG 的 TextureImporter 设置为 Sprite
    - 保存为 Prefab
  - 处理空字体 / 缺失 asset
- **测试用例**：
  1. 示例 YAML 导出的 .cs 文件能编译通过（用 Unity 2022 打开无错误）
  2. 执行菜单后生成 Prefab，所有节点位置/尺寸/层级与画布一致
  3. Pivot=center x=100 y=200 的节点 RectTransform.anchoredPosition = (100, -200)，pivot = (0.5, 0.5)
  4. Slider 子对象包含 Background、Fill Area/Fill、Handle Slide Area/Handle
  5. PNG 的 TextureType 自动设为 Sprite
  6. 覆盖导出时弹确认提示；取消则不覆盖
  7. 将项目目录从 `D:/p1` 复制到 `D:/p2` 后，在 p2 中打开再导出，生成的 C# 中 sourceAssetPath 自动更新为 `D:/p2/assets`（而非继续指向 p1）

### T3.2 导出设置对话框

- **依赖**：T3.1
- **需求引用**：2.12.0
- **交付物**：
  - Toolbar 下拉选 Unity → 弹对话框
  - 表单：assetRootPath、defaultFont、fontSizeScale、referenceResolution
  - "选择导出位置" 按钮
  - 修改回写 YAML 的 export 字段（但 `sourceAssetPath` 始终不写入 YAML，运行时注入）
  - 导出完成弹成功对话框：路径 + "打开所在文件夹" + 使用说明
- **测试用例**：
  1. 打开对话框显示当前 export.unity 配置
  2. 修改 fontSizeScale 为 1.2，关闭并保存 YAML 后值持久化
  3. 选导出位置 `D:/test.cs`，导出完成后该文件存在
  4. 成功对话框"打开所在文件夹"在文件浏览器中定位 .cs
  5. 检查 project.yaml：`export.unity.fontSizeScale` 已更新，但整个文件中不存在 `sourceAssetPath` 字段

### T3.3 Unity 导出端到端回归

- **依赖**：T3.2
- **需求引用**：2.12
- **交付物**：
  - `tests/e2e-fixtures/sample-all-controls.yaml`：包含 7 种控件、嵌套、多图片
  - 文档 `docs/unity-export-verify.md` 记录在 Unity 2022 中验证步骤
- **测试用例**：
  1. 固定 fixture 导出 .cs，在干净 Unity 2022 项目中执行
  2. 生成 Prefab 在 Game 视图渲染：所有 7 种控件可见，位置正确
  3. 中文 TMP 正确显示（需验证 Font Asset 配置步骤）
  4. 再次修改 fixture 重新导出，覆盖确认对话框工作；旧 Prefab 被替换

---

## M4 — Unreal 导出

### T4.1 Unreal Python 代码生成器（或备选）

- **依赖**：T0.5（必须先确认 POC 结论）
- **需求引用**：2.12.2, 2.12.3, 2.12.4
- **交付物**：
  - 根据 T0.5 结论选择方案：
    - 方案 A：`src/export/unreal.ts` 生成 Python 脚本
    - 方案 B：生成 C++ 代码
    - 方案 C：生成 JSON + 提供 Editor 插件代码
  - 输出 CanvasPanel + 7 种控件映射（按 2.12.3 表）
  - 图片复制到 Unreal 项目
  - 每个 Slot 调用 `set_auto_size(False)` + position/size/alignment
  - Alignment 按映射表（Y 与 Unity 相反）
- **测试用例**：
  1. 生成脚本在 Unreal 5 执行后生成 Widget Blueprint
  2. 在 UMG Designer 中查看，所有控件位置/尺寸正确
  3. Pivot=center 的节点 Alignment=(0.5, 0.5)
  4. 中文 TextBlock 正确显示
  5. 覆盖导出提示工作

### T4.2 Unreal 导出端到端回归

- **依赖**：T4.1
- **交付物**：文档 `docs/unreal-export-verify.md`
- **测试用例**：
  1. 使用 T3.3 相同 fixture 导出，Widget Blueprint 渲染效果与 Unity Prefab 对比一致（允许细微差异）
  2. 所有 7 种控件功能可用

---

## M5 — 打磨

### T5.1 设置对话框 + 快捷键统一实现

- **依赖**：M2
- **需求引用**：2.8（设置按钮内容表）, 附录 A
- **交付物**：
  - 统一的快捷键注册表 `src/core/shortcuts.ts`
  - 在输入框聚焦时禁用画布快捷键（避免误触）
  - `src/panels/SettingsDialog.vue`：Toolbar 设置按钮打开，含四分页：
    - **项目**：项目名称（meta.name）、画布分辨率（修改时弹二次确认）— 保存到 project.yaml
    - **编辑器**：显示网格默认开关、吸附阈值、历史步数上限 — 保存到 `%APPDATA%/lwb-ui-editor/settings.json`
    - **快捷键**：只读的附录 A 表格
    - **关于**：版本号、Schema 版本、许可证
  - `src/core/userSettings.ts`：读写用户配置文件
- **测试用例**：
  1. 属性面板输入框聚焦时按 Delete 不删除节点
  2. 快捷键分页列出所有附录 A 快捷键
  3. 所有附录 A 快捷键逐项验证可用
  4. 项目分页修改项目名称后关闭对话框，标题出现 `*`；Ctrl+S 后 YAML 中 meta.name 更新
  5. 项目分页修改画布分辨率弹确认对话框，点确认后画布尺寸变化
  6. 编辑器分页修改吸附阈值为 10，关闭后拖拽吸附行为按 10px 触发；重启应用后设置保留
  7. 编辑器分页修改不触发 project.yaml 的未保存标记（`*` 不出现）
  8. 关于分页显示与 package.json / schema.ts 一致的版本号

### T5.2 性能回归

- **依赖**：M2
- **需求引用**：5.性能
- **交付物**：
  - 压测脚本：生成 300 节点的 project.yaml
  - 录制性能基线
- **测试用例**：
  1. 加载 300 节点，首次渲染 < 1s
  2. 拖拽、缩放 FPS ≥ 55
  3. 节点树展开所有层级无卡顿
  4. 内存占用 < 500MB

### T5.3 打包与分发

- **依赖**：M4
- **需求引用**：5.非功能
- **交付物**：
  - Github Actions workflow（或 README 打包步骤）
  - Windows .msi 和 portable .exe 两种产物
  - 应用图标 + 版本号
- **测试用例**：
  1. 新 Windows 10 虚拟机安装 .msi 后首次启动 < 3s
  2. portable .exe 不需安装直接运行
  3. 安装包 < 15MB
  4. 完全离线环境（禁用网络）所有功能正常

---

## 附录 B：Agent 协作流程建议

1. **Dev Agent** 按 M0.1 → M5.3 顺序执行，每完成一个 T 任务：
   - 完成交付物
   - 自运行本任务的测试用例，确保全部通过
   - 提交 commit：`[T1.2] YAML 读写与校验`
   - 将任务状态标记为 "待测"

2. **QA Agent** 监听 "待测" 任务：
   - 读取任务测试用例
   - 在真实运行的应用中按步骤验证
   - 产出报告 `qa-reports/T1.2.md`：每条用例的 Pass/Fail + 截图/日志
   - 全部 Pass → 标记 "已验收"；任何 Fail → 退回 Dev

3. **冲突解决**：Fail 超过 2 次时升级到人工介入

4. **并行策略**：同一里程碑内无依赖关系的任务可并行开发（如 T1.7 画布渲染 与 T1.10 节点树 均依赖 T1.9 但互不依赖，可并行）

---

## 附录 C：依赖关系图（关键路径）

```
应用侧（依赖 Tauri/Vue 脚手架）：
  T0.1 ──► T0.2 ──► T0.3 ──► T0.6 ──► T0.7 ──► M1 ──► M2 ──► M3 (Unity)
                                                          └─► M4 (Unreal)
                                                          └─► M5 (打磨)

引擎侧（独立 POC，与应用侧脚手架无依赖）：
  T0.4 (Unity POC)  ──► 为 T3.1 Unity 生成器提供 API 经验
  T0.5 (Unreal POC) ──► 决定 T4.1 方案（A/B/C），最迟在 M3 启动前完成
```

**关键依赖说明**：
- T0.4 / T0.5 是独立的引擎工程 POC，不依赖 Tauri 脚手架，可与 T0.1~T0.3 并行启动
- T0.5 的结论（方案 A/B/C）必须在 T4.1 开始前确定；建议最迟与 M3 并行启动
- T0.6 画布性能 POC 和 T0.7 IME POC 依赖 T0.1 脚手架

**关键风险点**：
- **T0.5**：若 Unreal Python API 不足，需切换到 C++ 或 JSON+插件方案，M4 工作量可能翻倍
- **T0.6**：若 Konva.js 在 300 节点下 FPS 不达标，需在 M1 前评估替代（如 PixiJS）
