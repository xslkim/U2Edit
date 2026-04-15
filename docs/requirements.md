# LWB UI Editor — 需求文档

> 版本: v0.8  
> 日期: 2026-04-15  
> 状态: 草案（已根据 review 修订 — 第二轮）

---

## 1. 项目概述

### 1.1 目标

开发一个**轻量级桌面端 UI 编辑器**，面向游戏程序员使用。用户在编辑器中以可视化方式编排 UI 界面，完成后可导出为：

- **Unity 2022** UGUI Prefab（通过 C# Editor 脚本在 Unity 内执行生成）
- **Unreal Engine** UMG Widget Blueprint（通过 Python 脚本在引擎内执行生成）

核心理念：**编辑一次，两端可用**。两端引擎的细节差异允许手动修补，不追求完整自动化匹配。

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| 轻量 | 只做基础功能，不做复杂布局/动画/事件绑定 |
| 人可读 | 数据采用 YAML 格式，结构清晰，便于人工编辑和版本管理 |
| 机器可写 | Schema 对外暴露，AI Agent 可直接生成/修改 YAML 文件（如从 Figma 导入） |
| 桌面客户端 | Tauri 2 桌面应用，原生文件系统访问，单人本地运行 |

### 1.3 使用者

游戏程序员。假设使用者熟悉 JSON/YAML、Unity/Unreal 的 UI 系统。

---

## 2. 功能需求

### 2.0 编辑器界面布局

```
┌─────────────────────────────────────────────────────────────┐
│  Toolbar（顶部工具栏）                                        │
├──────────┬──────────────────────────────┬───────────────────┤
│ NodeTree │                              │  Properties      │
│ 节点树    │        Canvas 画布            │  属性面板         │
│ (左侧)   │        (中央)                 │  (右上)          │
│          │                              │                   │
│          │                              ├───────────────────┤
│          │                              │  Assets           │
│          │                              │  资源面板          │
│          │                              │  (右下)           │
├──────────┴──────────────────────────────┴───────────────────┤
│  StatusBar：缩放百分比 | 画布分辨率 | 选中节点数 | 未保存标记    │
└─────────────────────────────────────────────────────────────┘
```

| 区域 | 说明 |
|------|------|
| Toolbar | 顶部固定，不可折叠 |
| NodeTree | 左侧，默认宽度 220px，可拖拽边缘调整宽度，可折叠 |
| Canvas | 中央，填满剩余空间 |
| Properties | 右上，默认宽度 280px，可拖拽调整宽度，可折叠 |
| Assets | 右下，与 Properties 上下分栏，分隔线可拖拽调整比例 |
| StatusBar | 底部固定，高度 24px |

### 2.1 项目管理

| 功能 | 说明 |
|------|------|
| 新建项目 | 选择一个本地目录作为项目根目录，创建时设置画布分辨率（默认 1920×1080），自动生成 `project.yaml` 和 `assets/` 子目录 |
| 打开项目 | 选择一个项目目录（包含 `project.yaml` 的目录），自动加载主文件 |
| 保存 | Ctrl+S 保存，将编辑器状态写回 `project.yaml`。Toolbar 也有保存按钮 |
| 未保存标识 | 有未保存修改时，窗口标题栏显示 `*` 标记（如 `MainMenu *`） |
| 关闭确认 | 关闭窗口时若有未保存修改，弹出确认对话框（保存 / 不保存 / 取消） |
| 不做自动保存 | AI Agent 监听文件，频繁写入会触发大量 reload 提示，故不做自动保存 |
| 单界面 | 一个项目 = 一个目录 = 一个 UI 界面，不支持多页面 |
| 文件监听 | 监听 `project.yaml` 的外部变更（如 AI Agent 修改），弹出对话框提示用户处理（见下方） |
| 监听防抖 | 外部变更在用户正在进行连续操作（拖拽、resize、属性输入框聚焦）时延后提示，待操作结束后再弹对话框，避免打断操作。多次连续变更合并为一次提示 |

**文件监听冲突处理：**

当检测到 `project.yaml` 被外部修改时：
- **无未保存修改**：弹出对话框 → **重新加载** / **忽略本次变更**
- **有未保存修改**：弹出对话框，明确提示"你有未保存的修改，重新加载将丢弃这些修改" → **保存我的修改**（覆盖外部变更）/ **重新加载**（丢弃我的修改）/ **取消**

### 2.2 画布与视图

| 功能 | 说明 |
|------|------|
| 固定分辨率画布 | 按项目设定的分辨率显示，不做自适应/响应式 |
| 画布缩放 | 鼠标滚轮缩放，以鼠标指针位置为缩放中心。缩放范围 10% ~ 500% |
| 画布平移 | 中键拖拽 或 空格+左键拖拽 |
| 缩放快捷键 | Ctrl+0 重置为 100%，Ctrl+1 缩放到适合窗口（Fit to Window，画布四周保留约 5% 留白后取最小缩放比） |
| 画布外区域 | 画布外显示深灰色背景，与画布白色区域形成对比 |
| 网格与参考线 | 可选显示对齐网格（Ctrl+G 切换） |
| 实时预览 | 编辑器内所见即所得，元素按实际尺寸和位置渲染 |

**鼠标指针样式：**

| 场景 | 指针 |
|------|------|
| 默认 | 箭头 |
| 悬停可选中节点 | 手形 |
| 拖拽移动节点 | 十字移动光标 |
| 悬停 resize 手柄 | 对应方向双箭头（↔ ↕ ↗ ↘） |
| 平移画布 | 抓手 |

### 2.3 UI 控件

编辑器支持以下 **7 种基础控件**。

**画布渲染策略：**
- Image、Text、Panel、Button：完全所见即所得（WYSIWYG），按实际图片/文字/背景渲染。
- Slider、Toggle、InputField：**简化渲染**——显示背景图（如有）+ 控件类型标识图标和名称。不在编辑器内模拟交互组件的内部结构（如 Slider 的滑块位置、Toggle 的勾选状态），真实外观在引擎内预览。这样可显著降低渲染器复杂度。

#### 2.3.1 Image（图片）

| 属性 | 类型 | 说明 |
|------|------|------|
| assetId | string | 引用 `assets` 列表中的资源 ID |
| tint | string | 颜色叠加（hex，如 `#FFFFFF`），默认 `#FFFFFF`（无叠加） |

> 图片尺寸由公共属性 `width`/`height` 控制，始终拉伸填充（stretch）。
> `tint` 可用于实现禁用灰化、同一图片不同颜色复用等效果。Unity Image 和 Unreal Image Widget 均原生支持。
>
> **所有子对象（如 Button.background、Panel.background、Slider.trackImage、Toggle.checkmark 等）中的可选 `tint` 字段省略时，默认值均为 `#FFFFFF`（无叠加）。**
> **所有子对象中的可选 `assetId` 字段省略时，默认值为 `null`（渲染时视为无图片，显示占位或什么都不显示）。**
> 编辑器保存 YAML 时，对取默认值的字段可省略不写以保持文件简洁。

#### 2.3.2 Text（文字）

| 属性 | 类型 | 说明 |
|------|------|------|
| content | string | 文本内容 |
| fontSize | number | 字号（px） |
| color | string | 颜色（hex，如 `#FFFFFF`） |
| textAlign | enum | 水平对齐方式：`left` / `center` / `right`，默认 `left` |

#### 2.3.3 Button（按钮）

复合控件，由容器 + 可选 Image 背景 + 可选 Text 标签组成。`background` 和 `label` 是 Button 的固有组成部分（作为属性存在，**不在节点树中显示为子项**，仅在属性面板中编辑），`children` 是额外嵌套在按钮内的子节点（在节点树中显示）。

> Panel 的 `background` 同样作为属性存在，不显示为节点树子项。

| 属性 | 类型 | 说明 |
|------|------|------|
| background | object? | 按钮背景图片（可选），含 `assetId` 和可选 `tint` |
| label | object? | 按钮文字（可选），含 `content`、`fontSize`、`color`、`textAlign` |
| children | Node[] | 额外嵌套的子节点（可选） |

> Button 不绑定事件逻辑，仅做视觉布局。交互在引擎内手写。

#### 2.3.4 Panel（面板/容器）

纯布局容器，用于分组和嵌套。

| 属性 | 类型 | 说明 |
|------|------|------|
| background | object? | 背景图片（可选），含 `assetId` 和可选 `tint` |
| children | Node[] | 子节点列表 |

#### 2.3.5 Slider（滑动条）

| 属性 | 类型 | 说明 |
|------|------|------|
| trackImage | object? | 轨道背景图（可选），含 `assetId` 和可选 `tint` |
| fillImage | object? | 填充图（可选），含 `assetId` 和可选 `tint` |
| thumbImage | object? | 滑块图（可选），含 `assetId` 和可选 `tint` |
| direction | enum | `horizontal` / `vertical` |
| defaultValue | number | 默认值（0.0 - 1.0） |

#### 2.3.6 Toggle（开关）

| 属性 | 类型 | 说明 |
|------|------|------|
| background | object? | 背景图（可选），含 `assetId` 和可选 `tint` |
| checkmark | object? | 选中状态图（可选），含 `assetId` 和可选 `tint` |
| label | object? | 标签文字（可选），含 `content`、`fontSize`、`color`、`textAlign` |
| defaultOn | boolean | 默认是否选中 |

#### 2.3.7 InputField（输入框）

| 属性 | 类型 | 说明 |
|------|------|------|
| background | object? | 背景图（可选），含 `assetId` 和可选 `tint` |
| placeholder | object? | 占位文字（可选），含 `content`、`fontSize`、`color`、`textAlign` |
| text | object? | 输入文字样式（可选），含 `content`（默认输入值，可空）、`fontSize`、`color`、`textAlign` |

### 2.4 公共属性（所有节点共有）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | string | 节点唯一标识符，遵循变量命名规则 |
| name | string | 显示名称 |
| type | enum | `image` / `text` / `button` / `panel` / `slider` / `toggle` / `inputField` |
| x | number | 相对于父节点的 X 坐标（px） |
| y | number | 相对于父节点的 Y 坐标（px） |
| width | number | 宽度（px） |
| height | number | 高度（px） |
| pivot | enum | 节点自身的参考原点（见 2.5） |
| visible | boolean | 是否可见，默认 `true`。`false` 时节点完全不渲染、不参与点击命中、不出现在导出中（但仍保留在 YAML 中） |
| opacity | number | 不透明度，0.0 - 1.0，默认 `1.0`。仅影响视觉渲染，不影响点击命中。**不向子节点继承传递** |

### 2.5 布局系统

#### 定位方式

- **绝对定位**：所有节点的 `x`, `y` 相对于其父节点左上角
- **Pivot（参考原点）**：每个节点可设置 `pivot`，决定节点自身的参考原点

#### Pivot 枚举值

```
topLeft      topCenter      topRight
centerLeft   center         centerRight
bottomLeft   bottomCenter   bottomRight
```

Pivot 影响的是节点自身的参考原点——例如 `pivot: center` 表示节点的中心点位于 `(x, y)` 处。

> 注意：此处的 `pivot` 对应 Unity UGUI 中的 Pivot 概念，而非 Anchor。
> 导出到 Unity 时映射为 RectTransform.pivot，导出到 Unreal 时映射为 Widget Alignment。

#### 层级嵌套

- 支持父子嵌套，**最大 6 层**
- 仅 `panel` 和 `button` 类型可作为父节点
- 子节点坐标相对于父节点

#### 渲染顺序（z-order）

- 渲染顺序由 `children` 数组的排列顺序决定：**数组中靠后的元素渲染在上层**
- 编辑操作中的"上移/下移/置顶/置底"实际上是调整节点在父级 `children` 数组中的位置
- 不使用额外的 z-index 字段

### 2.6 编辑操作

#### 2.6.1 选中

| 场景 | 行为 |
|------|------|
| 单击节点 | 选中该节点，属性面板显示其属性 |
| Ctrl+点击 | 多选，追加/取消选中 |
| 框选 | 鼠标在画布空白处拖拽，完全包围的节点被选中 |
| 点击画布空白 | 取消所有选中 |
| 被遮挡的节点 | 默认选中最上层节点。Alt+点击 穿透选择下一层 |
| 嵌套选中策略 | 直接穿透选中——单击直接选中最上层节点（无论嵌套层级）。如需选中父容器，在节点树中点击 |
| 节点树同步 | 画布选中 ↔ 节点树选中 双向同步。节点树中选中时画布自动滚动到该节点 |
| Escape | 取消所有选中；如在拖拽中则取消拖拽，恢复原位 |

#### 2.6.2 创建节点

| 方式 | 说明 |
|------|------|
| 工具栏按钮 | Toolbar 中有 7 种控件的图标按钮，点击后在当前视口中央创建默认尺寸的节点 |
| 右键菜单 | 画布空白区域右键 → "添加控件" → 子菜单选择控件类型 → 在右键点击位置创建 |
| 资源拖入 | 从 Assets 面板拖拽图片到画布 → 在松手位置创建 Image 节点（仅 Image） |

**父节点规则：**
- 如果当前选中的是 Panel 或 Button，新节点作为其子节点
- 如果选中的是非容器节点（Image/Text 等），新节点与其同级（放入同一父节点）
- 如果无选中节点，新节点放入 root_panel 下

**新建节点默认值：**

| 控件 | 默认 width | 默认 height | 其他默认值 |
|------|-----------|------------|-----------|
| Image | 100 | 100 | assetId: null（显示灰色占位矩形），tint: "#FFFFFF" |
| Text | 200 | 40 | content: "Text"，fontSize: 24，color: "#FFFFFF"，textAlign: left |
| Button | 200 | 60 | background: null，label: {content: "Button", fontSize: 20, color: "#000000", textAlign: center} |
| Panel | 300 | 200 | background: null |
| Slider | 300 | 40 | direction: horizontal，defaultValue: 0.5，三个 image 均为 null |
| Toggle | 200 | 40 | defaultOn: false，background/checkmark: null，label: {content: "Toggle", fontSize: 16, color: "#FFFFFF", textAlign: left} |
| InputField | 300 | 50 | background: null，placeholder: {content: "Enter text...", fontSize: 16, color: "#999999", textAlign: left}，text: {fontSize: 16, color: "#FFFFFF", textAlign: left} |

所有新建节点公共默认值：pivot: topLeft，visible: true，opacity: 1.0。

**id / name 自动生成**：id 按 `{type}_{自增序号}` 生成（如 `image_1`、`text_2`），序号在当前项目内全局递增，保证唯一。name 与 id 相同，用户可随后修改。

#### 2.6.3 拖拽移动

| 场景 | 行为 |
|------|------|
| 普通拖拽 | 自由移动，更新 x/y |
| Shift+拖拽 | 锁定水平或垂直方向（取拖拽幅度较大的轴） |
| 方向键 | 每次移动 1px |
| Shift+方向键 | 每次移动 10px |
| 多选拖拽 | 拖任意一个选中节点，整组一起移动，保持相对位置 |
| 拖出父容器 | 允许溢出（游戏 UI 常见需求） |
| 拖到另一个 Panel 上 | 不自动改变父子关系（仅在节点树中拖拽才改变父子关系，避免误操作） |
| 对齐吸附 | 拖拽时显示对齐参考线（吸附到同级节点边缘/中心），吸附阈值 **5 屏幕像素**（不随画布缩放变化） |

#### 2.6.4 缩放（Resize）

| 场景 | 行为 |
|------|------|
| 手柄 | 选中节点显示 8 个手柄：4 角 + 4 边中点。角拖拽改宽高，边拖拽只改一个维度 |
| Shift+角拖拽 | 保持宽高比等比缩放 |
| 最小尺寸 | 宽高最小 10×10 px，防止缩到 0 |
| Pivot 行为 | 缩放时 pivot 点保持不动。如 pivot=center，从右下角拖拽放大，节点中心位置不变 |
| Text 缩放 | 只改 width/height 容器尺寸，fontSize 不变 |

#### 2.6.5 其他编辑操作

| 功能 | 快捷键 | 说明 |
|------|--------|------|
| 复制 | Ctrl+C | 复制选中节点（含子节点） |
| 粘贴 | Ctrl+V | 粘贴到当前选中容器下，位置偏移 (10, 10) 避免重叠，自动生成新 id |
| 原地复制 | Ctrl+D | 快速复制选中节点到同一父容器下，**位置偏移 (10, 10)**（与 Ctrl+V 行为一致），自动生成新 id |
| 全选 | Ctrl+A | 选中**当前容器**下所有直接子节点（不递归）。当前容器定义：若当前有选中节点，取其父节点；若无选中，取 root_panel |
| 删除 | Delete | 删除选中节点（含子节点） |
| 撤销 | Ctrl+Z | 至少 50 步历史；超出上限时丢弃最早记录 |
| 重做 | Ctrl+Shift+Z | — |

**撤销重做的颗粒度规则：**

- 拖拽移动 / Resize：**操作完成时（鼠标松开）** 入栈一次，不按帧入栈
- 属性输入框：**失焦或回车时** 入栈一次，连续输入合并
- 拖拽 label 调值：松开鼠标时入栈一次
- 锁定 / 解锁、节点树折叠状态、画布缩放/平移：**不入栈**（纯编辑器视图状态）
- 文件保存：不入栈，但保存后栈不清空（允许保存后继续撤销）
| 层级调整 | 右键菜单 | 上移/下移/置顶/置底（调整 children 数组位置） |
| 双击 Text | — | 进入文本内联编辑模式，直接在画布上修改文字内容。按 Enter 或点击外部确认。**需支持中文 IME 输入**（编辑期间组合字符不触发撤销入栈，确认后整体入栈一次） |

#### 2.6.6 右键菜单

**画布空白区域右键：**
- 添加控件 → Image / Text / Button / Panel / Slider / Toggle / InputField
- 粘贴（如有剪贴板内容）

**节点上右键：**
- 复制 / 粘贴 / 删除
- 上移 / 下移 / 置顶 / 置底
- 锁定 / 解锁（锁定后画布上不可选中/拖拽/缩放）

### 2.7 资源管理

| 功能 | 说明 |
|------|------|
| 导入 | 面板顶部"导入"按钮 → 打开文件选择对话框（支持多选 png/jpg）→ 复制到 `assets/` 目录 → 自动添加到 YAML 的 `assets` 列表 |
| 重名处理 | 导入时文件名已存在，提示覆盖/重命名/取消 |
| 资源列表 | 缩略图网格显示（缩略图 64×64 px，保持纵横比居中），鼠标悬停显示文件名和原始尺寸 |
| 搜索过滤 | 面板顶部搜索框，按文件名过滤 |
| 拖入画布 | 从资源列表拖拽图片到画布，松手位置作为节点 (x, y)，默认 width/height 等于图片原始尺寸，pivot 默认 topLeft |
| 删除资源 | 右键 → 删除。如果有节点正在引用该资源，弹出警告列出引用节点，确认后删除 |

> 图片文件保存在项目目录下的 `assets/` 子目录中。

### 2.8 工具栏（Toolbar）

```
[ 项目名称 ]  |  [Image][Text][Button][Panel][Slider][Toggle][InputField]  |  [保存] [导出 ▾] [设置]
```

| 区域 | 内容 |
|------|------|
| 左侧 | 项目名称显示（含未保存 `*` 标记） |
| 中间 | 7 种控件添加按钮（图标 + tooltip 提示控件名称），点击在视口中央创建节点 |
| 右侧 | 保存按钮（Ctrl+S）、导出按钮（下拉：Unity / Unreal）、设置按钮 |

**设置按钮内容**（点击打开设置对话框，含以下分页）：

| 分页 | 内容 |
|------|------|
| 项目 | 修改项目名称（meta.name）、修改画布分辨率（修改时弹确认"超出画布的节点可能显示异常"） |
| 编辑器 | 显示对齐网格默认开关、吸附阈值（默认 5px）、历史步数上限（默认 100） |
| 快捷键 | 快捷键参考表（只读，见附录 A） |
| 关于 | 版本号、Schema 版本、许可证信息 |

> 所有"编辑器"分页项属于本地偏好，保存在用户配置文件（如 `%APPDATA%/lwb-ui-editor/settings.json`），**不写入 project.yaml**。
> 仅"项目"分页项会修改 project.yaml 并计入未保存状态。

### 2.9 节点树面板（NodeTree）

| 功能 | 行为 |
|------|------|
| 展开/折叠 | Panel/Button 类型节点有展开/折叠箭头，点击切换 |
| 选中 | 点击节点 → 画布同步选中并滚动到该节点 |
| 可见性切换 | 每个节点右侧有眼睛图标，点击切换 `visible`，不影响子节点 |
| 锁定 | 每个节点有锁图标，锁定后画布上不可选中/拖拽/缩放（仅可通过属性面板编辑） |
| 拖拽排序 | 拖到节点之间 = 调整同级顺序（z-order）；拖到 Panel/Button 上 = 变为其子节点 |
| 拖拽限制 | 不允许拖入非容器节点下；不允许超过 6 层嵌套限制（超限时拒绝并 tooltip 提示） |
| 双击重命名 | 双击节点名称进入编辑模式，修改 `name` 属性 |
| 节点搜索 | 节点树面板顶部搜索框，按 `name` 或 `id` 实时过滤；命中节点高亮，路径上的父节点自动展开；空查询时恢复完整树 |
| 右键菜单 | 复制 / 粘贴 / 删除 / 上移 / 下移 / 置顶 / 置底 |

> **锁定状态不持久化到 YAML**——锁定是纯编辑器状态，不写入数据文件。
> 这样 AI Agent 生成的 YAML 不需要管理 locked 字段。每次打开项目时所有节点默认解锁。

### 2.10 属性面板（Properties）

#### 属性编辑控件

| 属性类型 | 编辑控件 |
|---------|---------|
| string（id, name, content） | 文本输入框 |
| number（x, y, width, height, fontSize） | 数字输入框。支持：拖拽 label 快速调值、方向键 ±1、Shift+方向键 ±10 |
| number（opacity, defaultValue） | 滑条 + 数字输入框 组合 |
| enum（type, pivot, textAlign, direction） | 下拉选择框 |
| boolean（visible, defaultOn） | 开关 / 复选框 |
| color（color, tint） | 色块预览 + 点击弹出取色器（支持 hex 输入和可视化选取） |
| assetId | 缩略图预览 + 下拉选择（列出所有 assets）+ 清除按钮 |

> **拖拽 label 调值**：用户在属性标签（如 "X:"）上按住鼠标左右拖拽即可快速改值，
> 比手打数字高效得多（Figma、Unity Inspector 均支持此交互）。

#### 多选编辑

- 多选时属性面板显示所有选中节点的共有属性
- 值不同的字段显示 "—"（混合值）
- 修改一个属性时应用到所有选中节点

#### 面板内容分组

属性面板内容按以下分组展示，每组可折叠：

| 分组 | 包含属性 |
|------|---------|
| 基础 | id, name, type |
| 变换 | x, y, width, height, pivot |
| 外观 | visible, opacity |
| 控件特有 | 根据 type 动态显示（如 Text 显示 content/fontSize/color/textAlign，Image 显示 assetId/tint） |

### 2.11 错误与异常处理

| 场景 | 行为 |
|------|------|
| 打开损坏的 YAML | 弹出错误对话框，显示解析错误信息和行号，不加载文件 |
| 低版本 Schema | 按版本号逐级执行升级脚本（v1→v2→…→当前），升级在内存中完成；**不自动写回磁盘**，需用户触发保存才会落盘。升级后弹提示"文件已从 vN 升级到 vM，保存后将转换为新格式" |
| 高版本 Schema | 遇到比编辑器更新的 schemaVersion 时拒绝加载，弹出"请升级编辑器版本"提示 |
| 重复 id | 保存时校验，弹出错误列表指出哪些节点 id 重复，阻止保存直到修正 |
| 资源文件丢失 | 画布上显示红色占位矩形 + "Missing: xxx.png" 文字提示 |
| assetId 引用无效 | 属性面板中 assetId 字段标红，画布上显示缺失占位 |
| 嵌套层级超限 | 节点树中拖拽时拒绝操作，tooltip 提示 "超过最大嵌套层级（6 层）" |
| id 格式非法 | 属性面板中输入框标红，tooltip 提示合法格式 |

### 2.12 导出

#### 2.12.0 导出操作流程

1. 用户点击 Toolbar 的 **导出** 按钮 → 下拉菜单选择 **Unity** 或 **Unreal**
2. 弹出 **导出设置对话框**：
   - 显示当前 `export` 配置项（资源路径、字体路径、字号缩放等）
   - 允许修改配置（修改后回写到 YAML 的 `export` 字段）
   - "选择导出位置" 按钮（选择 `.cs` 或 `.py` 文件保存路径）
3. 点击 **导出** 按钮
4. 导出完成后弹出 **成功提示**：
   - 导出文件路径
   - "打开所在文件夹" 按钮
   - 简要使用说明（如 "将此脚本放入 Unity 项目的 Editor 目录，通过菜单 Tools > LWB UI Import 执行"）

#### 2.12.1 Unity 导出

- 输出一个 **C# Editor 脚本**（`.cs` 文件）
- 该脚本在 Unity 2022 Editor 中执行，自动创建对应的 UGUI Canvas + Prefab
- 脚本内包含所有节点的层级、位置、尺寸、属性信息
- Canvas 配置：Render Mode = Screen Space - Overlay，Canvas Scaler = Scale With Screen Size，Reference Resolution 与画布分辨率一致
- 图片统一使用 **Image（Sprite）**，导出脚本自动将引用的 PNG 设置为 Sprite 纹理导入格式
- 导出脚本包含从 `sourceAssetPath` 复制图片到 Unity 项目 `assetRootPath` 的逻辑
- **重复导出策略**：覆盖同名 Prefab，用户在 Unity 内的手动修改会丢失（导出前弹确认提示）

#### 2.12.2 Unreal 导出

- 输出一个 **Unreal Editor Utility Python 脚本**（`.py` 文件）
- 该脚本在 Unreal Editor 中通过 Python 插件执行，自动创建 UMG Widget Blueprint
- CanvasPanel Slot 定位：显式调用 `set_auto_size(False)`，使用固定尺寸
- 导出脚本包含从 `sourceAssetPath` 复制图片到 Unreal 项目的逻辑
- **重复导出策略**：覆盖同名 Widget Blueprint，用户在 Unreal 内的手动修改会丢失（导出前弹确认提示）

> **风险提示**：Unreal Python API 对 UMG Widget Blueprint 的编程创建支持有限，
> 远不如 Unity C# Editor API 成熟。必须在 M0 阶段完成 POC 验证（见 7. 里程碑）。
> 若 Python API 不足，备选方案：
> - 方案 B：导出 C++ 代码（使用 UWidgetBlueprintLibrary C++ API）
> - 方案 C：导出 JSON + Unreal C++ Editor 插件导入

#### 2.12.3 导出映射——控件

| 编辑器控件 | Unity UGUI | Unreal UMG |
|-----------|------------|------------|
| Image | Image（Sprite） | Image Widget |
| Text | TextMeshProUGUI | TextBlock |
| Button | Button + Image + TMP | Button + Image + TextBlock |
| Panel | Empty GameObject (RectTransform) | CanvasPanel |
| Slider | Slider（见 2.12.5 复合层级） | Slider |
| Toggle | Toggle（见 2.12.5 复合层级） | CheckBox |
| InputField | TMP_InputField（见 2.12.5 复合层级） | EditableTextBox |

#### 2.12.4 导出映射——坐标与 Pivot

**坐标转换规则：**

| 属性 | 编辑器 | Unity UGUI | Unreal UMG |
|------|--------|-----------|------------|
| 坐标原点 | 父节点左上角，Y 向下 | anchorMin/Max=(0,1)，**Y 取反**（y → -y） | CanvasPanelSlot，左上角原点，Y 向下（一致） |
| 颜色 | hex `#RRGGBB` + opacity | `new Color(r/255, g/255, b/255, opacity)`，float 0~1 | `FLinearColor(r/255, g/255, b/255, opacity)` |

**Pivot 精确映射表：**

| 编辑器 pivot | Unity RectTransform.pivot | Unreal Alignment |
|-------------|--------------------------|------------------|
| topLeft | (0, 1) | (0, 0) |
| topCenter | (0.5, 1) | (0.5, 0) |
| topRight | (1, 1) | (1, 0) |
| centerLeft | (0, 0.5) | (0, 0.5) |
| center | (0.5, 0.5) | (0.5, 0.5) |
| centerRight | (1, 0.5) | (1, 0.5) |
| bottomLeft | (0, 0) | (0, 1) |
| bottomCenter | (0.5, 0) | (0.5, 1) |
| bottomRight | (1, 0) | (1, 1) |

> Unity pivot 坐标系：(0,0) = 左下角，(1,1) = 右上角。
> Unreal Alignment 坐标系：(0,0) = 左上角，(1,1) = 右下角。
> 两者 Y 轴方向相反。

#### 2.12.5 Unity 复合控件层级映射

以下控件在 Unity 中需要特定的 GameObject 层级结构，导出脚本必须按此结构创建：

**Slider：**
```
Slider (GameObject + Slider Component)
├── Background (Image)
├── Fill Area (RectTransform)
│   └── Fill (Image)           ← 对应编辑器 fillImage
└── Handle Slide Area (RectTransform)
    └── Handle (Image)         ← 对应编辑器 thumbImage
```

**Toggle：**
```
Toggle (GameObject + Toggle Component)
├── Background (Image)         ← 对应编辑器 background
│   └── Checkmark (Image)      ← 对应编辑器 checkmark
└── Label (TextMeshProUGUI)    ← 对应编辑器 label
```

**InputField：**
```
InputField (GameObject + TMP_InputField Component)
├── Text Area (RectTransform + RectMask2D)
│   ├── Placeholder (TextMeshProUGUI)  ← 对应编辑器 placeholder
│   └── Text (TextMeshProUGUI)         ← 对应编辑器 text
```

> Unreal 侧的 Slider、CheckBox、EditableTextBox 内部结构相对简单，
> 通过 Python API 设置属性即可，不需要手动构建子 Slot 层级。

#### 2.12.6 导出行为规则

| 规则 | 说明 |
|------|------|
| opacity 不继承 | `opacity` 仅控制当前节点自身，不向子节点传递。Unity 侧通过 `color.a` 实现（非 CanvasGroup.alpha） |
| 图片自动部署 | 导出脚本自动从 `sourceAssetPath` 复制图片到引擎项目对应目录 |
| Sprite 自动设置 | Unity 导出脚本自动将 PNG 的 TextureImporter 设为 Sprite 格式 |
| 字号缩放 | 支持 `fontSizeScale` 配置，应对三端渲染差异（默认 1.0） |
| 重复导出 | 覆盖同名资源，用户手动修改会丢失，导出前弹确认 |

---

## 3. 数据 Schema

### 3.1 项目文件结构

```
my-ui-project/
├── project.yaml          # 主文件，包含所有UI数据
└── assets/               # 图片资源目录
    ├── btn_bg.png
    ├── icon_star.png
    └── ...
```

### 3.2 YAML Schema 定义

```yaml
# project.yaml

# --- 项目元信息 ---
meta:
  name: "MainMenu"                # 项目/界面名称
  schemaVersion: 1                # Schema 版本号（整数，用于向前兼容）
  canvasWidth: 1920               # 画布宽度
  canvasHeight: 1080              # 画布高度

# --- 资源声明 ---
assets:
  - id: "btn_bg"                  # 资源ID（节点内引用此ID）
    path: "assets/btn_bg.png"     # 文件相对路径
    width: 200                    # 原始宽度（px）
    height: 60                    # 原始高度（px）

  - id: "icon_star"
    path: "assets/icon_star.png"
    width: 64
    height: 64

  - id: "panel_bg"
    path: "assets/panel_bg.png"
    width: 500
    height: 300

  - id: "slider_track"
    path: "assets/slider_track.png"
    width: 400
    height: 10
  - id: "slider_fill"
    path: "assets/slider_fill.png"
    width: 400
    height: 10
  - id: "slider_thumb"
    path: "assets/slider_thumb.png"
    width: 20
    height: 40
  - id: "toggle_bg"
    path: "assets/toggle_bg.png"
    width: 40
    height: 40
  - id: "toggle_check"
    path: "assets/toggle_check.png"
    width: 32
    height: 32
  - id: "input_bg"
    path: "assets/input_bg.png"
    width: 400
    height: 50

# --- 节点树（children 数组顺序 = 渲染顺序，靠后的在上层）---
nodes:
  - id: "root_panel"
    name: "Root"
    type: panel
    x: 0
    y: 0
    width: 1920
    height: 1080
    pivot: topLeft
    visible: true
    opacity: 1.0
    background: null
    children:

      - id: "title_text"
        name: "Title"
        type: text
        x: 960
        y: 100
        width: 400
        height: 60
        pivot: topCenter
        visible: true
        opacity: 1.0
        content: "Main Menu"
        fontSize: 48
        color: "#FFFFFF"
        textAlign: center

      - id: "start_btn"
        name: "StartButton"
        type: button
        x: 960
        y: 400
        width: 200
        height: 60
        pivot: center
        visible: true
        opacity: 1.0
        background:
          assetId: "btn_bg"
          tint: "#FFFFFF"
        label:
          content: "Start Game"
          fontSize: 24
          color: "#000000"
          textAlign: center
        children: []

      - id: "settings_panel"
        name: "SettingsPanel"
        type: panel
        x: 100
        y: 600
        width: 500
        height: 300
        pivot: topLeft
        visible: true
        opacity: 1.0
        background:
          assetId: "panel_bg"
        children:

          - id: "volume_slider"
            name: "VolumeSlider"
            type: slider
            x: 50
            y: 50
            width: 400
            height: 40
            pivot: topLeft
            visible: true
            opacity: 1.0
            direction: horizontal
            defaultValue: 0.8
            trackImage:
              assetId: "slider_track"
            fillImage:
              assetId: "slider_fill"
            thumbImage:
              assetId: "slider_thumb"

          - id: "mute_toggle"
            name: "MuteToggle"
            type: toggle
            x: 50
            y: 120
            width: 200
            height: 40
            pivot: topLeft
            visible: true
            opacity: 1.0
            defaultOn: false
            background:
              assetId: "toggle_bg"
            checkmark:
              assetId: "toggle_check"
            label:
              content: "Mute"
              fontSize: 18
              color: "#FFFFFF"
              textAlign: left

          - id: "player_name"
            name: "PlayerNameInput"
            type: inputField
            x: 50
            y: 200
            width: 400
            height: 50
            pivot: topLeft
            visible: true
            opacity: 1.0
            background:
              assetId: "input_bg"
            placeholder:
              content: "Enter name..."
              fontSize: 16
              color: "#999999"
              textAlign: left
            text:
              content: ""
              fontSize: 16
              color: "#FFFFFF"
              textAlign: left

# --- 导出配置 ---
export:
  # sourceAssetPath 在导出运行时由编辑器注入当前项目 assets 的绝对路径，不写回 YAML，
  # 避免项目目录移动后路径失效。
  unity:
    assetRootPath: "Assets/UI/MainMenu"     # Unity 项目内资源根路径
    defaultFont: "Assets/Fonts/Default.asset"  # TMP Font Asset 路径
    fontSizeScale: 1.0                      # 字号缩放系数（应对 TMP 渲染差异）
    renderMode: "ScreenSpaceOverlay"        # Canvas Render Mode
    referenceResolution: [1920, 1080]       # CanvasScaler Reference Resolution
    screenMatchMode: 0.5                    # CanvasScaler Width/Height 匹配比例
  unreal:
    assetRootPath: "/Game/UI/MainMenu"      # Unreal 项目内资源根路径
    defaultFont: "/Game/Fonts/Default"      # 字体资源路径
    fontSizeScale: 1.0                      # 字号缩放系数
```

### 3.3 Schema 规则摘要

| 规则 | 说明 |
|------|------|
| 根节点 | `nodes` 数组有且仅有一个根节点（type=panel），新建项目时自动创建，不可删除、不可改 type |
| `id` 全局唯一 | 符合变量命名规则 `[a-zA-Z_][a-zA-Z0-9_]*` |
| `type` 枚举 | `image`, `text`, `button`, `panel`, `slider`, `toggle`, `inputField` |
| `pivot` 枚举 | 9 个方位值（见 2.5） |
| `textAlign` 枚举 | `left`, `center`, `right` |
| `children` | 仅 `panel` 和 `button` 可包含 `children` |
| 嵌套层级 | 最大 6 层（root 算第 1 层） |
| 资源引用 | 通过 `assetId` 引用 `assets` 列表中的 `id` |
| 渲染顺序 | 由 `children` 数组顺序决定，靠后的元素渲染在上层 |
| 坐标系 | 原点在左上角，X 向右，Y 向下 |
| 单位 | 全部使用 px（像素） |
| opacity | 仅控制当前节点自身，不向子节点继承传递 |
| 字体 | 节点不指定字体，在 `export` 配置中按引擎设置全局默认字体 |
| 版本兼容 | `schemaVersion` 为整数。编辑器遇到低版本文件时自动升级 |

### 3.4 AI Agent 对接说明

AI Agent（如 Figma 导出工具）可通过以下方式与编辑器对接：

1. **创建项目** — 在目标目录下创建 `project.yaml` + `assets/` 目录结构，遵循上述 Schema
2. **修改现有项目** — 直接编辑 `project.yaml`，增删改节点
3. **管理资源** — 将图片文件放入 `assets/` 目录，并在 `assets` 列表中声明
4. **实时联动** — 编辑器监听 `project.yaml` 文件变更，AI Agent 修改后编辑器提示用户重新加载

无需 API 接口，文件即接口。

---

## 4. 技术方案

### 4.1 架构

```
Tauri 2 桌面应用
├── 前端: Vue 3 + TypeScript（Webview 内运行）
├── 壳层: Tauri 2（Rust，仅用于系统能力调用，几乎无自定义 Rust 代码）
├── 画布渲染: HTML5 Canvas (Konva.js)
├── 数据层: YAML 文件 ↔ 内存对象模型 ↔ 画布渲染
├── 文件操作: Tauri 文件系统插件（原生读写，无需浏览器授权）
└── 构建: Vite + Tauri CLI
```

### 4.2 技术选型

| 模块 | 方案 | 说明 |
|------|------|------|
| 桌面壳 | Tauri 2 | 轻量桌面容器，原生文件系统访问 |
| 前端框架 | Vue 3 + TypeScript | 轻量、开发效率高，AI 代码生成友好 |
| 画布渲染 | HTML5 Canvas (Konva.js) | 适合拖拽、缩放等交互 |
| YAML 解析 | js-yaml | 浏览器端 YAML 读写 |
| 文件读写 | @tauri-apps/plugin-fs | 原生文件系统访问 |
| 文件对话框 | @tauri-apps/plugin-dialog | 原生目录/文件选择对话框 |
| 文件监听 | @tauri-apps/plugin-fs (watch API) 或社区 tauri-plugin-fs-watch | 监听 project.yaml 外部变更，开发时确认可用方案 |
| 撤销重做 | 自实现命令模式（Command Pattern） | 简单可控 |
| 构建工具 | Vite | 快速开发 |
| 打包分发 | Tauri bundler | 生成 Windows 安装包 |

### 4.3 项目结构

```
lwb-ui-editor/
├── src/                          # 前端源码（Vue 3 + TypeScript）
│   ├── core/
│   │   ├── schema.ts             # YAML Schema 类型定义
│   │   ├── project.ts            # 项目加载/保存/校验
│   │   ├── history.ts            # 撤销重做（Command Pattern）
│   │   └── fileService.ts        # Tauri 文件操作封装
│   ├── canvas/
│   │   ├── renderer.ts           # 画布渲染
│   │   ├── selection.ts          # 选中/多选/框选
│   │   ├── transform.ts          # 拖拽移动/缩放
│   │   └── guides.ts             # 对齐参考线
│   ├── panels/
│   │   ├── NodeTree.vue          # 左侧节点树
│   │   ├── Properties.vue        # 右侧属性面板
│   │   ├── Assets.vue            # 资源管理面板
│   │   └── Toolbar.vue           # 顶部工具栏
│   ├── export/
│   │   ├── unity.ts              # Unity C# 脚本生成
│   │   └── unreal.ts             # Unreal Python 脚本生成
│   └── App.vue
├── src-tauri/                    # Tauri 壳层（Rust，极少自定义代码）
│   ├── src/
│   │   └── main.rs               # Tauri 入口，注册插件
│   ├── Cargo.toml
│   └── tauri.conf.json           # Tauri 配置（窗口尺寸、权限等）
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### 4.4 开发语言说明

| 部分 | 语言 | 代码量占比 |
|------|------|-----------|
| 前端（编辑器核心逻辑） | TypeScript + Vue 3 | ~98% |
| 桌面壳层 | Rust（Tauri 2 脚手架代码） | ~2%（几乎全是模板代码，无需手写） |

> Tauri 2 提供的 `plugin-fs`、`plugin-dialog` 等插件已覆盖核心系统能力需求，
> 文件监听功能需在 M0 阶段验证具体可用方案（`plugin-fs` watch API 或社区插件）。
> 无需编写自定义 Rust 代码。所有业务逻辑均在 TypeScript 层实现。

---

## 5. 非功能需求

| 项目 | 要求 |
|------|------|
| 目标平台 | Windows 10+（主要目标） |
| 性能 | 画布内 300 个节点时操作流畅（60fps） |
| 安装包体积 | < 15MB（Tauri 应用典型范围） |
| 离线可用 | 完全离线运行，不依赖任何网络服务 |
| 数据安全 | 所有数据本地存储，不上传任何内容 |

---

## 6. 不做的事情（明确排除）

- ❌ 矢量图形编辑
- ❌ 动画/过渡效果
- ❌ 事件/交互逻辑绑定
- ❌ 自适应/响应式布局
- ❌ Flex / Grid 布局
- ❌ ScrollView 滚动容器（未来版本可能支持）
- ❌ 富文本 / 描边 / 阴影等高级文字效果
- ❌ 九宫格切图
- ❌ 多人协作
- ❌ 后端服务 / Web 部署
- ❌ 多页面管理
- ❌ 跨平台（仅 Windows）
- ❌ 两端引擎的完美自动匹配（允许手动修补差异）

---

## 7. 里程碑建议

| 阶段 | 内容 |
|------|------|
| M0 - 工程搭建与 POC | 见下方 M0 详细任务列表 |
| M1 - 基础编辑器 | 画布渲染、节点拖拽、属性编辑、节点树、YAML 读写、项目目录管理 |
| M2 - 完整控件 | 7 种控件全部可用、资源管理、撤销重做 |
| M3 - Unity 导出 | C# Editor 脚本生成、坐标/Pivot 映射、复合控件层级、Unity 内验证 |
| M4 - Unreal 导出 | Python 脚本生成（或备选方案）、Unreal 内验证 |
| M5 - 打磨 | 对齐辅助、文件监听、快捷键、用户体验优化 |

### M0 详细任务

| # | 验证项 | 目的 | 通过标准 |
|---|--------|------|---------|
| 0.1 | Tauri 2 + Vue 3 项目初始化 | 基础工程可运行 | 窗口正常启动，Vite dev 模式热更新正常 |
| 0.2 | Tauri 文件读写验证 | 确认 plugin-fs、plugin-dialog 可用 | 能选择目录、读写 YAML 文件 |
| 0.3 | 文件监听方案验证 | 确认可用的文件监听方案 | 外部修改 YAML 后编辑器能检测到变更 |
| 0.4 | Unity C# Editor 脚本 POC | 验证 Unity API 可用性 | 用硬编码 C# 脚本创建 Canvas + Image + Text + Button Prefab |
| 0.5 | Unity Sprite 自动设置 POC | 验证纹理导入格式自动设置 | C# 脚本能将 PNG 的 TextureImporter 设为 Sprite 格式 |
| 0.6 | Unity 复合控件 POC | 验证 Slider/Toggle/InputField 层级创建 | C# 脚本能创建正确的复合控件层级结构 |
| 0.7 | Unity 坐标/Pivot 映射验证 | 验证 Y 轴取反和 Pivot 映射 | 编辑器坐标 (100, 200) pivot=center 在 Unity 中位置正确 |
| 0.8 | **Unreal Python 脚本 POC** | **验证 UMG Python API 可行性（最大风险点）** | 用 Python 创建 Widget Blueprint + CanvasPanel + Image + TextBlock + Button |
| 0.9 | Unreal CanvasPanel Slot POC | 验证定位模型 | set_position/set_size/set_alignment/set_auto_size(False) 均可用 |
| 0.10 | Konva.js 画布性能 POC | 验证 300 节点下交互流畅度 | 生成 300 个随机节点，拖拽/缩放/平移帧率 ≥ 55fps |
| 0.11 | 中文 IME 输入验证 | Windows 下中文输入法在 Canvas 内联编辑、属性输入框中正常工作 | 使用微软拼音输入中文，组合字符不误触快捷键，确认后文本正确 |

> **M0.8 是整个项目的关键决策点。** 如果 Unreal Python API 无法满足需求，
> 需在此阶段决定切换到备选方案（C++ 代码导出 或 JSON + C++ Editor 插件），
> 并相应调整 M4 的工作量评估。

---

## 附录 A：快捷键汇总

| 快捷键 | 功能 | 所属章节 |
|--------|------|---------|
| **文件操作** | | |
| Ctrl+S | 保存项目 | 2.1 |
| **画布视图** | | |
| 滚轮 | 画布缩放（以鼠标位置为中心） | 2.2 |
| 中键拖拽 / 空格+左键拖拽 | 画布平移 | 2.2 |
| Ctrl+0 | 重置缩放为 100% | 2.2 |
| Ctrl+1 | 缩放到适合窗口（Fit to Window） | 2.2 |
| Ctrl+G | 切换显示对齐网格 | 2.2 |
| **选中** | | |
| 单击 | 选中节点 | 2.6.1 |
| Ctrl+点击 | 多选，追加/取消选中 | 2.6.1 |
| Alt+点击 | 穿透选择下一层（被遮挡的节点） | 2.6.1 |
| Ctrl+A | 全选当前容器下所有直接子节点（当前容器 = 选中节点的父节点；无选中时为 root_panel） | 2.6.5 |
| Escape | 取消选中 / 取消拖拽 | 2.6.1 |
| **移动** | | |
| 拖拽 | 自由移动节点 | 2.6.3 |
| Shift+拖拽 | 锁定水平/垂直方向 | 2.6.3 |
| 方向键 | 移动 1px | 2.6.3 |
| Shift+方向键 | 移动 10px | 2.6.3 |
| **编辑** | | |
| Ctrl+C | 复制 | 2.6.5 |
| Ctrl+V | 粘贴 | 2.6.5 |
| Ctrl+D | 原地复制 | 2.6.5 |
| Delete | 删除 | 2.6.5 |
| Ctrl+Z | 撤销 | 2.6.5 |
| Ctrl+Shift+Z | 重做 | 2.6.5 |
| **缩放（Resize）** | | |
| 角手柄拖拽 | 改变宽高 | 2.6.4 |
| 边手柄拖拽 | 改变单个维度 | 2.6.4 |
| Shift+角拖拽 | 等比缩放 | 2.6.4 |
