import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, confirm, message } from "@tauri-apps/plugin-dialog";

let dirty = false;
let saveHandler: (() => Promise<void>) | null = null;

export function setWindowDirty(value: boolean): void {
  dirty = value;
}

export function isWindowDirty(): boolean {
  return dirty;
}

/** 关闭前若选「保存」，将调用（由 App 注入，内应写入磁盘并 `setWindowDirty(false)`） */
export function setCloseSaveHandler(handler: (() => Promise<void>) | null): void {
  saveHandler = handler;
}

/**
 * 拦截窗口关闭：dirty 时先询问是否关闭，再询问是否保存。
 * @returns 取消订阅函数
 */
export async function initWindowGuard(): Promise<() => void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return () => {};
  }
  const win = getCurrentWindow();
  return win.onCloseRequested(async (event) => {
    if (!dirty) {
      return;
    }
    event.preventDefault();

    // 第一步：确认是否真的要关闭（取消则停留）
    const shouldClose = await confirm("有未保存的更改，确定要关闭吗？", {
      title: "LWB UI Editor",
      kind: "warning",
      okLabel: "关闭",
      cancelLabel: "取消",
    });
    if (!shouldClose) {
      return;
    }

    // 第二步：询问是否保存
    const shouldSave = await ask("是否在关闭前保存更改？", {
      title: "LWB UI Editor",
      kind: "warning",
      okLabel: "保存",
      cancelLabel: "不保存",
    });
    if (shouldSave) {
      if (!saveHandler) {
        await message("无法保存：未注册保存逻辑。", { title: "LWB UI Editor", kind: "error" });
        return;
      }
      try {
        await saveHandler();
      } catch {
        return;
      }
    }

    dirty = false;
    await win.destroy();
  });
}
