import { describe, expect, it } from "vitest";
import { HistoryStack } from "./history";
import { findNode } from "./history";
import { createDefaultPanel, createDefaultText, type Project } from "./schema";
import {
  buildMoveNodeCommand,
  globalLevel,
  insertIndexAfterNode,
  insertIndexAppendChild,
  MAX_TREE_DEPTH,
  validateTreeMove,
} from "./treeMove";

const minimalExport = {
  unity: {
    assetRootPath: "Assets/X",
    defaultFont: "Assets/F.asset",
    fontSizeScale: 1,
    renderMode: "ScreenSpaceOverlay" as const,
    referenceResolution: [1920, 1080] as [number, number],
    screenMatchMode: 0.5,
  },
  unreal: {
    assetRootPath: "/Game/X",
    defaultFont: "/Game/F",
    fontSizeScale: 1,
  },
};

function projectWithTree(): Project {
  const root = createDefaultPanel({
    id: "root_panel",
    name: "Root",
    width: 100,
    height: 100,
    children: [
      createDefaultText({ id: "t1", name: "btn_a", x: 0, y: 0, content: "a" }),
      createDefaultPanel({
        id: "p1",
        name: "Panel1",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        children: [
          createDefaultText({ id: "t2", name: "btn_b", x: 0, y: 0, content: "b" }),
        ],
      }),
    ],
  });
  return {
    meta: {
      name: "T",
      schemaVersion: 1,
      canvasWidth: 1920,
      canvasHeight: 1080,
    },
    assets: [],
    nodes: [root],
    export: minimalExport,
  };
}

describe("treeMove", () => {
  it("globalLevel：root 为 1", () => {
    const p = projectWithTree();
    expect(globalLevel(p, "root_panel")).toBe(1);
    expect(globalLevel(p, "t1")).toBe(2);
    expect(globalLevel(p, "t2")).toBe(3);
  });

  it("拖到 Panel 下：跨父 Composite 生效", () => {
    const p = projectWithTree();
    const idx = insertIndexAppendChild(p, "t1", "p1");
    expect(idx).toBe(1);
    const cmd = buildMoveNodeCommand(p, "t1", "p1", idx!);
    expect(cmd).not.toBeNull();
    const h = new HistoryStack();
    h.push(cmd!);
    expect(findNode(p, "t1")?.parent?.id).toBe("p1");
    expect(h.undo()).toBe(true);
    expect(findNode(p, "t1")?.parent?.id).toBe("root_panel");
  });

  it("同级 after：ReorderCommand", () => {
    const p = projectWithTree();
    const ins = insertIndexAfterNode(p, "t1", "root_panel", "p1");
    expect(ins).toBe(1);
    const cmd = buildMoveNodeCommand(p, "t1", "root_panel", ins!);
    expect(cmd).not.toBeNull();
    new HistoryStack().push(cmd!);
    const ch = findNode(p, "root_panel")!.node;
    expect(ch.type).toBe("panel");
    if (ch.type === "panel") {
      expect(ch.children.map((c) => c.id)).toEqual(["p1", "t1"]);
    }
  });

  it("Text 不能拖入 Text：非容器拒绝", () => {
    const p = projectWithTree();
    const v = validateTreeMove(p, "t1", "t2");
    expect(v.ok).toBe(false);
  });

  it("超过 6 层：拒绝", () => {
    let inner: ReturnType<typeof createDefaultPanel> | ReturnType<typeof createDefaultText> = createDefaultPanel({
      id: "p6",
      name: "P6",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      children: [],
    });
    for (let d = 5; d >= 2; d--) {
      inner = createDefaultPanel({
        id: `p${d}`,
        name: `P${d}`,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        children: [inner],
      });
    }
    const root = createDefaultPanel({
      id: "root_panel",
      name: "Root",
      width: 100,
      height: 100,
      children: [
        createDefaultText({ id: "t_move", name: "mv", x: 0, y: 0, content: "x" }),
        inner,
      ],
    });
    const proj: Project = {
      meta: {
        name: "T",
        schemaVersion: 1,
        canvasWidth: 1920,
        canvasHeight: 1080,
      },
      assets: [],
      nodes: [root],
      export: minimalExport,
    };
    expect(globalLevel(proj, "p6")).toBe(MAX_TREE_DEPTH);
    const v = validateTreeMove(proj, "t_move", "p6");
    expect(v.ok).toBe(false);
    expect(v.message).toContain("6");
  });
});
