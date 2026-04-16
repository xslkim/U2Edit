import { describe, it, expect } from "vitest";
import { shouldIgnoreCanvasShortcut } from "./imeShortcutGuards";

function keyEvt(target: EventTarget | null): KeyboardEvent {
  return { target } as KeyboardEvent;
}

describe("imeShortcutGuards（T0.7 与组件一致）", () => {
  it("IME 组合中为 true，不触发画布快捷键副作用", () => {
    const div = document.createElement("div");
    expect(shouldIgnoreCanvasShortcut(keyEvt(div), true)).toBe(true);
  });

  it("焦点在 input 时为 true", () => {
    const input = document.createElement("input");
    expect(shouldIgnoreCanvasShortcut(keyEvt(input), false)).toBe(true);
  });

  it("焦点在普通容器上为 false，可触发画布 Delete 逻辑", () => {
    const div = document.createElement("div");
    expect(shouldIgnoreCanvasShortcut(keyEvt(div), false)).toBe(false);
  });
});
