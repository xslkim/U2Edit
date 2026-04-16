import { describe, expect, it } from "vitest";
import {
  clampViewScale,
  centerOneToOne,
  fitCanvasInitial,
  fitCanvasToWindow,
  VIEW_SCALE_MAX,
  VIEW_SCALE_MIN,
  wheelScaleFactor,
  zoomAtScreenPoint,
} from "./viewTransform";

describe("viewTransform", () => {
  it("clampViewScale enforces 10%–500%", () => {
    expect(clampViewScale(0.05)).toBe(VIEW_SCALE_MIN);
    expect(clampViewScale(10)).toBe(VIEW_SCALE_MAX);
    expect(clampViewScale(0.5)).toBe(0.5);
  });

  it("zoomAtScreenPoint keeps anchor in canvas space", () => {
    const pan = { x: 100, y: 50 };
    const scale = 1;
    const sx = 200;
    const sy = 150;
    const cx = (sx - pan.x) / scale;
    const cy = (sy - pan.y) / scale;
    const newScale = 2;
    const p2 = zoomAtScreenPoint(pan, scale, sx, sy, newScale);
    const cx2 = (sx - p2.x) / newScale;
    const cy2 = (sy - p2.y) / newScale;
    expect(cx2).toBeCloseTo(cx, 5);
    expect(cy2).toBeCloseTo(cy, 5);
  });

  it("fitCanvasInitial caps at 100% scale", () => {
    const r = fitCanvasInitial(2000, 1200, 1920, 1080, 16);
    expect(r.scale).toBeLessThanOrEqual(1);
    expect(r.panX + 1920 * r.scale).toBeLessThanOrEqual(2000 + 1);
  });

  it("fitCanvasToWindow uses margin and can go below 100%", () => {
    const r = fitCanvasToWindow(1400, 900, 1920, 1080, 0.05);
    expect(r.scale).toBeGreaterThan(0.5);
    expect(r.scale).toBeLessThan(0.75);
  });

  it("centerOneToOne is scale 1 centered", () => {
    const r = centerOneToOne(800, 600, 1920, 1080);
    expect(r.scale).toBe(1);
    expect(r.panX).toBe((800 - 1920) / 2);
    expect(r.panY).toBe((600 - 1080) / 2);
  });

  it("wheelScaleFactor zooms out on positive deltaY", () => {
    expect(wheelScaleFactor(100)).toBeLessThan(1);
    expect(wheelScaleFactor(-100)).toBeGreaterThan(1);
  });
});
