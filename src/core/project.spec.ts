import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  createBlankProject,
  joinProjectPath,
  parseProjectYaml,
  stringifyProject,
  validate,
} from "./project";
import {
  createDefaultPanel,
  createDefaultText,
  createDefaultImage,
} from "./schema";
import type { ExportConfig, Project } from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function minimalMeta() {
  return {
    name: "T",
    schemaVersion: 1 as const,
    canvasWidth: 1920,
    canvasHeight: 1080,
  };
}

describe("T1.2 project YAML", () => {
  it("用例1：加载 requirements §3.2 示例 YAML，warnings 为空且 validate 通过", () => {
    const yamlPath = join(__dirname, "fixtures", "requirements-3.2-sample.yaml");
    const text = readFileSync(yamlPath, "utf-8");
    const project = parseProjectYaml(text);
    expect(validate(project)).toEqual([]);
    // loadProject 返回 warnings: [] — 此处等价
  });

  it("用例2：重复 id 时错误信息包含该 id", () => {
    const root = createDefaultPanel({
      id: "root_panel",
      name: "Root",
      width: 100,
      height: 100,
      children: [
        createDefaultText({ id: "dup", name: "A", x: 0, y: 0 }),
        createDefaultText({ id: "dup", name: "B", x: 0, y: 0 }),
      ],
    });
    const project: Project = {
      meta: minimalMeta(),
      assets: [],
      nodes: [root],
      export: minimalExport,
    };
    const errs = validate(project);
    expect(errs.some((e) => e.code === "DUPLICATE_ID")).toBe(true);
    expect(errs.some((e) => e.message.includes("dup"))).toBe(true);
  });

  it("用例3：id = 123abc 校验不通过", () => {
    const root = createDefaultPanel({
      id: "root_panel",
      name: "Root",
      width: 100,
      height: 100,
      children: [createDefaultText({ id: "123abc", name: "Bad", x: 0, y: 0 })],
    });
    const project: Project = {
      meta: minimalMeta(),
      assets: [],
      nodes: [root],
      export: minimalExport,
    };
    expect(validate(project).some((e) => e.code === "ID_FORMAT")).toBe(true);
  });

  it("用例4：嵌套 7 层（最深节点深度 7）校验不通过", () => {
    let inner = createDefaultPanel({ id: "n7", name: "N7", width: 10, height: 10, children: [] });
    for (let d = 6; d >= 1; d -= 1) {
      inner = createDefaultPanel({
        id: `n${d}`,
        name: `N${d}`,
        width: 100,
        height: 100,
        children: [inner],
      });
    }
    const project: Project = {
      meta: minimalMeta(),
      assets: [],
      nodes: [inner],
      export: minimalExport,
    };
    expect(validate(project).some((e) => e.code === "DEPTH")).toBe(true);
  });

  it("用例5：assetId 不存在", () => {
    const root = createDefaultPanel({
      id: "root_panel",
      name: "Root",
      width: 100,
      height: 100,
      children: [createDefaultImage({ id: "im", name: "I", assetId: "不存在的id", x: 0, y: 0 })],
    });
    const project: Project = {
      meta: minimalMeta(),
      assets: [],
      nodes: [root],
      export: minimalExport,
    };
    expect(validate(project).some((e) => e.code === "ASSET_MISSING")).toBe(true);
  });

  it("用例6：parse → stringify → parse 深度相等", () => {
    const yamlPath = join(__dirname, "fixtures", "requirements-3.2-sample.yaml");
    const text = readFileSync(yamlPath, "utf-8");
    const a = parseProjectYaml(text);
    const b = parseProjectYaml(stringifyProject(a));
    expect(b).toEqual(a);
  });

  it("用例7：nodes 为空 / 双根 / 根非 panel", () => {
    const base = (): Project => ({
      meta: minimalMeta(),
      assets: [],
      export: minimalExport,
      nodes: [],
    });
    expect(validate(base()).some((e) => e.code === "ROOT_COUNT")).toBe(true);

    const twoRoots: Project = {
      ...base(),
      nodes: [
        createDefaultPanel({ id: "a", name: "A", width: 1, height: 1, children: [] }),
        createDefaultPanel({ id: "b", name: "B", width: 1, height: 1, children: [] }),
      ],
    };
    expect(validate(twoRoots).some((e) => e.code === "ROOT_COUNT")).toBe(true);

    const badRoot: Project = {
      ...base(),
      nodes: [createDefaultText({ id: "root_panel", name: "T", x: 0, y: 0 })],
    };
    expect(validate(badRoot).some((e) => e.code === "ROOT_TYPE")).toBe(true);
  });
});

describe("T1.6 新建项目数据", () => {
  it("createBlankProject：meta.name、单根 panel、assets 空、export 分辨率", () => {
    const p = createBlankProject({ name: "MyGame", canvasWidth: 800, canvasHeight: 600 });
    expect(p.meta.name).toBe("MyGame");
    expect(p.meta.canvasWidth).toBe(800);
    expect(p.meta.canvasHeight).toBe(600);
    expect(p.assets).toEqual([]);
    expect(p.nodes).toHaveLength(1);
    expect(p.nodes[0].type).toBe("panel");
    expect(p.nodes[0].id).toBe("root_panel");
    expect(p.export.unity.referenceResolution).toEqual([800, 600]);
  });

  it("joinProjectPath：Windows 风格目录使用反斜杠", () => {
    expect(joinProjectPath("E:\\foo", "project.yaml")).toBe("E:\\foo\\project.yaml");
  });
});
