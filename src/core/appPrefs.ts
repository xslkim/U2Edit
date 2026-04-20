/**
 * 轻量偏好持久化（localStorage）。
 * 仅存路径等小型字符串，不做版本迁移。
 */

const K_LAST_PROJECT_DIR = "lwb.lastProjectDir";
const K_LAST_UNITY_EXPORT = "lwb.lastUnityExport";

function get(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function set(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 存储已满等情况，忽略 */
  }
}

/** 上次成功打开或新建的项目目录 */
export function getLastProjectDir(): string | undefined {
  return get(K_LAST_PROJECT_DIR);
}

export function setLastProjectDir(dir: string): void {
  set(K_LAST_PROJECT_DIR, dir);
}

/** 上次 Unity 导出 .cs 文件的完整路径 */
export function getLastUnityExportPath(): string | undefined {
  return get(K_LAST_UNITY_EXPORT);
}

export function setLastUnityExportPath(p: string): void {
  set(K_LAST_UNITY_EXPORT, p);
}
