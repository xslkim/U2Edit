import { describe, expect, it } from "vitest";
import { createDefaultPanel, createDefaultText } from "./schema";
import type { ExportConfig, Project } from "./schema";
import { containerIdForSelectAll, idsDirectChildren } from "./selectAll";

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

function projectTwoTextsUnderRoot(): Project {
  const root = createDefaultPanel({
    id: "root_panel",
    name: "Root",
    width: 100,
    height: 100,
    children: [
      createDefaultText({ id: "text_1", name: "a", x: 0, y: 0 }),
      createDefaultText({ id: "text_2", name: "b", x: 0, y: 0 }),
    ],
  });
  return {
    meta: { name: "T", schemaVersion: 1, canvasWidth: 1920, canvasHeight: 1080 },
    assets: [],
    nodes: [root],
    export: minimalExport,
  };
}

describe("selectAll", () => {
  it("无选中时容器为 root", () => {
    const p = projectTwoTextsUnderRoot();
    expect(containerIdForSelectAll(p, new Set())).toBe("root_panel");
  });

  it("选中子节点时容器为其父", () => {
    const p = projectTwoTextsUnderRoot();
    expect(containerIdForSelectAll(p, new Set(["text_1"]))).toBe("root_panel");
  });

  it("idsDirectChildren 列出直接子 id", () => {
    const p = projectTwoTextsUnderRoot();
    expect(idsDirectChildren(p, "root_panel").sort()).toEqual(["text_1", "text_2"].sort());
  });
});
