import { describe, expect, it } from "vitest";
import { createBlankProject } from "../core/project";
import { createDefaultButton, createDefaultImage, createDefaultPanel } from "../core/schema";
import { resolveImageDropParentId } from "./dropParent";

describe("resolveImageDropParentId", () => {
  it("uses root when empty", () => {
    const p = createBlankProject({ name: "t", canvasWidth: 800, canvasHeight: 600 });
    const id = resolveImageDropParentId(p, 400, 300, () => false);
    expect(id).toBe("root_panel");
  });

  it("picks topmost panel under point (nested)", () => {
    const p = createBlankProject({ name: "t", canvasWidth: 800, canvasHeight: 600 });
    const inner = createDefaultPanel({
      id: "panel_inner",
      name: "Inner",
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      children: [],
    });
    const root1 = p.nodes[0];
    if (root1.type === "panel") {
      root1.children.push(inner);
    }
    const id = resolveImageDropParentId(p, 150, 150, () => false);
    expect(id).toBe("panel_inner");
  });

  it("skips image on top and uses panel below", () => {
    const p = createBlankProject({ name: "t", canvasWidth: 800, canvasHeight: 600 });
    const inner = createDefaultPanel({
      id: "panel_inner",
      name: "Inner",
      x: 0,
      y: 0,
      width: 300,
      height: 300,
      children: [],
    });
    const img = createDefaultImage({
      id: "img_1",
      name: "I",
      x: 10,
      y: 10,
      width: 80,
      height: 80,
      assetId: null,
    });
    inner.children.push(img);
    const root2 = p.nodes[0];
    if (root2.type === "panel") {
      root2.children.push(inner);
    }
    const id = resolveImageDropParentId(p, 50, 50, () => false);
    expect(id).toBe("panel_inner");
  });

  it("uses button as parent when drop inside button", () => {
    const p = createBlankProject({ name: "t", canvasWidth: 800, canvasHeight: 600 });
    const btn = createDefaultButton({
      id: "btn_1",
      name: "B",
      x: 50,
      y: 50,
      width: 120,
      height: 40,
      children: [],
    });
    const root3 = p.nodes[0];
    if (root3.type === "panel") {
      root3.children.push(btn);
    }
    const id = resolveImageDropParentId(p, 100, 70, () => false);
    expect(id).toBe("btn_1");
  });
});
