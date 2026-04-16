import { describe, expect, it } from "vitest";
import { createBlankProject } from "../core/project";
import { createDefaultImage, createDefaultText } from "../core/schema";
import { findTopTextNodeIdAtCanvasPoint } from "./textInlineHit";

describe("findTopTextNodeIdAtCanvasPoint", () => {
  it("returns text id when top hit is text", () => {
    const p = createBlankProject({ name: "t", canvasWidth: 800, canvasHeight: 600 });
    const t = createDefaultText({
      id: "text_1",
      x: 10,
      y: 10,
      width: 200,
      height: 40,
    });
    const root = p.nodes[0];
    if (root.type === "panel") {
      root.children.push(t);
    }
    const id = findTopTextNodeIdAtCanvasPoint(p, 50, 25, () => false);
    expect(id).toBe("text_1");
  });

  it("returns null when top hit is image covering text area", () => {
    const p = createBlankProject({ name: "t", canvasWidth: 800, canvasHeight: 600 });
    const txt = createDefaultText({
      id: "text_1",
      x: 10,
      y: 10,
      width: 200,
      height: 40,
    });
    const img = createDefaultImage({
      id: "img_1",
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      assetId: null,
    });
    const root = p.nodes[0];
    if (root.type === "panel") {
      root.children.push(txt);
      root.children.push(img);
    }
    const id = findTopTextNodeIdAtCanvasPoint(p, 50, 30, () => false);
    expect(id).toBeNull();
  });
});
