# T0.5 — Unreal Python 脚本 POC

## 前置条件

- **Unreal 5.x** 空项目  
- 启用插件：**Python Editor Script Plugin**、**Editor Scripting Utilities**

## 使用

1. 将 `lwb_ui_import_poc.py` 复制到项目的 `Content/Python/`（或从输出日志用绝对路径执行）。  
2. 打开 **Output Log** 或 **Python** 控制台，执行：

```python
import lwb_ui_import_poc
lwb_ui_import_poc.run()
```

## 当前脚本行为

- 创建目录：`/Game/UI/Poc`  
- 使用 `WidgetBlueprintFactory` 创建 **`WBP_LwbUiPoc`**（`UserWidget` 父类）并保存。

## 与 tasks.md 用例的对齐说明

不同 **5.x 小版本**对 **UMG WidgetTree** 的 Python 暴露差异较大；在部分版本上难以用纯 Python **稳定、可重复**地写入完整 **CanvasPanel + 全控件 Slot 参数**（`set_position` / `set_size` / `set_alignment` / `set_auto_size`）。

**推荐在本机完成以下手工步骤以对照 T0.5 用例：**

1. 打开 `WBP_LwbUiPoc`，进入 **Designer**。  
2. 添加 **Canvas Panel**，依次添加 **Image / Text / Button（含子 Text）/ Slider / Check Box / Editable Text Box**。  
3. 按 `docs/tasks.md` T0.5 用例设置 **位置 (100,200)**、**尺寸 200×200**、**Alignment (0.5,0.5)** 等。  

POC 的 **dev_done** 门槛以「脚本已提交 + `docs/poc-reports/T0.5-unreal-python.md` 结论已填写」为准；引擎内精细布局以你本机 Designer 验证为准。
