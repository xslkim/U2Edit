# Figma → LWB UI Editor 项目生成指南

> 版本: v2.1
> 适用对象: 具备 Figma MCP / REST API 访问能力的 AI Agent
> 目标: 读取 Figma 文件数据 → 与用户确认关键选项 → 生成可被 LWB UI Editor 直接打开的项目目录
> 权威依据: 以 `docs/requirements.md` §2.3–§2.5 / §3.2–§3.3 + `src/core/schema.ts` + `src/export/unity.ts` 为准

---

## 0. 系统角色 `<SYSTEM_ROLE>`

你是一个 AI Agent，负责读取 Figma 文件数据（通过 MCP 或 REST API）并生成一个完整的 **LWB UI Editor 项目目录**。

**必须遵守：**
- 严格遵循本文档的 schema、字段命名、枚举值、坐标系、烘焙规则
- 在明确需要时**主动向用户提问**（见 §2）
- 在生成 `project.yaml` 之前，**先呈现映射草案并等待用户确认**
- 输出前跑一遍 §14 校验清单

**绝对禁止：**
- 在未确认页面 / 输出目录 / 映射草案的情况下直接写文件
- 使用 LWB 未支持的 type / pivot 枚举值
- 擅自改变根节点结构（`nodes` 数组必须恰好 1 个根 `panel`）

---

## 1. 总流程 `<WORKFLOW>`

```
[S1] 获取 Figma 文件数据（MCP 或 REST API）
  ↓
[S2] 主动询问用户：要导出哪些页面？输出目录放哪里？（如未指定）
  ↓
[S3] 选定一个 Frame，分析其所有子节点，生成映射草案（含烘焙计划）
  ↓
[S4] 向用户展示映射草案；逐个确认 ⚠️ 模糊节点；等待用户 OK / 修正
  ↓
[S5] 执行资源导出 + 烘焙（调用 Figma Images API，scale=1）
  ↓
[S6] 生成 project.yaml；跑 §14 校验清单
  ↓
[完成] 返回输出目录绝对路径 + 资产数量 + 警告列表
```

> **关键原则：先确认，再生成。** S2 和 S4 是两个硬暂停点，不得跳过。
>
> **单次任务 = 单个 Frame = 单个 LWB 项目。** 要导出多个页面 → 多次运行本流程。

---

## 2. 主动询问规则 `<USER_CONFIRMATION>`

以下三类信息必须在生成前明确；若用户未在请求里提供，**必须主动追问**。

### 2.1 页面（Frame）选择 — 在 S2 询问

触发条件：用户没有明确指定要导出哪个 Frame，且文件中存在多个顶层 Frame。

向用户输出格式：

```
Figma 文件 "{fileName}" 中有 {N} 个顶层 Frame，请问本次要导出哪一个？

  1. {FrameName_1}   ({W}×{H})
  2. {FrameName_2}   ({W}×{H})
  ...

（本工具一次只处理一个 Frame；如需导出多个页面，请分多次执行。）
```

- 如果只有 **1 个** 顶层 Frame，可以直接使用它，无需询问，但在映射草案里告知"已自动选中唯一 Frame: X"。
- 如果用户一次点了多个，明确告知"请先选一个开始，剩余的我记录下来下次继续"。

### 2.2 输出目录 — 在 S2 询问

触发条件：用户没有指定输出路径。

询问格式：

```
项目将输出到哪个目录？（会在该目录下创建子文件夹 "{ProjectName}/"）

当前默认候选：
  A. ./projects/{ProjectName}/
  B. 用户自定义路径

请告知，或直接回复 "A" 采用默认。
```

- `{ProjectName}` = Figma Frame 名称，小写化、空格 → `_`、去除非 `[a-z0-9_]` 字符。
- 如果转换后为空或以数字开头，使用 `project_{yyyyMMdd_HHmm}`，并在询问里标注。

### 2.3 映射草案确认（含 ⚠️ 模糊节点）— 在 S4 询问

见 §3 的草案格式。对每一个被标 ⚠️ 的节点，**必须逐一让用户确认类型**，不得静默默认。

同时在草案里**公开烘焙计划**（哪些节点要烘焙成 PNG、哪些直接用字段），让用户可以减少误烘焙。用户可以：
- 同意全部 → 回复 "确认"
- 修改某节点类型 → 例如 `Group_42 改为 button`
- 调整烘焙决定 → 例如 `SettingsPanel 背景保留为纯色+圆角字段，不要烘焙`

---

## 3. 输出目录结构 `<OUTPUT_STRUCTURE>`

```
{ProjectName}/
├── project.yaml        # 唯一必需文件，所有数据的 single source of truth
└── assets/             # 图片资源目录（如果存在任何资产）
    ├── {asset_name}.png
    └── ...
```

LWB UI Editor 打开时选择包含 `project.yaml` 的目录即可加载。

---

## 4. 节点类型映射 `<NODE_TYPE_MAPPING>`

LWB 仅支持 7 种节点类型：`image` | `text` | `button` | `panel` | `slider` | `toggle` | `inputField`

### 4.1 判断顺序

**先看命名约定，命名不明确再看结构特征；结构也不明确默认为 `panel` 并标 ⚠️。**

### 4.2 命名约定（关键词包含即匹配，大小写不敏感）

按优先级从高到低（第一个匹配的胜出）：

| 优先级 | 关键词                                                  | 映射类型        |
|-------|--------------------------------------------------------|---------------|
| 1     | `toggle`, `checkbox`, `开关`, `勾选`                    | `toggle`      |
| 2     | `slider`, `滑动`, `进度条`, `音量`                       | `slider`      |
| 3     | `input`, `field`, `输入框`, `inputfield`                 | `inputField`  |
| 4     | `btn`, `button`, `按钮`                                 | `button`      |
| 5     | `text`, `label`, `title`, `txt`, `文字`, `标题`          | `text`        |
| 6     | `img`, `image`, `icon`, `图片`, `图标`                   | `image`       |
| 7     | `panel`, `container`, `bg`, `background`, `面板`, `背景`, `容器` | `panel` |

例：`toggle_btn` → `toggle`（优先级 1 > 4），不是 `button`。

### 4.3 结构推断（命名不匹配时回退）

| Figma 节点 + 结构特征                                                                    | LWB 类型       |
|---------------------------------------------------------------------------------------|--------------|
| `TEXT` 节点                                                                            | `text`       |
| `RECTANGLE` / `ELLIPSE` / `VECTOR` / `BOOLEAN_OPERATION`，无子节点                       | `image`      |
| `FRAME` / `COMPONENT` / `GROUP`，恰好 1 个 `TEXT` 子 + 1 个形状子（或仅 fills）              | `button`     |
| `FRAME` / `COMPONENT`，水平细长矩形（高/宽 < 0.15）+ 小圆形子节点                           | `slider`（horizontal） |
| `FRAME` / `COMPONENT`，垂直细长矩形（宽/高 < 0.15）+ 小圆形子节点                           | `slider`（vertical）   |
| `FRAME` / `COMPONENT`，近正方形背景 + 更小的正方形/勾形子 + 可选 `TEXT` 子                    | `toggle`     |
| `FRAME` / `COMPONENT`，横向宽矩形背景（宽 > 80% 容器宽）+ 无图标子 + 可选 placeholder `TEXT`   | `inputField` |
| `FRAME` / `GROUP`，多个混合类型子节点                                                    | `panel`      |
| `INSTANCE`（组件实例）                                                                  | 递归应用以上规则到其 main component |
| 以上都不匹配                                                                             | `panel` + ⚠️ 待用户确认 |

### 4.4 映射草案输出格式（S4 呈现给用户）

```
已分析 Figma Frame "{FrameName}"，画布 {W}×{H}，共 {N} 个节点。
映射草案如下：

缩进层级    Figma 图层名称         推断类型      推断依据                         背景处理
─────────────────────────────────────────────────────────────────────────────────
(root)      {layer_name}          panel         Frame 根节点 [画布 {W}×{H}]        字段：纯色 #RRGGBB + 圆角 8
  ├─        {layer_name}          text          TEXT 节点                         —
  ├─        {layer_name}          button        命名含 "btn"                       字段：图片 btn_bg.png + tint
  ├─        {layer_name}          panel         命名含 "panel"                     ⚠ 烘焙：含多层+阴影，无法字段化
  │  ├─     {layer_name}          slider        命名含 "slider"                    字段：track + fill + thumb
  │  └─     {layer_name}          toggle        命名含 "toggle"                    字段：background + checkmark
  └─ ⚠️     {layer_name}          panel         无法确定，默认 panel                 —（请先确认类型）

图片资源将导出（{asset_count} 张）：
  {figma_layer_name} → assets/{filename}.png ({W}×{H}px)   [含效果: 阴影/渐变]
  ...

是否确认以上映射？
  - 回复 "确认" 继续
  - 或告知要修改的节点，例如："Group_42 改为 button；SettingsPanel 不要烘焙"
```

---

## 5. 坐标 / 颜色 / 可见性转换 `<COORDINATE_COLOR_RULES>`

### 5.1 坐标系

- 画布原点左上角，X 向右、Y 向下（与 Figma 一致）
- **所有节点默认 `pivot: topLeft`**，`(x, y)` 即节点左上角相对父节点左上角的偏移
- 其他 8 种 pivot 值（见 §13）也合法，但除非 Figma 里有明显的"中心对齐/右对齐布局"诉求，一律生成 `topLeft`

根节点（被选中的那个 Frame 自身）：

```
x = 0
y = 0
width  = round(Frame.absoluteBoundingBox.width)
height = round(Frame.absoluteBoundingBox.height)
pivot  = topLeft
```

其他所有节点：

```
x      = round(node.absoluteBoundingBox.x - parent.absoluteBoundingBox.x)
y      = round(node.absoluteBoundingBox.y - parent.absoluteBoundingBox.y)
width  = max(1, round(node.absoluteBoundingBox.width))
height = max(1, round(node.absoluteBoundingBox.height))
```

### 5.2 可见性与不透明度

| LWB 字段    | 来源                                | 备注                            |
|-----------|-----------------------------------|-------------------------------|
| `visible` | `node.visible ?? true`            | 隐藏图层**保留节点**，写 `false` |
| `opacity` | `round(node.opacity ?? 1.0, 2)`  | 范围 `0.00 ~ 1.00`，两位小数。**不向子节点继承** |

若 `node.opacity` 与 `fills[0].opacity` 都存在，取它们的乘积写入节点 `opacity` 字段。

### 5.3 颜色转换

Figma 颜色格式：`{ r, g, b, a }`，各分量 `0.0 ~ 1.0`。

转换为 LWB hex（**丢弃 alpha 通道**，改用 `opacity` / `bgOpacity` 承载）：

```
hex = "#" + toHex(round(r*255)) + toHex(round(g*255)) + toHex(round(b*255))
toHex(n) = 两位大写十六进制，不足补 0
```

示例：
- `{r:1.0, g:1.0, b:1.0, a:1.0}` → `#FFFFFF`
- `{r:1.0, g:0.502, b:0.0, a:0.5}` → `#FF8000`（alpha 0.5 → `opacity` 或 `bgOpacity`）

填充色来源优先级：
1. `node.fills[0].color`（当 `fills` 存在且 `type == SOLID`）
2. 默认 `"#FFFFFF"`

若 `fills[0].type` 是 `GRADIENT_LINEAR / GRADIENT_RADIAL / GRADIENT_ANGULAR` 或 `IMAGE` 且节点不能通过 `background` 字段原生表达（见 §6）→ 该节点的视觉必须**烘焙为 PNG**，`tint: "#FFFFFF"`。

---

## 6. ★ 渲染效果处理规则 `<RENDER_HANDLING>`

> LWB 中 **`panel` / `button` / `image` / `slider` / `toggle` / `inputField` 都有完整的视觉渲染能力**（见 `docs/requirements.md` §2.3：Image、Text、Panel、Button 完全所见即所得）。本章规则基于"**字段优先，无法字段化时才烘焙**"的原则，同时避免烘焙破坏 LWB 的可编辑性。

### 6.1 LWB `background` / `*Image` 字段原生支持的表达能力

`AssetTintRef`（所有带 background 的类型共用）能原生表达：

| 能力         | 字段                | 说明                                                  |
|------------|-------------------|----------------------------------------------------|
| 单张图片       | `assetId`         | 引用 `assets` 列表里的 PNG                                 |
| 纯色填充       | `assetId: null` + `tint` | 编辑器和 Unity 导出都支持（渲染成纯色矩形）               |
| 颜色叠色       | `tint`            | 对 assetId 指向的图片做颜色乘法叠加；hex `#RRGGBB`           |
| 独立透明度     | `bgOpacity`       | 背景自身的 alpha（0.0–1.0），**不影响子节点**；默认 1.0        |
| 圆角矩形       | `borderRadius`（panel/button 顶层） | 像素值，整数；默认 0                                |

**超出以上能力的都算"有复杂渲染效果"，需要烘焙。**

### 6.2 什么算"有复杂渲染效果"（需要烘焙为 PNG）

以下任意一条满足 → 必须烘焙成一张 PNG，结果放进该节点的 `background.assetId`（或对应的 `*Image.assetId` / `image.assetId`）：

1. `node.effects[]` 含 `DROP_SHADOW` / `INNER_SHADOW` / `LAYER_BLUR` / `BACKGROUND_BLUR`
2. `node.fills[]` 有多条且都可见（LWB 只能表达单张图或单一纯色）
3. `node.fills[0].type` 为 `GRADIENT_LINEAR / RADIAL / ANGULAR / DIAMOND`（渐变填充）
4. `node.fills[0].type` 为 `IMAGE` 且 `scaleMode != FILL`（LWB 默认拉伸填充；非 FILL 模式如 TILE/FIT 无法表达）
5. `node.strokes[]` 非空且 `strokeWeight > 0`（描边，LWB 无描边字段）
6. `node.blendMode` 不是 `PASS_THROUGH` / `NORMAL`
7. `node.isMask == true` 或被其他节点 mask 裁剪（非矩形剪切）
8. 节点非矩形（如圆形 `ELLIPSE`、多边形 `VECTOR`、`BOOLEAN_OPERATION`、`STAR`）且被映射到非 `image` 类型时
9. 节点同时含"圆角 + 图片 + 其他视觉组合"，但 `borderRadius` + 单图片已覆盖不了（例：左上右下只圆两角、分别不同半径等）

### 6.3 按节点类型的具体处理策略

#### 6.3.1 `panel` / `button`

**策略：字段优先 → 复杂效果烘焙进同一字段。**

| Figma 情况                                                       | LWB 输出                                                                |
|-----------------------------------------------------------------|-----------------------------------------------------------------------|
| Frame 完全透明（无 fills / effects / strokes）                     | `background: null`                                                    |
| 纯色填充（`SOLID`），可选带统一圆角                                 | `background: { assetId: null, tint: "#RRGGBB", bgOpacity: <alpha> }`；`borderRadius: <px>` |
| 单张位图填充（`IMAGE`，FILL 模式），可选带统一圆角                   | `background: { assetId: "<id>", tint: "#FFFFFF", bgOpacity: <alpha> }`；`borderRadius: <px>` |
| 满足 §6.2 任一条 → 烘焙                                           | **整个 Frame（含所有仅装饰用的子图层）扁平化为 1 张 PNG** → `background: { assetId: "<baked_id>", tint: "#FFFFFF" }`；`borderRadius: 0` |

> 烘焙 Panel/Button 时，**临时隐藏**会作为 LWB 子节点保留下来的图层（即已被映射到 LWB 的子节点），只保留"纯装饰 / 未映射"的图层参与扁平化。如果 Figma API 不方便隐藏，退而求其次：整个 Frame 一起扁平化，并在草案里标注"存在叠加风险，如有异常请手动调整子节点位置或属性"。

#### 6.3.2 `image`

- Figma 节点自身（不论简单或复杂）→ 整体导出为 PNG → `image.assetId`
- `tint` 取 `fills[0].color` 的 hex（若是 SOLID）；否则 `#FFFFFF`

#### 6.3.3 `slider`

- `trackImage` / `fillImage` / `thumbImage` **分别对应** Figma 内部的三个子图层（轨道 / 已填充进度 / 把手）
- 每个子图层独立判断 §6.2：简单的直接用 PNG，复杂效果就烘焙含效果的 PNG（结果仍放进对应字段）
- `direction`：`width > height` → `horizontal`，否则 `vertical`
- `defaultValue`：固定 `0.5`
- 若某个子图层缺失 → 该字段写 `null`

#### 6.3.4 `toggle`

- `background` / `checkmark` 分别对应 Figma 内部的背景层和选中层
- `label` **是必需字段**（LWB schema 强制）：
  - 若 Figma 有对应 TEXT 子节点 → 从中提取 `content` / `fontSize` / `color` / `textAlign`
  - 若 Figma **没有** TEXT 子节点 → 写默认值 `{ content: "Toggle", fontSize: 16, color: "#FFFFFF", textAlign: "left" }`，**不可省略整块**
- `defaultOn`：固定 `false`

#### 6.3.5 `inputField`

- `background` 同上
- `placeholder` 和 `text` **都是必需字段**：
  - 有 placeholder TEXT → 提取 `content` / `fontSize` / `color` / `textAlign`
  - 无 placeholder TEXT → 写默认 `{ content: "Enter text...", fontSize: 16, color: "#999999", textAlign: "left" }`
  - `text.content` 始终为 `""`（初始输入值留空）；其余样式默认 `{ fontSize: 16, color: "#FFFFFF", textAlign: "left" }` 或取自输入框内已有文字样式

#### 6.3.6 `text`

- 默认**不烘焙**，通过 `content` + `fontSize` + `color` + `textAlign` 表达（LWB 不支持富文本/描边/阴影/渐变文字，见 requirements §6）
- **例外**：TEXT 节点带描边 / 阴影 / 发光 / 渐变 / 变形（旋转/倾斜）→ 降级为 `image`，烘焙为 PNG；在草案里 ⚠️ 提示"TEXT 节点 '{name}' 含复杂样式，已降级为 image。如需保留文字语义请告知，我将忽略效果保留为 text。"

### 6.4 烘焙 asset 的命名

- 文件名生成规则见 §8.2
- Panel/Button 烘焙背景：`{node_name_slug}_bg.png`
- slider 各层：`{node_name_slug}_track.png` / `_fill.png` / `_thumb.png`
- toggle 各层：`{node_name_slug}_bg.png` / `_check.png`
- inputField 背景：`{node_name_slug}_bg.png`

---

## 7. 各节点类型字段规范 `<FIELD_SPEC>`

### 7.1 公共字段（所有 7 种类型都有）

| 字段       | 类型     | 说明                                                                 |
|---------|--------|--------------------------------------------------------------------|
| `id`    | string | `{type}_{全局计数}`，例如 `panel_1` / `text_3`；必须符合 `[a-zA-Z_][a-zA-Z0-9_]*`，全局唯一 |
| `name`  | string | Figma 图层名称原文（允许中文/空格）                                            |
| `type`  | enum   | `image` / `text` / `button` / `panel` / `slider` / `toggle` / `inputField` |
| `x`     | int    | 见 §5.1                                                              |
| `y`     | int    | 见 §5.1                                                              |
| `width` | int    | ≥ 1                                                                 |
| `height`| int    | ≥ 1                                                                 |
| `pivot` | enum   | 默认 `"topLeft"`；其他 8 种值合法但一般无需使用                                 |
| `visible` | bool | 见 §5.2                                                              |
| `opacity` | float| `0.00 ~ 1.00`                                                       |

### 7.2 `AssetTintRef`（被 background / trackImage / fillImage 等共用）

```yaml
assetId: string | null   # null 表示"纯色背景"，由 tint 提供颜色；或"无"时整个 AssetTintRef 父字段本身为 null
tint:    string          # hex "#RRGGBB"；默认 "#FFFFFF"
bgOpacity: float         # 可选；0.0–1.0；背景自身透明度（不影响子节点）；默认 1.0，取默认值时可省略不写
```

### 7.3 `image`

| 字段         | 类型            | 来源 / 默认                                 |
|-----------|---------------|----------------------------------------|
| `assetId` | string / null | 对应 assets 列表中的 id；导出失败时 `null`         |
| `tint`    | string        | `fills[0].color` → hex；默认 `#FFFFFF`    |

**无 `children` 字段。**

### 7.4 `text`

| 字段          | 类型    | 来源 / 默认                                                  |
|------------|-------|---------------------------------------------------------|
| `content`  | string| `node.characters`；默认 `"Text"`                            |
| `fontSize` | int   | `round(node.style.fontSize)`；默认 `24`                     |
| `color`    | string| `fills[0].color` → hex；默认 `#FFFFFF`                      |
| `textAlign`| enum  | `LEFT→left` / `CENTER→center` / `RIGHT→right`；默认 `left`  |

**无 `children` 字段。** 若文字带复杂样式需降级为 image，见 §6.3.6。

### 7.5 `button`

```yaml
background: AssetTintRef | null   # 见 §6.3.1；无背景时 null
label:
  content:   string        # 默认 "Button"
  fontSize:  int           # 默认 20
  color:     string        # 默认 "#000000"
  textAlign: enum          # 默认 "center"
borderRadius: int          # 可选，默认 0；取 Figma 节点的统一圆角
children: []               # ★ Figma 按钮内部如果有"额外的装饰/图标子节点"（除背景层和文字层之外的），可以放入 children；否则写 []
```

### 7.6 `panel`

```yaml
background: AssetTintRef | null   # ★ 见 §6.3.1（字段优先，复杂效果烘焙成 PNG 仍放入此字段）
borderRadius: int                 # 可选，默认 0
children: [node, ...]             # 递归子节点；Figma 图层从下到上 ↔ 数组 index 从小到大
```

### 7.7 `slider`

```yaml
direction:    "horizontal" | "vertical"   # width > height → horizontal
defaultValue: 0.5                         # 固定 0.5
trackImage:   AssetTintRef | null
fillImage:    AssetTintRef | null
thumbImage:   AssetTintRef | null
```

**无 `children` 字段。** 若某子图层缺失 → 该字段写 `null`。

### 7.8 `toggle`

```yaml
defaultOn:  false                 # 固定 false
background: AssetTintRef | null
checkmark:  AssetTintRef | null
label:                            # ★ 必需字段，无 TEXT 子时用默认值
  content:   string               # 默认 "Toggle"
  fontSize:  int                  # 默认 16
  color:     string               # 默认 "#FFFFFF"
  textAlign: enum                 # 默认 "left"
```

**无 `children` 字段。**

### 7.9 `inputField`

```yaml
background: AssetTintRef | null
placeholder:                      # ★ 必需
  content:   string               # 默认 "Enter text..."
  fontSize:  int                  # 默认 16
  color:     string               # 默认 "#999999"
  textAlign: enum                 # 默认 "left"
text:                             # ★ 必需
  content:   ""                   # 始终空字符串（初始输入值）
  fontSize:  int                  # 默认 16
  color:     string               # 默认 "#FFFFFF"
  textAlign: enum                 # 默认 "left"
```

**无 `children` 字段。**

---

## 8. 资源导出 `<ASSET_EXPORT>`

### 8.1 导出 API 调用

```
GET https://api.figma.com/v1/images/{fileKey}?ids={id1,id2,...}&format=png&scale=1
```

或等效的 Figma MCP 工具。**默认 scale=1**；如用户明确要求高清资源，可用 2x 并在 `assets` 的 `width/height` 字段记录**实际像素**。

### 8.2 文件命名

```
filename = figma_layer_name
           .toLowerCase()
           .replace(/\s+/g, '_')
           .replace(/[^a-z0-9_]/g, '')
           + '.png'
```

规则：
- 结果为空 / 以数字开头 → 使用 `asset_{counter}.png`
- 重名 → 追加 `_2`, `_3`, ... 后缀（如 `btn_bg_2.png`）
- 烘焙类资产按 §6.4 的后缀规则命名

### 8.3 asset id 规则

```
id = filename 去掉 .png 后缀
```

- 必须符合 `[a-zA-Z_][a-zA-Z0-9_]*`
- 若 slug 以数字开头 → 前缀 `a_`（例：`1_btn` → `a_1_btn`）
- 同一 Figma 图层被多处引用时 → **只导出一次**，同一个 `id` 多处 `assetId` 引用即可
- 因烘焙目的需重新导出不同版本时 → 生成独立 id（加 `_2` / `_baked` 后缀）

### 8.4 `assets` 列表条目

```yaml
assets:
  - id: "{asset_id}"
    path: "assets/{filename}.png"
    width:  {int}    # 导出 PNG 实际像素宽
    height: {int}    # 导出 PNG 实际像素高
```

`width/height` 取 Figma API 返回的实际像素值；若 API 不返回，用 `absoluteBoundingBox` 取整作为降级。

---

## 9. 嵌套与层级规则 `<NESTING_RULES>`

- `nodes` 数组在根层级**有且仅有 1 个元素**（根 panel，建议 id = `root_panel`）
- 只有 `panel` 和 `button` 允许有 `children` 字段
  - `panel.children` 承载全部子节点树
  - `button.children`：默认 `[]`；**Figma 按钮内部的额外装饰子节点（除背景层和文字层之外的）可放入 children**
- `image` / `text` / `slider` / `toggle` / `inputField` **不得有** `children` 字段
- **最大嵌套深度 6 层**（根 panel 为第 1 层）
  - 超深的子树 → **整体烘焙为 1 个 image 节点**放到第 6 层；在草案里警告
- **children 顺序**：Figma 图层面板从下到上 → 数组索引从小到大（底层在前，上层在后 = 渲染在顶）

---

## 10. `export` 配置模板 `<EXPORT_CONFIG>`

始终在 `project.yaml` 末尾追加此块（占位符替换为实际值）：

```yaml
export:
  unity:
    assetRootPath: "Assets/UI/{ProjectName}"
    defaultFont: "Assets/Fonts/Default.asset"
    fontSizeScale: 1.0
    renderMode: "ScreenSpaceOverlay"
    referenceResolution: [{canvasWidth}, {canvasHeight}]
    screenMatchMode: 0.5
  unreal:
    assetRootPath: "/Game/UI/{ProjectName}"
    defaultFont: "/Game/UI/Fonts/Default"
    fontSizeScale: 1.0
```

`{ProjectName}` = `meta.name`。

---

## 11. 错误处理与降级 `<ERROR_HANDLING>`

| 情况                                                    | 处理                                                                  |
|-------------------------------------------------------|---------------------------------------------------------------------|
| 节点类型无法确定                                         | 默认 `panel`，草案里标 ⚠️，S4 逐个向用户确认                            |
| 渐变 / 多填充 / 描边 / 阴影 / 模糊 / 非矩形填充             | 按 §6.2 判定为"有复杂渲染效果"，烘焙为 PNG；结果放入对应字段；`tint:"#FFFFFF"` |
| Panel 自身有简单纯色背景（可选含圆角/透明度）               | 直接写 `background: {assetId: null, tint: "#RRGGBB", bgOpacity: <a>}` + `borderRadius: <px>`，**不烘焙** |
| Button / slider / toggle / inputField 的子图层有复杂效果  | 对该子图层烘焙后放入对应字段的 `assetId`；其他简单子图层用字段承载              |
| Figma 图片导出 API 失败                                  | 对应 `assetId: null`；日志提示"导出失败，请在编辑器中手动替换"            |
| 图层名为空 / 全是特殊字符                                 | `name: "Unnamed_{counter}"`，`id: "{type}_{counter}"`                 |
| 图层名含中文                                             | `name` 保留中文原文；`id` 用 `{type}_{counter}`                         |
| 嵌套深度 > 6                                            | 展平至第 6 层并烘焙为 image；警告用户                                    |
| 多个关键词匹配                                           | 按 §4.2 优先级取高                                                   |
| Figma `INSTANCE` 节点                                   | 解析到 main component，递归应用规则                                    |
| 节点 `opacity == 0`                                     | 保留节点，`visible: false`，`opacity: 0.0`                             |
| Figma `COMPONENT_SET`                                  | 当作 `panel`；默认取第一个 variant，或询问用户                          |
| button 无 TEXT 子                                      | `label` 写默认值 `{content:"Button", fontSize:20, color:"#000000", textAlign:"center"}` |
| button / panel 无背景                                    | `background: null`                                                  |
| toggle / inputField 缺少对应 TEXT 子                    | label / placeholder / text 字段仍必须写，用默认值填充                      |
| `assetId` 引用了 assets 里没有的 id                      | 必须修复，不得输出；回退到 `null`                                       |
| 同一 Figma 图层因烘焙目的被多次导出                         | 为每次导出创建独立 asset 条目（文件名加 `_2` / `_baked` 后缀）            |

---

## 12. 字段默认值速查 `<FIELD_DEFAULTS>`

| 字段                              | 默认值                 |
|----------------------------------|----------------------|
| `opacity`                        | `1.0`                |
| `visible`                        | `true`               |
| `pivot`                          | `"topLeft"`          |
| `text.content`                   | `"Text"`             |
| `text.fontSize`                  | `24`                 |
| `text.color`                     | `"#FFFFFF"`          |
| `text.textAlign`                 | `"left"`             |
| `image.tint`                     | `"#FFFFFF"`          |
| `image.assetId`                  | `null`               |
| `AssetTintRef.tint`              | `"#FFFFFF"`          |
| `AssetTintRef.bgOpacity`         | `1.0`（可省略）       |
| `button.background`              | `null`               |
| `button.label.content`           | `"Button"`           |
| `button.label.fontSize`          | `20`                 |
| `button.label.color`             | `"#000000"`          |
| `button.label.textAlign`         | `"center"`           |
| `button.borderRadius`            | `0`（可省略）         |
| `button.children`                | `[]`                 |
| `panel.background`               | `null`               |
| `panel.borderRadius`             | `0`（可省略）         |
| `slider.direction`               | `"horizontal"`       |
| `slider.defaultValue`            | `0.5`                |
| `slider.*Image`                  | `null`               |
| `toggle.defaultOn`               | `false`              |
| `toggle.background`              | `null`               |
| `toggle.checkmark`               | `null`               |
| `toggle.label.content`           | `"Toggle"`           |
| `toggle.label.fontSize`          | `16`                 |
| `toggle.label.color`             | `"#FFFFFF"`          |
| `toggle.label.textAlign`         | `"left"`             |
| `inputField.background`          | `null`               |
| `inputField.placeholder.content` | `"Enter text..."`    |
| `inputField.placeholder.fontSize`| `16`                 |
| `inputField.placeholder.color`   | `"#999999"`          |
| `inputField.placeholder.textAlign`| `"left"`            |
| `inputField.text.content`        | `""`                 |
| `inputField.text.fontSize`       | `16`                 |
| `inputField.text.color`          | `"#FFFFFF"`          |
| `inputField.text.textAlign`      | `"left"`             |

> YAML 里**对取默认值的可选字段可省略不写**（如 `bgOpacity: 1.0` / `borderRadius: 0`），保持文件简洁；编辑器读取时会自动填充默认值。

---

## 13. 枚举速查 `<ENUMS>`

```
type:       image | text | button | panel | slider | toggle | inputField

pivot:      topLeft     topCenter     topRight
            centerLeft  center        centerRight
            bottomLeft  bottomCenter  bottomRight
            （默认且推荐使用 topLeft；其他 8 种合法但一般无需用）

textAlign:  left | center | right

direction:  horizontal | vertical   (slider 专用)
```

---

## 14. 生成前校验清单 `<VALIDATION_CHECKLIST>`

写文件前必须全部通过；否则先修再输出。

- [ ] `meta.schemaVersion` 为整数 `1`
- [ ] `meta.canvasWidth / canvasHeight` 与所选 Frame 尺寸匹配
- [ ] `nodes` 根层级**恰好 1 个**元素（根 panel）
- [ ] 根 panel 是 `type: panel`，`x: 0, y: 0, width: canvasWidth, height: canvasHeight`，`pivot: topLeft`
- [ ] 所有 `id` **全局唯一**
- [ ] 所有 `id` 匹配 `[a-zA-Z_][a-zA-Z0-9_]*`
- [ ] 所有 `assetId` 在 `assets` 中有对应条目（无悬空引用）
- [ ] `assets` 中每个 id 都有实际文件落在 `assets/` 目录
- [ ] 除 `panel` / `button` 外，无 `children` 字段
- [ ] 最大嵌套深度 ≤ 6
- [ ] 所有颜色匹配 `#[0-9A-F]{6}`
- [ ] 所有 `opacity` / `bgOpacity` ∈ `[0.00, 1.00]`
- [ ] 所有 `pivot` 值在 9 种合法枚举内（`centerLeft` / `centerRight`，**不是** `middleLeft` / `middleRight`）
- [ ] 所有 `type` 值在 7 种枚举内
- [ ] 所有 `textAlign` ∈ `{left, center, right}`
- [ ] 所有 `slider.direction` ∈ `{horizontal, vertical}`
- [ ] `toggle.label` / `inputField.placeholder` / `inputField.text` **都存在**（即使无对应 TEXT 子也写默认值）
- [ ] `export` 块包含 `unity` + `unreal` 两个子块
- [ ] `assets` 条目的 `width / height` 为正整数
- [ ] `assets/` 下无重名文件
- [ ] `borderRadius` 若写出则为非负整数

---

## 15. 完整 `project.yaml` 示例

主菜单界面（1920×1080），含标题（文字）+ 开始按钮 + 设置面板（滑动条/开关/输入框）。Root 自带深色纯色背景（字段表达），SettingsPanel 有一张装饰底图（字段表达）：

```yaml
meta:
  name: "MainMenu"
  schemaVersion: 1
  canvasWidth: 1920
  canvasHeight: 1080

assets:
  - id: "btn_start_bg"
    path: "assets/btn_start_bg.png"
    width: 240
    height: 64
  - id: "panel_settings_bg"
    path: "assets/panel_settings_bg.png"
    width: 800
    height: 500
  - id: "slider_track"
    path: "assets/slider_track.png"
    width: 480
    height: 12
  - id: "slider_fill"
    path: "assets/slider_fill.png"
    width: 480
    height: 12
  - id: "slider_thumb"
    path: "assets/slider_thumb.png"
    width: 24
    height: 48
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
    width: 480
    height: 52

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
    background:
      assetId: null
      tint: "#1A1A2E"
      bgOpacity: 1.0
    children:

      - id: "text_1"
        name: "Title"
        type: text
        x: 760
        y: 120
        width: 400
        height: 72
        pivot: topLeft
        visible: true
        opacity: 1.0
        content: "主菜单"
        fontSize: 56
        color: "#FFFFFF"
        textAlign: center

      - id: "button_1"
        name: "StartBtn"
        type: button
        x: 840
        y: 400
        width: 240
        height: 64
        pivot: topLeft
        visible: true
        opacity: 1.0
        background:
          assetId: "btn_start_bg"
          tint: "#FFFFFF"
        label:
          content: "开始游戏"
          fontSize: 24
          color: "#1A1A1A"
          textAlign: center
        borderRadius: 8
        children: []

      - id: "panel_2"
        name: "SettingsPanel"
        type: panel
        x: 560
        y: 520
        width: 800
        height: 500
        pivot: topLeft
        visible: true
        opacity: 1.0
        background:
          assetId: "panel_settings_bg"
          tint: "#FFFFFF"
        borderRadius: 12
        children:

          - id: "slider_1"
            name: "VolumeSlider"
            type: slider
            x: 160
            y: 60
            width: 480
            height: 48
            pivot: topLeft
            visible: true
            opacity: 1.0
            direction: horizontal
            defaultValue: 0.5
            trackImage:
              assetId: "slider_track"
              tint: "#FFFFFF"
            fillImage:
              assetId: "slider_fill"
              tint: "#4A9EFF"
            thumbImage:
              assetId: "slider_thumb"
              tint: "#FFFFFF"

          - id: "toggle_1"
            name: "MuteToggle"
            type: toggle
            x: 160
            y: 160
            width: 280
            height: 48
            pivot: topLeft
            visible: true
            opacity: 1.0
            defaultOn: false
            background:
              assetId: "toggle_bg"
              tint: "#FFFFFF"
            checkmark:
              assetId: "toggle_check"
              tint: "#FFFFFF"
            label:
              content: "静音"
              fontSize: 20
              color: "#E4E4E4"
              textAlign: left

          - id: "inputField_1"
            name: "NameInput"
            type: inputField
            x: 160
            y: 260
            width: 480
            height: 52
            pivot: topLeft
            visible: true
            opacity: 1.0
            background:
              assetId: "input_bg"
              tint: "#FFFFFF"
            placeholder:
              content: "请输入玩家名称…"
              fontSize: 18
              color: "#71717A"
              textAlign: left
            text:
              content: ""
              fontSize: 18
              color: "#FFFFFF"
              textAlign: left

export:
  unity:
    assetRootPath: "Assets/UI/MainMenu"
    defaultFont: "Assets/Fonts/Default.asset"
    fontSizeScale: 1.0
    renderMode: "ScreenSpaceOverlay"
    referenceResolution: [1920, 1080]
    screenMatchMode: 0.5
  unreal:
    assetRootPath: "/Game/UI/MainMenu"
    defaultFont: "/Game/UI/Fonts/Default"
    fontSizeScale: 1.0
```

---

## 16. `project.yaml` 模板 `<YAML_TEMPLATE>`

所有字段的权威模板（`{{...}}` 为占位符）：

```yaml
meta:
  name: "{{FrameName}}"
  schemaVersion: 1
  canvasWidth: {{int}}
  canvasHeight: {{int}}

assets:
  - id: "{{asset_id}}"
    path: "assets/{{filename}}.png"
    width: {{int}}
    height: {{int}}
  # ...

nodes:
  - id: "root_panel"
    name: "{{frame_name}}"
    type: panel
    x: 0
    y: 0
    width: {{canvasWidth}}
    height: {{canvasHeight}}
    pivot: topLeft
    visible: true
    opacity: 1.0
    background:                   # 纯色或单图，见 §6.3.1；完全透明时写 null
      assetId: null                # 或 "{{asset_id}}"
      tint: "#RRGGBB"              # 默认 "#FFFFFF"
      bgOpacity: 1.0               # 可省略
    borderRadius: 0                # 可省略（默认 0）
    children:

      # --- text ---
      - id: "text_1"
        name: "{{layer_name}}"
        type: text
        x: {{int}}
        y: {{int}}
        width: {{int}}
        height: {{int}}
        pivot: topLeft
        visible: {{bool}}
        opacity: {{float}}
        content: "{{text_content}}"
        fontSize: {{int}}
        color: "#FFFFFF"
        textAlign: left

      # --- image ---
      - id: "image_1"
        name: "{{layer_name}}"
        type: image
        x: {{int}}
        y: {{int}}
        width: {{int}}
        height: {{int}}
        pivot: topLeft
        visible: {{bool}}
        opacity: {{float}}
        assetId: "{{asset_id}}"    # 或 null
        tint: "#FFFFFF"

      # --- button ---
      - id: "button_1"
        name: "{{layer_name}}"
        type: button
        x: {{int}}
        y: {{int}}
        width: {{int}}
        height: {{int}}
        pivot: topLeft
        visible: {{bool}}
        opacity: {{float}}
        background:                 # 或 null
          assetId: "{{asset_id}}"   # 或 null（纯色背景）
          tint: "#FFFFFF"
          bgOpacity: 1.0
        label:
          content: "{{label_text}}"
          fontSize: {{int}}
          color: "#000000"
          textAlign: center
        borderRadius: 0             # 可省略
        children: []                # Figma 按钮内额外装饰节点可放这里

      # --- nested panel（可递归） ---
      - id: "panel_2"
        name: "{{layer_name}}"
        type: panel
        x: {{int}}
        y: {{int}}
        width: {{int}}
        height: {{int}}
        pivot: topLeft
        visible: {{bool}}
        opacity: {{float}}
        background:                 # 或 null
          assetId: "{{asset_id}}"
          tint: "#FFFFFF"
        borderRadius: 0
        children:
          # ... 递归子节点

      # --- slider ---
      - id: "slider_1"
        name: "{{layer_name}}"
        type: slider
        x: {{int}}
        y: {{int}}
        width: {{int}}
        height: {{int}}
        pivot: topLeft
        visible: {{bool}}
        opacity: {{float}}
        direction: horizontal
        defaultValue: 0.5
        trackImage:                 # 或 null
          assetId: "{{asset_id}}"
          tint: "#FFFFFF"
        fillImage:                  # 或 null
          assetId: "{{asset_id}}"
          tint: "#FFFFFF"
        thumbImage:                 # 或 null
          assetId: "{{asset_id}}"
          tint: "#FFFFFF"

      # --- toggle ---
      - id: "toggle_1"
        name: "{{layer_name}}"
        type: toggle
        x: {{int}}
        y: {{int}}
        width: {{int}}
        height: {{int}}
        pivot: topLeft
        visible: {{bool}}
        opacity: {{float}}
        defaultOn: false
        background:                 # 或 null
          assetId: "{{asset_id}}"
          tint: "#FFFFFF"
        checkmark:                  # 或 null
          assetId: "{{asset_id}}"
          tint: "#FFFFFF"
        label:                      # ★ 必需；无对应 TEXT 时用默认值
          content: "{{label_text}}"
          fontSize: 16
          color: "#FFFFFF"
          textAlign: left

      # --- inputField ---
      - id: "inputField_1"
        name: "{{layer_name}}"
        type: inputField
        x: {{int}}
        y: {{int}}
        width: {{int}}
        height: {{int}}
        pivot: topLeft
        visible: {{bool}}
        opacity: {{float}}
        background:                 # 或 null
          assetId: "{{asset_id}}"
          tint: "#FFFFFF"
        placeholder:                # ★ 必需
          content: "Enter text..."
          fontSize: 16
          color: "#999999"
          textAlign: left
        text:                       # ★ 必需
          content: ""
          fontSize: 16
          color: "#FFFFFF"
          textAlign: left

export:
  unity:
    assetRootPath: "Assets/UI/{{FrameName}}"
    defaultFont: "Assets/Fonts/Default.asset"
    fontSizeScale: 1.0
    renderMode: "ScreenSpaceOverlay"
    referenceResolution: [{{canvasWidth}}, {{canvasHeight}}]
    screenMatchMode: 0.5
  unreal:
    assetRootPath: "/Game/UI/{{FrameName}}"
    defaultFont: "/Game/UI/Fonts/Default"
    fontSizeScale: 1.0
```
