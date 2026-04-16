import { describe, expect, it } from "vitest";
import { createBlankProject } from "./project";
import { normalizeAssetRelPath, uniqueAssetIdFromFilename } from "./assetImport";

describe("normalizeAssetRelPath", () => {
  it("unifies slashes", () => {
    expect(normalizeAssetRelPath("\\assets\\a.png")).toBe("assets/a.png");
  });
});

describe("uniqueAssetIdFromFilename", () => {
  it("dedupes against existing assets", () => {
    const p = createBlankProject({ name: "t", canvasWidth: 1, canvasHeight: 1 });
    p.assets.push({ id: "icon", path: "assets/a.png", width: 1, height: 1 });
    expect(uniqueAssetIdFromFilename(p, "icon.png")).toBe("icon_1");
  });
});
