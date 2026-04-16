import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate, registerMigration, resetMigrationsForTest, UnsupportedSchemaError } from "./migrations";
import { parseProjectYaml } from "./project";
import type { Node, Project } from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  resetMigrationsForTest();
});

function collectNames(nodes: Node[]): string[] {
  const out: string[] = [];
  function walk(n: Node): void {
    out.push(n.name);
    if (n.type === "button" || n.type === "panel") {
      for (const c of n.children) {
        walk(c);
      }
    }
  }
  for (const n of nodes) {
    walk(n);
  }
  return out;
}

function walkRawNames(n: unknown, acc: string[]): void {
  if (typeof n !== "object" || n === null) {
    return;
  }
  const r = n as Record<string, unknown>;
  if (typeof r.name === "string") {
    acc.push(r.name);
  }
  const ch = r.children;
  if (Array.isArray(ch)) {
    for (const c of ch) {
      walkRawNames(c, acc);
    }
  }
}

describe("T1.3 migrations", () => {
  it("用例1：schemaVersion=1 无需迁移时 upgraded=false", () => {
    const yamlPath = join(__dirname, "fixtures", "requirements-3.2-sample.yaml");
    const text = readFileSync(yamlPath, "utf-8");
    const raw = yaml.load(text) as object;
    const { upgraded, fromVersion, project } = migrate(raw);
    expect(fromVersion).toBe(1);
    expect(upgraded).toBe(false);
    expect(project.meta.schemaVersion).toBe(1);
  });

  it("用例2：schemaVersion=999 抛 UnsupportedSchemaError（migrate 与 parse）", () => {
    const yamlPath = join(__dirname, "fixtures", "requirements-3.2-sample.yaml");
    const text = readFileSync(yamlPath, "utf-8");
    const raw = yaml.load(text) as Record<string, unknown>;
    if (!raw.meta || typeof raw.meta !== "object") {
      throw new Error("fixture 缺少 meta");
    }
    (raw.meta as Record<string, unknown>).schemaVersion = 999;
    expect(() => migrate(raw)).toThrow(UnsupportedSchemaError);

    const bumped = yaml.load(text) as Record<string, unknown>;
    if (!bumped.meta || typeof bumped.meta !== "object") {
      throw new Error("fixture 缺少 meta");
    }
    (bumped.meta as Record<string, unknown>).schemaVersion = 999;
    expect(() => parseProjectYaml(yaml.dump(bumped))).toThrow(UnsupportedSchemaError);
  });

  it("用例3：注册 v1→v2 后 name 加后缀，upgraded=true，输入对象不被就地修改（磁盘由 migrate 不写）", () => {
    registerMigration(1, 2, (rawUnknown) => {
      const root = rawUnknown as Record<string, unknown>;
      const walk = (n: unknown): void => {
        if (typeof n !== "object" || n === null) {
          return;
        }
        const o = n as Record<string, unknown>;
        if (typeof o.name === "string") {
          o.name = `${o.name}_v2`;
        }
        const ch = o.children;
        if (Array.isArray(ch)) {
          for (const c of ch) {
            walk(c);
          }
        }
      };
      const nodes = root.nodes;
      if (Array.isArray(nodes)) {
        for (const node of nodes) {
          walk(node);
        }
      }
    });

    const yamlPath = join(__dirname, "fixtures", "requirements-3.2-sample.yaml");
    const text = readFileSync(yamlPath, "utf-8");
    const raw = yaml.load(text) as Record<string, unknown>;
    const before = JSON.stringify(raw);
    const { upgraded, project } = migrate(raw);
    expect(JSON.stringify(raw)).toBe(before);
    expect(upgraded).toBe(true);
    expect(project.meta.schemaVersion).toBe(2);

    const namesMigrated = collectNames((project as Project).nodes);
    expect(namesMigrated.length).toBeGreaterThan(0);
    expect(namesMigrated.every((n) => n.endsWith("_v2"))).toBe(true);

    const namesOriginal: string[] = [];
    const roots = raw.nodes;
    expect(Array.isArray(roots)).toBe(true);
    if (Array.isArray(roots)) {
      for (const node of roots) {
        walkRawNames(node, namesOriginal);
      }
    }
    expect(namesOriginal.length).toBeGreaterThan(0);
    expect(namesOriginal.some((n) => !n.endsWith("_v2"))).toBe(true);
  });
});
