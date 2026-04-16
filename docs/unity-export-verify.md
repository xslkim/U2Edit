# Unity 导出验证说明（Unity 2022）

本文档配合 **T3.3** 固定样例 `tests/e2e-fixtures/sample-all-controls.yaml`，说明在 **Unity 2022**（建议 2022.3 LTS）中如何验证 LWB 导出的 C# Editor 脚本与 Prefab。

## 1. 样例内容

- **项目名**：`AllControls_E2E`
- **七种控件**：Image（2 个）、Text、Button、Panel（嵌套子树）、Slider、Toggle、InputField
- **多图**：`assets/` 下 10 个 PNG 引用（见 YAML `assets` 列表）
- **中文**：标题、按钮、占位符、输入框等含中文，用于 TMP 显示检查

## 2. 在 LWB UI Editor 中准备项目

1. 新建或打开项目目录，将 `sample-all-controls.yaml` **复制为** 该项目根目录下的 `project.yaml`（或合并内容）。
2. 在项目目录的 `assets/` 下放置与 YAML 中 `path` 一致的 PNG 文件（可为任意尺寸的占位图；文件名与路径需一致）。
3. 用 **导出 → Unity（C# Editor 脚本）** 保存 `.cs` 文件。

## 3. Unity 工程侧步骤

1. 创建或打开 **Unity 2022** 空项目，安装 **TextMeshPro**（首次导入 TMP 时按向导生成资源）。
2. 将导出的 `.cs` 放入 Unity 工程的 **`Assets` 下任意 `Editor` 文件夹**（例如 `Assets/Editor/LwbImport/`）。若目录不存在请新建。
3. 脚本中的 **`assetRootPath`**（YAML `export.unity.assetRootPath`，默认 `Assets/LWB/AllControls`）应在 Unity 内存在；若不存在，在 Project 窗口中创建对应文件夹。
4. 运行菜单项（生成脚本中的 **「LWB UI/导入…」** 类菜单，名称含项目 meta 名）。脚本会：
   - 从本机 **源项目 `assets/` 目录**（导出时内嵌的绝对路径）复制 PNG 到 `assetRootPath`；
   - 将 PNG 设为 **Sprite**；
   - 生成 **Prefab**（路径见脚本内 `prefabPath`）。
5. **`defaultFont`**：若 YAML 中的路径在您的工程中不存在，请在 Unity 中指定有效的 **TMP Font Asset**，或先在 `project.yaml` 的 `export.unity.defaultFont` 中改为工程内真实路径后再重新导出。

## 4. 场景与 Game 视图检查

1. 新建场景，将生成的 Prefab 拖入 Hierarchy（或实例化到 Canvas 下，视生成脚本结构而定）。
2. 进入 **Game** 视图，确认：
   - 七种控件区域可见，布局与 LWB 画布大致一致；
   - **中文**无乱码（若乱码，检查 TMP 默认字体 / Font Asset 与材质）。
3. **Slider**：存在 Background、Fill Area/Fill、Handle Slide Area/Handle 层级（与 `docs/requirements.md` §2.12.5 一致）。

## 5. 覆盖导出（应用内）

1. 在 LWB 中修改 `sample-all-controls` 项目并再次 **导出** 到**同一 `.cs` 路径**。
2. 应出现 **覆盖确认**；确认后覆盖磁盘上的 `.cs`。
3. 在 Unity 中重新执行菜单导入：旧 Prefab 被 **SaveAsPrefabAsset** 覆盖（以生成脚本为准）。

## 6. 自动化门禁

仓库内 Vitest：`tests/e2e-fixtures/sample-all-controls.spec.ts` 校验该 YAML **可解析且 `validate()` 通过**，作为 CI 中的结构回归；**引擎内运行**仍建议按上文人工走通一遍。
