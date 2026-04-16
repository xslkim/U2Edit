import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";

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
 * 拦截窗口关闭：dirty 时三按钮（保存 / 不保存 / 取消）。
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
    const r = await message("有未保存的更改。关闭前是否保存？", {
      title: "LWB UI Editor",
      kind: "warning",
      buttons: { yes: "保存", no: "不保存", cancel: "取消" },
    });
    if (r === "取消") {
      return;
    }
    if (r === "保存") {
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
    await win.close();
  });
}
