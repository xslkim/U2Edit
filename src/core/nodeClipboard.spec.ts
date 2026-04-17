import { describe, expect, it } from "vitest";
import { findNode, getChildList, HistoryStack } from "./history";
import { createDefaultPanel, createDefaultText } from "./schema";
import type { ExportConfig, Project } from "./schema";
import {
  buildPasteCommand,
  clipboardHasRoots,
  copyRootsFromSelection,
  remappedCloneRoots,
  selectionRootIds,
  SHORTCUT_PASTE_OFFSET,
} from "./nodeClipboard";

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

function nestedProject(): Project {
  const inner = createDefaultText({ id: "text_inner", name: "i", x: 0, y: 0 });
  const panel = createDefaultPanel({
    id: "panel_1",
    name: "P",
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    children: [inner],
  });
  const root = createDefaultPanel({
    id: "root_panel",
    name: "Root",
    width: 100,
    height: 100,
    children: [panel],
  });
  return {
    meta: { name: "T", schemaVersion: 1, canvasWidth: 1920, canvasHeight: 1080 },
    assets: [],
    nodes: [root],
    export: minimalExport,
  };
}

describe("nodeClipboard", () => {
  it("多选父子时仅复制选中根", () => {
    const p = nestedProject();
    const sel = new Set(["panel_1", "text_inner"]);
    const roots = selectionRootIds(p, sel);
    expect(roots).toEqual(["panel_1"]);
    const copied = copyRootsFromSelection(p, sel);
    expect(copied).toHaveLength(1);
    expect(copied[0].id).toBe("panel_1");
    const orig = findNode(p, "panel_1")!.node;
    expect(orig.type === "panel" ? orig.children.length : 0).toBe(1);
  });

  it("remappedCloneRoots 生成全新 id", () => {
    const p = nestedProject();
    const sel = new Set(["panel_1"]);
    const roots = copyRootsFromSelection(p, sel);
    const next = remappedCloneRoots(p, roots);
    expect(next).toHaveLength(1);
    expect(next[0].id).not.toBe("panel_1");
    const panel = next[0];
    if (panel.type !== "panel") {
      throw new Error("expected panel");
    }
    expect(panel.children[0].id).not.toBe("text_inner");
  });

  it("剪贴板为空时 buildPasteCommand 为 null", () => {
    const p = nestedProject();
    expect(
      buildPasteCommand(p, null, "root_panel", { kind: "canvas", x: 10, y: 20 }),
    ).toBeNull();
    expect(clipboardHasRoots(null)).toBe(false);
  });

  it("粘贴入栈后子树出现在父节点下", () => {
    const p = nestedProject();
    const roots = copyRootsFromSelection(p, new Set(["panel_1"]));
    const r = buildPasteCommand(p, roots, "root_panel", { kind: "canvas", x: 100, y: 100 });
    expect(r).not.toBeNull();
    const h = new HistoryStack();
    h.push(r!.command);
    const list = getChildList(p, "root_panel");
    expect(list.length).toBe(2);
    const pasted = list[1];
    expect(pasted.id).not.toBe("panel_1");
    expect("children" in pasted && pasted.children.length).toBe(1);
  });

  it("T2.3：local-offset 为根节点加 (10,10)", () => {
    const p = nestedProject();
    const roots = copyRootsFromSelection(p, new Set(["panel_1"]));
    const r = buildPasteCommand(p, roots, "root_panel", {
      kind: "local-offset",
      dx: SHORTCUT_PASTE_OFFSET,
      dy: SHORTCUT_PASTE_OFFSET,
    });
    expect(r).not.toBeNull();
    const h = new HistoryStack();
    h.push(r!.command);
    const pasted = getChildList(p, "root_panel")[1];
    expect(pasted.x).toBe(10);
    expect(pasted.y).toBe(10);
  });
});
