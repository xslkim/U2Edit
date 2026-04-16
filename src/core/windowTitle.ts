import { getCurrentWindow } from "@tauri-apps/api/window";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * 同步主窗口标题：`{项目名}` 或 `{项目名} *`（未保存）。
 */
export async function applyWindowTitle(projectName: string | null, dirty: boolean): Promise<void> {
  const base = projectName?.trim() ? projectName.trim() : "LWB UI Editor";
  const text = dirty ? `${base} *` : base;
  if (!isTauri()) {
    document.title = text;
    return;
  }
  await getCurrentWindow().setTitle(text);
}
