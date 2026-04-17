import { CURRENT_SCHEMA_VERSION } from "./schema";

/** 由 migrations 注册的「可读」上限增量（避免 project ↔ migrations 循环依赖） */
let migrationMaxReadable = 0;

/** 注册 v1→v2 等迁移时调用，放宽 parse 可读 schema 上限 */
export function notifyRegisteredMigrationTarget(toVersion: number): void {
  migrationMaxReadable = Math.max(migrationMaxReadable, toVersion);
}

/** 当前允许读入的最高 schemaVersion（CURRENT 与已登记迁移目标的较大值） */
export function getReadableSchemaCap(): number {
  return Math.max(CURRENT_SCHEMA_VERSION, migrationMaxReadable);
}

/** Vitest 用：重置登记的上限 */
export function resetReadableCapForTest(): void {
  migrationMaxReadable = 0;
}
