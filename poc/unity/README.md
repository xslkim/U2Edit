# T0.4 — Unity C# Editor 脚本 POC

## 前置条件

- **Unity 2022 LTS** 新建 3D（或 2D）项目  
- 安装 **TextMeshPro**（首次导入 TMP 时会弹出 **Import TMP Essentials**，必须完成）  
- 本仓库文件：`LwbUiImportPoc.cs` 复制到 Unity 工程 `Assets/Editor/`（或任意 `Editor` 汇编下的文件夹）

## 运行

菜单栏：**Tools → LWB UI POC**

## 预期结果

1. 生成目录 `Assets/UI/Poc/`。  
2. 生成 `lwb_poc_generated.png` 并由脚本调用 `TextureImporter` 设为 **Sprite (2D and UI)**。  
3. 生成 Prefab：`Assets/UI/Poc/LwbUiPoc.prefab`。  
4. 打开 Prefab 后可见 **Canvas**（Screen Space Overlay，`CanvasScaler` 参考分辨率 **1920×1080**），子节点包含：  
   - **Image**（Pivot 中心，`anchoredPosition` 约为 **(100, -200)**，带 Sprite）  
   - **TextMeshProUGUI**（示例中文文案）  
   - **Button**，子节点为 **TextMeshProUGUI**（非 legacy `Text`）  
   - **Slider**（默认 UGUI 结构：Background / Fill Area / Fill / Handle Slide Area / Handle）  
   - **Toggle**  
   - **InputField**（Legacy）

## 中文 TMP 显示

脚本会尝试在工程中查找名称或路径包含 `Chinese` / `CJK` / `Noto` 的 **TMP Font Asset** 并赋给文本。若无，请在 Inspector 中为 TMP 指定支持中文的 **Font Asset**（否则可能显示方块）。

## 截图说明（替代自测）

- **Project 窗口**：`LwbUiPoc.prefab` 位于 `Assets/UI/Poc/`。  
- **Inspector / Sprite**：`lwb_poc_generated.png` 的 **Texture Type** 为 **Sprite (2D and UI)**。  
- **Prefab 编辑视图**：Hierarchy 与上述控件一致；Image 的 RectTransform 为 Pivot **0.5,0.5**，位置约 **(100,-200)**。
