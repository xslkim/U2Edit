import { describe, it, expect } from "vitest";
import { createBlankProject, stringifyProject } from "../core/project";

/** T3.2：YAML 持久化 export.unity，且不出现 sourceAssetPath */
describe("Unity 导出 YAML", () => {
  it("stringifyProject 含 fontSizeScale 等 export.unity 字段，且不含 sourceAssetPath", () => {
    const p = createBlankProject({ name: "X", canvasWidth: 100, canvasHeight: 100 });
    p.export.unity.fontSizeScale = 1.2;
    p.export.unity.assetRootPath = "Assets/MyUI";
    const yaml = stringifyProject(p);
    expect(yaml).toContain("fontSizeScale");
    expect(yaml).toContain("1.2");
    expect(yaml).toContain("Assets/MyUI");
    expect(yaml).not.toContain("sourceAssetPath");
  });
});
