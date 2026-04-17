import { UnsupportedSchemaError } from "./errors";
import { parseProjectObject } from "./project";
import { CURRENT_SCHEMA_VERSION } from "./schema";
import type { Project } from "./schema";
import { getReadableSchemaCap, notifyRegisteredMigrationTarget, resetReadableCapForTest } from "./schemaVersionPolicy";

export { UnsupportedSchemaError } from "./errors";

type MigrationFn = (raw: Record<string, unknown>) => void;

const registry = new Map<string, MigrationFn>();

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function getMaxRegisteredTo(): number {
  let m = 0;
  for (const key of registry.keys()) {
    const to = Number(key.split("->")[1]);
    if (!Number.isNaN(to)) {
      m = Math.max(m, to);
    }
  }
  return m;
}

/**
 * 登记 `from → to`（必须相邻）迁移；同一对多次注册以后者为准。
 */
export function registerMigration(from: number, to: number, fn: (raw: unknown) => void): void {
  if (to !== from + 1) {
    throw new Error(`registerMigration: 仅支持相邻版本，收到 ${from}→${to}`);
  }
  registry.set(`${from}->${to}`, fn as MigrationFn);
  notifyRegisteredMigrationTarget(to);
}

/** 测试隔离：清空迁移表与可读上限 */
export function resetMigrationsForTest(): void {
  registry.clear();
  resetReadableCapForTest();
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/**
 * 将任意 YAML 反序列化结果升级为当前编辑器可读的最高兼容版本，并解析为 `Project`。
 * 不写磁盘；调用方负责在确认后再 `saveProject`。
 */
export function migrate(raw: unknown): { project: Project; upgraded: boolean; fromVersion: number } {
  if (!isRecord(raw)) {
    throw new Error("migrate: 根对象必须为 mapping");
  }
  const cloned = deepClone(raw) as Record<string, unknown>;
  const meta = cloned.meta;
  if (!isRecord(meta)) {
    throw new Error("migrate: 缺少 meta");
  }
  const sv = meta.schemaVersion;
  if (typeof sv !== "number" || Number.isNaN(sv)) {
    throw new Error("migrate: meta.schemaVersion 无效");
  }

  if (sv > getReadableSchemaCap()) {
    throw new UnsupportedSchemaError(`schemaVersion ${sv} 高于可读上限 ${getReadableSchemaCap()}`);
  }

  const fromVersion = sv;
  let v = sv;
  const targetVersion = Math.max(CURRENT_SCHEMA_VERSION, getMaxRegisteredTo());
  let upgraded = false;

  while (v < targetVersion) {
    const step = registry.get(`${v}->${v + 1}`);
    if (step) {
      step(cloned);
      const m = cloned.meta;
      if (!isRecord(m)) {
        throw new Error("migrate: meta 丢失");
      }
      m.schemaVersion = v + 1;
      v = v + 1;
      upgraded = true;
      continue;
    }
    if (v < CURRENT_SCHEMA_VERSION) {
      throw new Error(`缺少迁移步骤 ${v}→${v + 1}，无法升级到 CURRENT_SCHEMA_VERSION=${CURRENT_SCHEMA_VERSION}`);
    }
    break;
  }

  const project = parseProjectObject(cloned);
  return { project, upgraded, fromVersion };
}
