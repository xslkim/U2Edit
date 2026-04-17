import { describe, expect, it } from "vitest";
import { getChildList } from "./history";
import { createDefaultPanel, createDefaultText } from "./schema";
import type { ExportConfig, Project } from "./schema";
import { reorderCommandForNode } from "./reorderNode";

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

function projectWithThreeTexts(): Project {
  const root = createDefaultPanel({
    id: "root_panel",
    name: "Root",
    width: 100,
    height: 100,
    children: [
      createDefaultText({ id: "text_1", name: "a", x: 0, y: 0 }),
      createDefaultText({ id: "text_2", name: "b", x: 0, y: 0 }),
      createDefaultText({ id: "text_3", name: "c", x: 0, y: 0 }),
    ],
  });
  return {
    meta: { name: "T", schemaVersion: 1, canvasWidth: 1920, canvasHeight: 1080 },
    assets: [],
    nodes: [root],
    export: minimalExport,
  };
}

describe("reorderNode", () => {
  it("根节点不可重排", () => {
    const p = projectWithThreeTexts();
    expect(reorderCommandForNode(p, "root_panel", "front")).toBeNull();
  });

  it("T2.4 用例1：三节点 A/B/C 选 B 置顶 → [A,C,B]", () => {
    const p = projectWithThreeTexts();
    const cmd = reorderCommandForNode(p, "text_2", "front");
    expect(cmd).not.toBeNull();
    cmd!.do();
    const list = getChildList(p, "root_panel").map((n) => n.id);
    expect(list).toEqual(["text_1", "text_3", "text_2"]);
  });

  it("T2.4 用例2：置底后节点在 children 首位", () => {
    const p = projectWithThreeTexts();
    const cmd = reorderCommandForNode(p, "text_2", "back");
    expect(cmd).not.toBeNull();
    cmd!.do();
    expect(getChildList(p, "root_panel").map((n) => n.id)).toEqual([
      "text_2",
      "text_1",
      "text_3",
    ]);
  });

  it("T2.4 用例3：上移为与下一 sibling 交换（向渲染顶层）", () => {
    const p = projectWithThreeTexts();
    const cmd = reorderCommandForNode(p, "text_1", "up");
    expect(cmd).not.toBeNull();
    cmd!.do();
    expect(getChildList(p, "root_panel").map((n) => n.id)).toEqual([
      "text_2",
      "text_1",
      "text_3",
    ]);
  });

  it("T2.4 用例3：下移为与上一 sibling 交换", () => {
    const p = projectWithThreeTexts();
    const cmd = reorderCommandForNode(p, "text_3", "down");
    expect(cmd).not.toBeNull();
    cmd!.do();
    expect(getChildList(p, "root_panel").map((n) => n.id)).toEqual([
      "text_1",
      "text_3",
      "text_2",
    ]);
  });

  it("T2.4 用例4：已在顶时上移无效", () => {
    const p = projectWithThreeTexts();
    const cmd = reorderCommandForNode(p, "text_3", "up");
    expect(cmd).toBeNull();
  });

  it("T2.4 用例4：已在底时下移无效", () => {
    const p = projectWithThreeTexts();
    const cmd = reorderCommandForNode(p, "text_1", "down");
    expect(cmd).toBeNull();
  });
});
