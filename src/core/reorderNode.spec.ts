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

  it("置顶：子节点移到 children 末尾", () => {
    const p = projectWithThreeTexts();
    const cmd = reorderCommandForNode(p, "text_2", "front");
    expect(cmd).not.toBeNull();
    cmd!.do();
    const list = getChildList(p, "root_panel").map((n) => n.id);
    expect(list).toEqual(["text_1", "text_3", "text_2"]);
  });

  it("已在顶时上移无效", () => {
    const p = projectWithThreeTexts();
    const cmd = reorderCommandForNode(p, "text_3", "up");
    expect(cmd).toBeNull();
  });

  it("已在底时下移无效", () => {
    const p = projectWithThreeTexts();
    const cmd = reorderCommandForNode(p, "text_1", "down");
    expect(cmd).toBeNull();
  });
});
