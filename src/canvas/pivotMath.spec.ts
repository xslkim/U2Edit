import { describe, expect, it } from "vitest";
import { nodeTopLeft, pivotOffsetFromTopLeft } from "./pivotMath";

describe("pivotMath", () => {
  it("pivotOffsetFromTopLeft: center uses half width/height", () => {
    expect(pivotOffsetFromTopLeft("center", 200, 100)).toEqual({ x: 100, y: 50 });
  });

  it("nodeTopLeft: topLeft matches x,y", () => {
    expect(nodeTopLeft("topLeft", 10, 20, 100, 50)).toEqual({ x: 10, y: 20 });
  });

  it("nodeTopLeft: center subtracts half size", () => {
    expect(nodeTopLeft("center", 100, 100, 40, 30)).toEqual({ x: 80, y: 85 });
  });
});
