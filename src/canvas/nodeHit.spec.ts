import { describe, expect, it } from "vitest";
import type { Node } from "../core/schema";
import {
  altPickId,
  collectVisiblePaintOrder,
  getCanvasAabb,
  idsFullyInsideMarquee,
  normalizeRect,
  nodesHitByPoint,
  topHitId,
} from "./nodeHit";

function img(id: string, x: number, y: number): Node {
  return {
    id,
    name: id,
    type: "image",
    x,
    y,
    width: 100,
    height: 100,
    pivot: "topLeft",
    visible: true,
    opacity: 1,
    assetId: null,
    tint: "#FFFFFF",
  };
}

describe("nodeHit", () => {
  it("collectVisiblePaintOrder skips invisible", () => {
    const tree: Node = {
      id: "root",
      name: "root",
      type: "panel",
      x: 0,
      y: 0,
      width: 500,
      height: 500,
      pivot: "topLeft",
      visible: true,
      opacity: 1,
      background: null,
      children: [{ ...img("c", 0, 0), visible: false }],
    };
    const order = collectVisiblePaintOrder(tree);
    expect(order.map((n) => n.id)).toEqual(["root"]);
  });

  it("topHitId returns last in paint order among hits", () => {
    const a = img("a", 0, 0);
    const b = img("b", 10, 10);
    const paint = [a, b];
    const hits = nodesHitByPoint(paint, 50, 50);
    expect(topHitId(hits)).toBe("b");
  });

  it("altPickId steps down from top", () => {
    const a = img("a", 0, 0);
    const b = img("b", 0, 0);
    const c = img("c", 0, 0);
    const hits = [a, b, c];
    expect(altPickId(hits, 0)).toBe("b");
    expect(altPickId(hits, 1)).toBe("a");
  });

  it("idsFullyInsideMarquee only fully enclosed", () => {
    const paint: Node[] = [
      { ...img("in", 10, 10), width: 20, height: 20 } as Node,
      { ...img("part", 5, 5), width: 100, height: 100 } as Node,
    ];
    const rect = normalizeRect(0, 0, 50, 50);
    const ids = idsFullyInsideMarquee(paint, rect);
    expect(ids.has("in")).toBe(true);
    expect(ids.has("part")).toBe(false);
  });

  it("getCanvasAabb respects pivot", () => {
    const n: Node = {
      id: "t",
      name: "t",
      type: "text",
      x: 100,
      y: 100,
      width: 40,
      height: 20,
      pivot: "center",
      visible: true,
      opacity: 1,
      content: "",
      fontSize: 12,
      color: "#000",
      textAlign: "left",
    };
    const b = getCanvasAabb(n);
    expect(b.x).toBe(80);
    expect(b.y).toBe(90);
  });
});
