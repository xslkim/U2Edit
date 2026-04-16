# Figma → LWB UI Editor 项目生成指南

> 版本: v1.0  
> 日期: 2026-04-16  
> 适用对象: 具备 Figma MCP / REST API 访问能力的 AI Agent  
> 目标: 读取 Figma 文件数据，与用户确认映射方案后，生成可被 LWB UI Editor 直接打开的项目目录

---

## 1. 总览

### 1.1 生成目标

一个合法的 LWB UI Editor 项目由以下文件组成：

```
<项目名>/
├── project.yaml       # 主数据文件（唯一必需）
└── assets/            # 图片资源目录
    ├── btn_bg.png
    ├── icon_star.png
    └── ...
```

编辑器打开时选择包含 `project.yaml` 的目录即可加载。

### 1.2 工作流程

```
[第一步] 获取 Figma 数据
    ↓
[第二步] 分析节点结构，生成映射草案
    ↓
[第三步] 向用户展示映射草案，请求确认
    ↓ （用户确认或修正）
[第四步] 通过 Figma API 导出所有图片资源到 assets/
    ↓
[第五步] 生成 project.yaml
    ↓
[完成] 告知用户项目目录位置
```

> **关键原则：先确认，再生成。** 步骤三中若用户对节点类型映射有异议，务必修正后再继续。

---

## 2. Figma 数据获取

### 2.1 获取入口

通过 Figma MCP 或 REST API 获取文件结构：

```
GET https://api.figma.com/v1/files/{fileKey}
```

或使用 MCP 工具等效调用。

### 2.2 选择要导出的 Frame

- 一个 LWB UI Editor 项目 = 一个 UI 界面 = Figma 中的 **一个顶层 Frame**。
- 若文件中有多个顶层 Frame，向用户列出所有 Frame 名称，请用户选择其中一个。
- 所选 Frame 的 `absoluteBoundingBox.width` × `height` 作为画布分辨率（`canvasWidth` / `canvasHeight`），建议取整到整数 px。

### 2.3 坐标系

Figma 坐标系：原点左上角，X 向右，Y 向下（与 LWB 相同）。

节点在 LWB 中的 `(x, y)` = **相对于父节点左上角的偏移**，计算方式：

```
x = node.absoluteBoundingBox.x - parent.absoluteBoundingBox.x
y = node.absoluteBoundingBox.y - parent.absoluteBoundingBox.y
```

> 始终使用 `pivot: topLeft`，`(x, y)` 即节点自身左上角在父节点内的位置。

---

## 3. 节点类型映射规则

LWB 支持 7 种节点类型：`image` / `text` / `button` / `panel` / `slider` / `toggle` / `inputField`

### 3.1 判断优先级

**优先看命名约定，命名不明确时看结构特征。**

#### 3.1.1 命名约定（优先）

Figma 图层名称（大小写不敏感）符合以下前缀/关键词时，直接确定类型：

| 名称关键词（包含即匹配）                         | 映射类型      |
|-----------------------------------------------|-------------|
| `btn`, `button`, `按钮`                        | `button`    |
| `text`, `label`, `title`, `txt`, `文字`, `标题` | `text`      |
| `img`, `image`, `icon`, `图片`, `图标`          | `image`     |
| `panel`, `container`, `bg`, `background`, `面板`, `背景`, `容器` | `panel` |
| `slider`, `滑动`, `进度条`, `音量`              | `slider`    |
| `toggle`, `checkbox`, `开关`, `勾选`           | `toggle`    |
| `input`, `field`, `输入框`, `inputfield`       | `inputField`|

#### 3.1.2 结构推断（名称不明确时的回退）

| Figma 节点类型 + 结构特征                                                                | 推断为         |
|--------------------------------------------------------------------------------------|--------------|
| Figma `TEXT` 节点                                                                     | `text`       |
| Figma `RECTANGLE` / `ELLIPSE` 等形状，无子节点                                         | `image`（图片占位）|
| Figma `FRAME` / `GROUP`，无子节点或全为形状子节点（无文字）                               | `panel`      |
| Figma `FRAME` / `COMPONENT`，有且仅有一个 `TEXT` 子节点 + 形状背景                      | `button`     |
| Figma `FRAME` / `COMPONENT`，有水平方向细长矩形（高/宽 < 0.15）+ 圆形子节点              | `slider`     |
| Figma `FRAME` / `COMPONENT`，有正方形背景 + 小正方形/勾图形子节点 + 可选文字             | `toggle`     |
| Figma `FRAME` / `COMPONENT`，有占满宽度的矩形背景 + 无图标子节点（或 placeholder 字样文字）| `inputField` |
| Figma `FRAME` / `GROUP`，包含多个子节点（混合类型）                                    | `panel`（容器）|
| Figma `INSTANCE`（组件实例）                                                           | 按以上规则递归推断 |
| 无法确定                                                                               | 默认 `panel`，标记为 ⚠️ 待用户确认 |

### 3.2 向用户展示映射草案

在实际生成前，以表格形式向用户确认，例如：

```
已分析 Figma Frame "MainMenu"，共 12 个节点，映射草案如下：

Figma 图层名称        推断类型     推断依据        备注
──────────────────────────────────────────────────────────
Root                 panel       Frame 根节点     画布 1920×1080
  TitleText          text        TEXT 节点
  StartBtn           button      命名含 Btn
  SettingsPanel      panel       命名含 Panel
    VolumeSlider     slider      命名含 Slider
    MuteToggle       toggle      命名含 Toggle
    NameInput        inputField  命名含 Input
  HeroImage          image       命名含 Image
  ⚠️ Group_42        panel       无法确定，默认 panel  请确认

是否继续？如需修改类型请告知。
```

---

## 4. 字段转换规则

### 4.1 公共字段（所有节点）

| LWB 字段      | 来源                                                             | 说明                             |
|-------------|----------------------------------------------------------------|--------------------------------|
| `id`        | 用 `{type}_{自增序号}` 生成（如 `panel_1`, `text_2`）             | 必须符合 `[a-zA-Z_][a-zA-Z0-9_]*`，全局唯一 |
| `name`      | Figma 图层名称                                                  | 允许中文和空格                    |
| `type`      | 见第 3 节映射规则                                               |                                |
| `x`         | `node.absoluteBoundingBox.x - parent.absoluteBoundingBox.x`    | 取整                            |
| `y`         | `node.absoluteBoundingBox.y - parent.absoluteBoundingBox.y`    | 取整                            |
| `width`     | `node.absoluteBoundingBox.width`                               | 取整，最小值 1                   |
| `height`    | `node.absoluteBoundingBox.height`                              | 取整，最小值 1                   |
| `pivot`     | 固定为 `topLeft`                                               | (x,y) 始终为左上角               |
| `visible`   | `node.visible ?? true`                                         | 隐藏图层保留并设 false            |
| `opacity`   | `node.opacity ?? 1.0`                                          | 范围 0.0 ~ 1.0，保留两位小数      |

### 4.2 颜色转换

Figma 颜色为 `{r, g, b, a}`，各分量范围 0.0 ~ 1.0。

转换为 LWB hex 字符串（**忽略透明度 alpha，用 opacity 字段代替**）：

```
hex = "#" + toHex(r*255) + toHex(g*255) + toHex(b*255)
```

例：`{r:1.0, g:0.5, b:0.0, a:1.0}` → `#FF8000`

> 若节点有透明度（`fills[0].opacity` 或 `node.opacity`），将整体透明度写入节点 `opacity` 字段。

### 4.3 各节点类型专有字段

#### 4.3.1 `text` 节点

| LWB 字段      | Figma 来源                                       | 默认值         |
|-------------|------------------------------------------------|--------------|
| `content`   | `node.characters`                              | `"Text"`     |
| `fontSize`  | `node.style.fontSize`，取整                     | `24`         |
| `color`     | `node.fills[0].color` → hex（见 4.2）           | `"#FFFFFF"`  |
| `textAlign` | `node.style.textAlignHorizontal`：LEFT→`left`, CENTER→`center`, RIGHT→`right` | `left` |

#### 4.3.2 `image` 节点

| LWB 字段    | 来源                                    | 默认值      |
|-----------|----------------------------------------|-----------|
| `assetId` | 对应导出资源的 id（见第 5 节）             | 见第 5 节  |
| `tint`    | `node.fills[0].color` → hex（若有颜色填充）| `"#FFFFFF"`（无叠色）|

#### 4.3.3 `button` 节点

按钮由一个背景图层 + 一个文字图层组成。分别对应：

| LWB 字段              | 来源                                       |
|---------------------|------------------------------------------|
| `background.assetId`| 背景形状图层对应的导出资源 id               |
| `background.tint`   | 背景图层填充颜色 → hex                     |
| `label.content`     | 文字子图层 `characters`                    |
| `label.fontSize`    | 文字子图层 `style.fontSize`，取整           |
| `label.color`       | 文字子图层 `fills[0].color` → hex          |
| `label.textAlign`   | 文字子图层 `style.textAlignHorizontal` 映射 |
| `children`          | 固定为 `[]`（button 不导出子节点）          |

#### 4.3.4 `panel` 节点

| LWB 字段              | 来源                                        |
|---------------------|-------------------------------------------|
| `background.assetId`| 若 Frame 有图片填充/独立背景图层，对应资源 id |
| `background.tint`   | 背景填充颜色 → hex                          |
| `children`          | 递归处理子节点                               |

若 panel 无背景图，`background: null`。

#### 4.3.5 `slider` 节点

| LWB 字段                  | 来源                         | 默认值           |
|--------------------------|----------------------------|----------------|
| `direction`              | 长边方向：宽 > 高 → `horizontal`，否则 `vertical` | `horizontal` |
| `defaultValue`           | 固定 `0.5`                   | `0.5`          |
| `trackImage.assetId`     | 轨道背景图层资源 id              | `null`         |
| `fillImage.assetId`      | 填充图层资源 id                 | `null`         |
| `thumbImage.assetId`     | 滑块图层资源 id                 | `null`         |
| `*Image.tint`            | 对应图层填充颜色 → hex            | `"#FFFFFF"`    |

#### 4.3.6 `toggle` 节点

| LWB 字段              | 来源                             | 默认值      |
|---------------------|--------------------------------|-----------|
| `defaultOn`         | 固定 `false`（初始状态）           | `false`   |
| `background.assetId`| 背景图层资源 id                   | `null`    |
| `checkmark.assetId` | 选中状态图层资源 id               | `null`    |
| `background.tint`   | 背景图层颜色 → hex               | `"#FFFFFF"`|
| `checkmark.tint`    | 选中图层颜色 → hex               | `"#FFFFFF"`|
| `label.content`     | 文字子图层内容（若有）              | （省略若无）  |
| `label.*`           | 同 text 节点规则                  |           |

#### 4.3.7 `inputField` 节点

| LWB 字段                    | 来源                              | 默认值                   |
|---------------------------|----------------------------------|------------------------|
| `background.assetId`      | 背景图层资源 id                    | `null`                 |
| `background.tint`         | 背景颜色 → hex                    | `"#FFFFFF"`            |
| `placeholder.content`     | placeholder 文字内容（若有）        | `"Enter text..."`      |
| `placeholder.fontSize`    | placeholder 文字字号               | `16`                   |
| `placeholder.color`       | placeholder 颜色 → hex            | `"#999999"`            |
| `placeholder.textAlign`   | placeholder 对齐                  | `left`                 |
| `text.content`            | 输入框初始值，留空                  | `""`                   |
| `text.fontSize`           | 同 placeholder 字号               | `16`                   |
| `text.color`              | 主文字颜色 → hex                   | `"#FFFFFF"`            |
| `text.textAlign`          | 对齐                              | `left`                 |

---

## 5. 资源（图片）处理

### 5.1 哪些节点需要导出资源

以下情况需要通过 Figma API 导出图片资源：

- `image` 节点 → 导出该节点本身
- `button.background` 所对应的背景形状子图层
- `panel.background` 所对应的背景图层（若存在）
- `slider` 的 `trackImage` / `fillImage` / `thumbImage` 对应图层
- `toggle` 的 `background` / `checkmark` 对应图层
- `inputField` 的 `background` 对应图层

**不导出：** `text` 节点（文字用 `content` + 样式字段描述）。

### 5.2 导出步骤

1. 收集所有需要导出的 Figma 节点 id 列表。
2. 调用 Figma API 批量导出 PNG（格式 PNG，scale 1x，除非 Figma 设计分辨率不同）：
   ```
   GET https://api.figma.com/v1/images/{fileKey}?ids={id1,id2,...}&format=png&scale=1
   ```
   或使用等效的 MCP 工具。
3. 按以下规则命名文件：
   - 文件名 = 对应 Figma 图层名称，转小写，空格替换为 `_`，去掉特殊字符，加 `.png` 后缀
   - 若有重名，加数字后缀区分（如 `btn_bg.png`, `btn_bg_2.png`）
4. 将所有 PNG 下载并保存至项目目录的 `assets/` 子目录。
5. 在 `project.yaml` 的 `assets` 列表中为每个文件生成声明：
   ```yaml
   assets:
     - id: "btn_bg"              # 文件名去掉 .png 后缀
       path: "assets/btn_bg.png" # 相对路径
       width: 200                # 导出图片的实际像素宽度
       height: 60                # 导出图片的实际像素高度
   ```

### 5.3 资源 id 规则

- `id` = 文件名去掉 `.png` 后缀（如 `btn_bg`）
- 必须符合 `[a-zA-Z_][a-zA-Z0-9_]*`（无中文，无空格）
- 若文件名含中文，转为拼音首字母或直接用 `asset_{序号}`

---

## 6. 嵌套与层级规则

- **根节点**：整个 Frame 对应一个 `type: panel` 的根节点，`x: 0, y: 0, width: canvasWidth, height: canvasHeight`，`background: null`（若 Frame 有背景色请记录为顶层 panel 的 background）
- **最大嵌套层级**：6 层（根算第 1 层），若 Figma 层级超出 6 层，将深层节点展平合并到第 6 层，并标注警告
- **children 顺序**：保持 Figma 中从下到上的图层顺序（Figma 图层面板中越靠上的图层在数组中越靠后，渲染在上方）
- **仅 `panel` 和 `button` 有 `children`**：其他节点类型不产生子节点，若 Figma 中有子内容，通过图层合并处理（如整体导出为一张图）

---

## 7. `export` 配置（project.yaml 固定模板）

生成时使用以下默认值，用户可在编辑器中手动调整：

```yaml
export:
  unity:
    assetRootPath: "Assets/UI/<项目名>"
    defaultFont: "Assets/Fonts/Default.asset"
    fontSizeScale: 1.0
    renderMode: "ScreenSpaceOverlay"
    referenceResolution: [<canvasWidth>, <canvasHeight>]
    screenMatchMode: 0.5
  unreal:
    assetRootPath: "/Game/UI/<项目名>"
    defaultFont: "/Game/UI/Fonts/Default"
    fontSizeScale: 1.0
```

---

## 8. 错误处理与降级策略

| 情况                                   | 处理方式                                                              |
|--------------------------------------|---------------------------------------------------------------------|
| Figma 节点类型无法确定                    | 默认 `panel`，在映射草案中标记 ⚠️，请用户确认                          |
| Figma 中使用渐变填充                     | 取渐变起点颜色作为 `tint`，并在草案中注明"渐变已降级为纯色"              |
| Figma 中使用图片填充（非单独图片图层）      | 将该 Frame/形状整体导出为一张 PNG，映射为 `image` 节点                 |
| assetId 导出失败（API 报错）              | 将对应字段设为 `null`，并在草案中标注，告知用户后续手动替换             |
| 节点 name 包含中文或特殊字符               | name 字段保留原样（允许中文），id 字段使用 `{type}_{序号}` 生成        |
| 层级超过 6 层                           | 警告用户，超出部分展平合并（整体导出为图片）                            |
| Figma 图层名称与多个关键词同时匹配         | 优先匹配更具体的关键词（如 `toggle_btn` 优先匹配 `toggle`）            |
| 同一 Frame 中有 Figma 不支持的效果（模糊/遮罩等）| 整体导出为图片，作为 `image` 节点处理，并标注说明                   |

---

## 9. 完整 project.yaml 示例

以下示例对应一个包含标题、按钮、设置面板（含滑动条、开关、输入框）的主菜单界面（1920×1080）：

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
  - id: "panel_1"
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

## 10. Schema 速查

### 节点类型枚举

`image` | `text` | `button` | `panel` | `slider` | `toggle` | `inputField`

### pivot 枚举（固定使用 `topLeft`）

`topLeft` | `topCenter` | `topRight` | `middleLeft` | `center` | `middleRight` | `bottomLeft` | `bottomCenter` | `bottomRight`

### textAlign 枚举

`left` | `center` | `right`

### direction 枚举（slider）

`horizontal` | `vertical`

### 全局约束

| 规则             | 说明                                                     |
|----------------|--------------------------------------------------------|
| 根节点唯一       | `nodes` 数组只有一个元素（type=panel），其余节点在 children 内 |
| id 全局唯一      | 整个文件内所有 id 不得重复                                   |
| id 格式         | `[a-zA-Z_][a-zA-Z0-9_]*`，不含空格和中文                  |
| 最大嵌套 6 层    | 根节点算第 1 层                                            |
| children 顺序   | 靠后的渲染在上层（对应 Figma 图层面板从下往上的顺序）           |
| 坐标单位         | 全部为 px，整数                                            |
| 颜色格式         | `#RRGGBB`（6 位十六进制大写，不含 alpha）                    |
| opacity 范围    | 0.0 ~ 1.0，两位小数                                       |
| schemaVersion  | 固定写 `1`                                               |

---

## 11. 生成后检查清单

生成 project.yaml 后，在告知用户前，自检以下项目：

- [ ] `nodes` 数组只有一个根节点（`type: panel`）
- [ ] 所有 `id` 全局唯一且格式合法
- [ ] `assets` 列表中声明的所有 id 都有对应文件在 `assets/` 目录
- [ ] `assetId` 引用值均在 `assets` 列表中存在（无悬空引用）
- [ ] 嵌套层级不超过 6 层
- [ ] 所有颜色为 `#RRGGBB` 格式
- [ ] `opacity` 在 0.0 ~ 1.0 范围内
- [ ] `canvasWidth` / `canvasHeight` 与所选 Frame 尺寸匹配
