import { describe, it, expect } from "vitest";
import {
  csStringLiteral,
  csVerbatimPath,
  generateUnityScript,
} from "./unity";
import { createDefaultPanel, createDefaultSlider } from "../core/schema";
import type { ExportConfig, Project } from "../core/schema";

const minimalExport: ExportConfig = {
  unity: {
    assetRootPath: "Assets/LwbGen",
    defaultFont: "Assets/Fonts/Default SDF.asset",
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

describe("T3.1 Unity C# 生成器", () => {
  it("csStringLiteral 转义引号与反斜杠", () => {
    expect(csStringLiteral(`a"b\\c`)).toBe(`"a\\"b\\\\c"`);
  });

  it("csVerbatimPath 生成 C# verbatim 路径", () => {
    expect(csVerbatimPath(`D:\\proj\\assets`)).toBe(`@"D:\\proj\\assets"`);
    expect(csVerbatimPath(`C:\\say "hi"`)).toBe(`@"C:\\say ""hi"""`);
  });

  it("generateUnityScript 含 MenuItem、资源复制、Rect、Slider 层级与 Sprite 导入", () => {
    const root = createDefaultPanel({
      id: "root_panel",
      name: "Root",
      width: 800,
      height: 600,
      children: [
        createDefaultSlider({
          id: "s1",
          name: "Vol",
          x: 100,
          y: 200,
          width: 200,
          height: 24,
        }),
      ],
    });
    const project: Project = {
      meta: {
        name: "DemoProj",
        schemaVersion: 1,
        canvasWidth: 800,
        canvasHeight: 600,
      },
      assets: [{ id: "tex1", path: "img/a.png", width: 1, height: 1 }],
      nodes: [root],
      export: minimalExport,
    };
    const cs = generateUnityScript(project, minimalExport, "D:\\p1\\assets");
    expect(cs).toContain("[MenuItem(");
    expect(cs).toContain("SourceProjectDir");
    expect(cs).toContain('@"D:\\p1\\assets"');
    expect(cs).toContain("static void LwbCopyOne(");
    expect(cs).toMatch(/LwbCopyOne\(\s*@"/);
    // 目标路径通过 Application.dataPath 转换为绝对路径
    expect(cs).toContain("Application.dataPath");
    expect(cs).toContain("_assetRootAbs");
    // 源文件不存在时输出警告而非静默跳过
    expect(cs).toContain("Debug.LogWarning");
    expect(cs).toContain("Path.GetFullPath");
    expect(cs).toContain("CanvasScaler");
    expect(cs).toContain("LwbApplyRect(");
    expect(cs).toContain("LwbApplyRect(rt_4, 100f, 200f");
    expect(cs).toContain('new GameObject("Background")');
    expect(cs).toContain('new GameObject("Fill Area")');
    expect(cs).toContain('new GameObject("Handle Slide Area")');
    expect(cs).toContain("TextureImporterType.Sprite");
    expect(cs).toContain("SpriteImportMode.Single");
    expect(cs).toContain("LoadAllAssetsAtPath");
    expect(cs).toContain("PrefabUtility.SaveAsPrefabAsset");
    expect(cs).toContain('case "tex1": return "img/a.png"');
  });
});
