import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";

let dirty = false;

export function setWindowDirty(value: boolean): void {
  dirty = value;
}

export function isWindowDirty(): boolean {
  return dirty;
}

/**
 * 拦截窗口关闭：dirty 时弹确认，确认后关闭。
 * @returns 取消订阅函数
 */
export async function initWindowGuard(): Promise<() => void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return () => {};
  }
  const win = getCurrentWindow();
  return win.onCloseRequested(async (event) => {
    if (!dirty) return;
    event.preventDefault();
    const ok = await confirm("有未保存的更改，确定要关闭窗口吗？", {
      title: "LWB UI Editor",
      kind: "warning",
      okLabel: "确认",
      cancelLabel: "取消",
    });
    if (ok) {
      setWindowDirty(false);
      await win.close();
    }
  });
}
