import { describe, expect, it } from "vitest";
import {
  cursorCssForHandleIndex,
  hitTestResizeHandle,
  SELECTION_HANDLE_PX,
} from "./selectionOverlay";

describe("T1.13 selection overlay 手柄命中", () => {
  it("中心点命中右下角手柄 (index 7)", () => {
    const box = { x: 100, y: 200, width: 80, height: 60 };
    const brX = box.x + box.width;
    const brY = box.y + box.height;
    const h = hitTestResizeHandle(brX, brY, [box]);
    expect(h?.handle).toBe(7);
    expect(cursorCssForHandleIndex(7)).toBe("nwse-resize");
  });

  it("略偏仍落在手柄半宽内", () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    const half = SELECTION_HANDLE_PX / 2;
    const topMidX = 50;
    const topMidY = 0;
    const h = hitTestResizeHandle(topMidX, topMidY + half - 0.5, [box]);
    expect(h?.handle).toBe(1);
    expect(cursorCssForHandleIndex(1)).toBe("ns-resize");
  });

  it("未命中手柄返回 null", () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    expect(hitTestResizeHandle(50, 50, [box])).toBeNull();
  });
});
