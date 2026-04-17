import { describe, expect, it } from "vitest";
import { resizeWorldAabbByPointer, RESIZE_MIN, applyWorldAabbToNode } from "./resizeMath";
import { createDefaultPanel, createDefaultText } from "../core/schema";
import type { ExportConfig, Project } from "../core/schema";

const minimalExport: ExportConfig = {
  unity: {
    assetRootPath: "Assets/X",
    defaultFont: "Assets/F.asset",
    fontSizeScale: 1,
    renderMode: "ScreenSpaceOverlay",
    referenceResolution: [1920, 1080],
    screenMatchMode: 0.5,
  },
  unreal: {
    assetRootPath: "/Game/X",
    defaultFont: "/Game/F",
    fontSizeScale: 1,
  },
};

describe("resizeMath", () => {
  it("T2.5 用例1：pivot topLeft + 右下 +50，TL 不动", () => {
    const box = { x: 10, y: 20, width: 100, height: 100 };
    const next = resizeWorldAabbByPointer(box, 7, 160, 170, false, 1, "topLeft");
    expect(next.x).toBe(10);
    expect(next.y).toBe(20);
    expect(next.width).toBe(150);
    expect(next.height).toBe(150);
  });

  it("T2.5 用例2：pivot center 右下拖拽，中心不动", () => {
    const box = { x: 50, y: 50, width: 100, height: 100 };
    const cx = 100;
    const cy = 100;
    const next = resizeWorldAabbByPointer(box, 7, 150, 150, false, 1, "center");
    expect(next.x + next.width / 2).toBe(cx);
    expect(next.y + next.height / 2).toBe(cy);
  });

  it("T2.5 用例4：宽度钳到最小", () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    const next = resizeWorldAabbByPointer(box, 4, 5, 50, false, 1, "topLeft");
    expect(next.width).toBe(RESIZE_MIN);
  });

  it("Shift+角：topLeft 右下保持宽高比", () => {
    const box = { x: 0, y: 0, width: 100, height: 50 };
    const next = resizeWorldAabbByPointer(box, 7, 200, 120, true, 2, "topLeft");
    expect(next.width / next.height).toBeCloseTo(2, 5);
  });

  it("applyWorldAabbToNode：Text 仅改宽高与 pivot 坐标", () => {
    const root = createDefaultPanel({
      id: "root_panel",
      name: "Root",
      width: 1920,
      height: 1080,
      children: [
        createDefaultText({
          id: "text_1",
          name: "t",
          x: 100,
          y: 100,
          width: 200,
          height: 40,
          fontSize: 24,
        }),
      ],
    });
    const proj: Project = {
      meta: { name: "T", schemaVersion: 1, canvasWidth: 1920, canvasHeight: 1080 },
      assets: [],
      nodes: [root],
      export: minimalExport,
    };
    applyWorldAabbToNode(proj, "text_1", { x: 10, y: 20, width: 300, height: 80 });
    const rootNode = proj.nodes[0];
    const n = rootNode.type === "panel" ? rootNode.children[0] : null;
    if (!n || n.type !== "text") {
      throw new Error("text");
    }
    expect(n.fontSize).toBe(24);
    expect(n.width).toBe(300);
    expect(n.height).toBe(80);
  });
});
