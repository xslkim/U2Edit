import { describe, expect, it } from "vitest";
import { resolveAssetAbsolute } from "./renderer";
import type { Project } from "../core/schema";

function minimalProject(assets: Project["assets"]): Project {
  return {
    meta: {
      name: "p",
      schemaVersion: 1,
      canvasWidth: 800,
      canvasHeight: 600,
    },
    export: {
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
    },
    assets,
    nodes: [],
  };
}

describe("resolveAssetAbsolute", () => {
  it("returns null when projectDir or assetId missing", () => {
    const p = minimalProject([{ id: "a", path: "assets/x.png", width: 1, height: 1 }]);
    expect(resolveAssetAbsolute(p, null, "a")).toBeNull();
    expect(resolveAssetAbsolute(p, "C:\\proj", null)).toBeNull();
  });

  it("joins project dir with asset path from manifest", () => {
    const p = minimalProject([{ id: "bg", path: "assets/ui/bg.png", width: 1, height: 1 }]);
    const abs = resolveAssetAbsolute(p, "C:\\MyProj", "bg");
    expect(abs).toMatch(/[/\\]MyProj[/\\]assets[/\\]ui[/\\]bg\.png$/);
  });

  it("returns null when asset id not in manifest", () => {
    const p = minimalProject([]);
    expect(resolveAssetAbsolute(p, "C:\\p", "missing")).toBeNull();
  });
});
