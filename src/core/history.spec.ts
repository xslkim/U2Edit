import { describe, expect, it } from "vitest";
import {
  AddAssetCommand,
  AddNodeCommand,
  CompositeCommand,
  HistoryStack,
  PatchNodeCommand,
  RemoveAssetCommand,
  RemoveNodeCommand,
  ReorderCommand,
  findNode,
} from "./history";
import { createDefaultPanel, createDefaultText } from "./schema";
import type { ExportConfig, Project } from "./schema";

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

function minimalProject(): Project {
  const root = createDefaultPanel({
    id: "root_panel",
    name: "Root",
    width: 100,
    height: 100,
    children: [],
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

function noopCmd(i: number): { do: () => void; undo: () => void; label: string } {
  return {
    label: `noop-${i}`,
    do: () => {},
    undo: () => {},
  };
}

describe("T1.4 history", () => {
  it("用例1：push 3 次 undo 3 次回到初始", () => {
    const project = minimalProject();
    const root = findNode(project, "root_panel")!;
    expect(root.node.x).toBe(0);

    const h = new HistoryStack();
    h.push(new PatchNodeCommand(project, "root_panel", { x: 1 }, "a"));
    h.push(new PatchNodeCommand(project, "root_panel", { x: 2 }, "b"));
    h.push(new PatchNodeCommand(project, "root_panel", { x: 3 }, "c"));
    expect(findNode(project, "root_panel")!.node.x).toBe(3);

    expect(h.undo()).toBe(true);
    expect(findNode(project, "root_panel")!.node.x).toBe(2);
    expect(h.undo()).toBe(true);
    expect(findNode(project, "root_panel")!.node.x).toBe(1);
    expect(h.undo()).toBe(true);
    expect(findNode(project, "root_panel")!.node.x).toBe(0);
  });

  it("用例2：undo 1 次再 redo 1 次状态一致", () => {
    const project = minimalProject();
    const h = new HistoryStack();
    h.push(new PatchNodeCommand(project, "root_panel", { x: 99 }, "p"));
    const afterDo = findNode(project, "root_panel")!.node.x;

    expect(h.undo()).toBe(true);
    const afterUndo = findNode(project, "root_panel")!.node.x;

    expect(h.redo()).toBe(true);
    const afterRedo = findNode(project, "root_panel")!.node.x;

    expect(afterRedo).toBe(afterDo);
    expect(afterUndo).toBe(0);
  });

  it("用例3：undo 后再 push 新 cmd，redo 栈清空", () => {
    const project = minimalProject();
    const h = new HistoryStack();
    h.push(new PatchNodeCommand(project, "root_panel", { x: 10 }, "a"));
    expect(h.canRedo()).toBe(false);

    expect(h.undo()).toBe(true);
    expect(h.canRedo()).toBe(true);

    h.push(new PatchNodeCommand(project, "root_panel", { x: 20 }, "b"));
    expect(h.canRedo()).toBe(false);
    expect(findNode(project, "root_panel")!.node.x).toBe(20);
  });

  it("用例4：push 超过 100 条后 length === 100", () => {
    const h = new HistoryStack(100);
    for (let i = 0; i < 101; i++) {
      h.push(noopCmd(i));
    }
    expect(h.length).toBe(100);
  });

  it("用例5：undo 栈空时 undo 返回 false 且不抛错", () => {
    const h = new HistoryStack();
    expect(h.undo()).toBe(false);
  });

  it("PatchNodeCommand 传入 beforeSnapshot 时 undo 回到快照", () => {
    const project = minimalProject();
    const h = new HistoryStack();
    const f = findNode(project, "root_panel")!;
    const before = structuredClone(f.node);
    f.node.x = 42;
    h.push(new PatchNodeCommand(project, "root_panel", { x: 42 }, "drag-x", before));
    expect(f.node.x).toBe(42);
    expect(h.undo()).toBe(true);
    expect(findNode(project, "root_panel")!.node.x).toBe(0);
  });

  it("CompositeCommand：undo 按子命令逆序恢复", () => {
    const project = minimalProject();
    const h = new HistoryStack();
    h.push(
      new CompositeCommand(
        [
          new PatchNodeCommand(project, "root_panel", { x: 1 }, "a"),
          new PatchNodeCommand(project, "root_panel", { y: 2 }, "b"),
        ],
        "ab",
      ),
    );
    expect(findNode(project, "root_panel")!.node.x).toBe(1);
    expect(findNode(project, "root_panel")!.node.y).toBe(2);
    expect(h.undo()).toBe(true);
    expect(findNode(project, "root_panel")!.node.x).toBe(0);
    expect(findNode(project, "root_panel")!.node.y).toBe(0);
  });

  it("附加：Add / Remove / Reorder / Asset 命令可往返", () => {
    const project = minimalProject();
    const h = new HistoryStack();

    const t = createDefaultText({ id: "t1", name: "T", x: 5, y: 5 });
    h.push(new AddNodeCommand(project, "root_panel", 0, t, "add-text"));
    expect(findNode(project, "t1")).not.toBeNull();

    h.undo();
    expect(findNode(project, "t1")).toBeNull();

    h.redo();
    expect(findNode(project, "t1")).not.toBeNull();

    h.push(new ReorderCommand(project, "root_panel", 0, 0, "noop-order"));

    h.push(new RemoveNodeCommand(project, "t1", "rm"));
    expect(findNode(project, "t1")).toBeNull();

    h.undo();
    expect(findNode(project, "t1")).not.toBeNull();

    const asset = { id: "a1", path: "x.png", width: 1, height: 1 };
    h.push(new AddAssetCommand(project, 0, asset, "add-asset"));
    expect(project.assets.some((a) => a.id === "a1")).toBe(true);

    h.push(new RemoveAssetCommand(project, "a1", "rm-asset"));
    expect(project.assets.some((a) => a.id === "a1")).toBe(false);

    h.undo();
    expect(project.assets.some((a) => a.id === "a1")).toBe(true);
  });
});
