import { describe, expect, it } from "vitest";
import {
  alignmentLinesFromWorldBox,
  snapDragUnionBox,
  snapResizeTopLeftPivot,
  snapThresholdCanvasUnits,
  unionWorldBoxes,
} from "./guides";

describe("snapThresholdCanvasUnits", () => {
  it("maps 5 screen px to canvas units via viewScale", () => {
    expect(snapThresholdCanvasUnits(1)).toBe(5);
    expect(snapThresholdCanvasUnits(2)).toBe(2.5);
    expect(snapThresholdCanvasUnits(0.5)).toBe(10);
  });
});

describe("snapDragUnionBox", () => {
  it("snaps union left edge to nearest vertical line within threshold", () => {
    const union = { x: 100, y: 50, width: 40, height: 30 };
    const r = snapDragUnionBox(union, [142], [], 5);
    expect(r.adjustX).toBe(2);
    expect(r.guideVerticalX).toEqual([142]);
  });

  it("snaps union top to horizontal line", () => {
    const union = { x: 10, y: 48, width: 20, height: 20 };
    const r = snapDragUnionBox(union, [], [50], 5);
    expect(r.adjustY).toBe(2);
    expect(r.guideHorizontalY).toEqual([50]);
  });
});

describe("unionWorldBoxes", () => {
  it("merges boxes", () => {
    const u = unionWorldBoxes([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 5, y: 5, width: 10, height: 10 },
    ]);
    expect(u).toEqual({ x: 0, y: 0, width: 15, height: 15 });
  });
});

describe("alignmentLinesFromWorldBox", () => {
  it("returns three vertical and three horizontal positions", () => {
    const L = alignmentLinesFromWorldBox({ x: 10, y: 20, width: 100, height: 40 });
    expect(L.vx).toEqual([10, 60, 110]);
    expect(L.hy).toEqual([20, 40, 60]);
  });
});

describe("snapResizeTopLeftPivot", () => {
  it("snaps east handle to sibling right edge", () => {
    const box = { x: 0, y: 0, width: 50, height: 40 };
    const r = snapResizeTopLeftPivot(box, 4, [52], [], 5);
    expect(r.box.width).toBe(52);
    expect(r.guideVerticalX.length).toBeGreaterThan(0);
  });
});
