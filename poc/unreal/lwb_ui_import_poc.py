# LWB UI Editor — T0.5 Unreal Engine Python POC（Unreal 5.x）
#
# 使用方式（示例）：
# 1. 将本文件复制到项目的 Content/Python/，或在「输出日志」里用绝对路径 py "E:/.../lwb_ui_import_poc.py"
# 2. 启用 Editor Scripting Utilities + Python Editor Script Plugin
# 3. 在 Python 控制台执行：import lwb_ui_import_poc; lwb_ui_import_poc.run()
#
# 说明：不同 5.x 小版本对 UMG WidgetTree 的 Python 暴露不一致；本脚本以「可重复创建 WBP 资源」为 POC 主交付。
# 完整控件层级与 Slot 参数（position/size/alignment/set_auto_size）请在本机打开 Designer 对照 docs/tasks.md T0.5 核对，
# 或在生产管线中采用 JSON + 插件（方案 C）承载细节数据。

import unreal


def _ensure_dir(path: str) -> None:
    if not unreal.EditorAssetLibrary.does_directory_exist(path):
        unreal.EditorAssetLibrary.make_directory(path)


def run() -> None:
    """在 /Game/UI/Poc 下创建 WBP_LwbUiPoc（UserWidget 蓝图壳）。"""
    base = "/Game/UI/Poc"
    _ensure_dir(base)

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.WidgetBlueprintFactory()
    factory.set_editor_property("parent_class", unreal.UserWidget.static_class())

    wbp = asset_tools.create_asset(
        asset_name="WBP_LwbUiPoc",
        package_path=base,
        asset_class=unreal.WidgetBlueprint,
        factory=factory,
    )

    if wbp is None:
        unreal.log_error("LWB UI POC: create_asset 返回 None，请检查 Output Log 权限与插件是否启用")
        return

    asset_path = f"{base}/WBP_LwbUiPoc"
    unreal.EditorAssetLibrary.save_asset(asset_path)
    unreal.log(f"LWB UI POC: 已创建并保存 {asset_path} — 请在 UMG Designer 中补齐 CanvasPanel 与控件树（见 poc/unreal/README.md）")


if __name__ == "__main__":
    run()
