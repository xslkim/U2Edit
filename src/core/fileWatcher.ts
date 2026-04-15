import { watchImmediate } from "@tauri-apps/plugin-fs";

const disposers = new Map<string, () => void>();

/**
 * 监听路径（文件或目录）变更。同一 path 重复 watch 会先取消上一次。
 */
export async function watch(
  path: string,
  callback: () => void,
): Promise<void> {
  await unwatch(path);
  const dispose = await watchImmediate(path, () => {
    callback();
  });
  disposers.set(path, dispose);
}

export async function unwatch(path: string): Promise<void> {
  const dispose = disposers.get(path);
  if (dispose) {
    dispose();
    disposers.delete(path);
  }
}
