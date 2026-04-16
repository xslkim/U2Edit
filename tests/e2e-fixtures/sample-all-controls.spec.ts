import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseProjectYaml, validate } from "../../src/core/project";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("T3.3 sample-all-controls.yaml", () => {
  it("可解析且 validate 通过（七种控件 + 嵌套 + 多图）", () => {
    const path = join(__dirname, "sample-all-controls.yaml");
    const text = readFileSync(path, "utf-8");
    const project = parseProjectYaml(text);
    expect(project.meta.name).toBe("AllControls_E2E");
    expect(project.assets.length).toBeGreaterThanOrEqual(10);
    const errs = validate(project);
    expect(errs, JSON.stringify(errs)).toEqual([]);
  });
});
