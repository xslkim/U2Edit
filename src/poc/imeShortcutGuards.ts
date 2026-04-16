/**
 * T0.7：与 `T07KonvaImePoc.vue` 中全局 Delete / Ctrl+Z 逻辑一致，供单测与组件共用。
 */
export function isEditableDomTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) {
    return false;
  }
  return Boolean(t.closest("input, textarea"));
}

/**
 * 为 true 时不应执行「画布删除 / 画布撤销」类快捷键副作用。
 */
export function shouldIgnoreCanvasShortcut(e: KeyboardEvent, composing: boolean): boolean {
  if (composing) {
    return true;
  }
  return isEditableDomTarget(e.target);
}
