import { joinProjectPath } from "./project";
import type { Project } from "./schema";

/** 将 manifest 中的 assetId 解析为磁盘绝对路径（与画布加载一致） */
export function resolveAssetAbsolute(
  project: Project,
  projectDir: string | null,
  assetId: string | null,
): string | null {
  if (!projectDir || !assetId) {
    return null;
  }
  const ref = project.assets.find((a) => a.id === assetId);
  if (!ref) {
    return null;
  }
  const rel = ref.path.replace(/^[/\\]+/, "");
  return joinProjectPath(projectDir, rel);
}
