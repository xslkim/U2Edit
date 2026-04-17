import { describe, expect, it } from "vitest";
import { createBlankProject } from "./project";
import {
  nextAutoNodeId,
  resolveInsertParentId,
  worldTopLeftOfNode,
} from "./addNodeHelpers";
import { createDefaultImage, createDefaultPanel, createDefaultText } from "./schema";
import type { Project } from "./schema";

function minimalProject(): Project {
  return createBlankProject({ name: "p", canvasWidth: 800, canvasHeight: 600 });
}

describe("nextAutoNodeId", () => {
  it("从 image_1 递增", () => {
    const p = minimalProject();
    const root = p.nodes[0];
    if (root.type !== "panel") {
      throw new Error("expected panel root");
    }
    root.children.push(createDefaultImage({ id: "image_1", name: "image_1", x: 0, y: 0 }));
    expect(nextAutoNodeId(p, "image")).toBe("image_2");
  });

  it("跨类型独立计数", () => {
    const p = minimalProject();
    const root = p.nodes[0];
    if (root.type !== "panel") {
      throw new Error("expected panel root");
    }
    root.children.push(createDefaultImage({ id: "image_1", name: "image_1", x: 0, y: 0 }));
    root.children.push(createDefaultText({ id: "text_1", name: "text_1", x: 0, y: 0 }));
    expect(nextAutoNodeId(p, "image")).toBe("image_2");
    expect(nextAutoNodeId(p, "text")).toBe("text_2");
  });
});

describe("resolveInsertParentId", () => {
  it("无选中 → root", () => {
    const p = minimalProject();
    expect(resolveInsertParentId(p, new Set())).toBe("root_panel");
  });

  it("选中 Panel → 该 Panel", () => {
    const p = minimalProject();
    const root = p.nodes[0];
    if (root.type !== "panel") {
      throw new Error("expected panel root");
    }
    const inner = createDefaultPanel({
      id: "panel_1",
      name: "panel_1",
      x: 10,
      y: 10,
      children: [],
    });
    root.children.push(inner);
    expect(resolveInsertParentId(p, new Set(["panel_1"]))).toBe("panel_1");
  });

  it("选中 Image → 与 Image 同父（root）", () => {
    const p = minimalProject();
    const root = p.nodes[0];
    if (root.type !== "panel") {
      throw new Error("expected panel root");
    }
    root.children.push(createDefaultImage({ id: "image_1", name: "image_1", x: 0, y: 0 }));
    expect(resolveInsertParentId(p, new Set(["image_1"]))).toBe("root_panel");
  });
});

describe("worldTopLeftOfNode", () => {
  it("子节点在根画布下累加", () => {
    const p = minimalProject();
    const root = p.nodes[0];
    if (root.type !== "panel") {
      throw new Error("expected panel root");
    }
    root.children.push(createDefaultImage({ id: "image_1", name: "image_1", x: 50, y: 40 }));
    const w = worldTopLeftOfNode(p, "image_1");
    expect(w.x).toBe(50);
    expect(w.y).toBe(40);
  });
});
