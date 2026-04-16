import type { Node, Project } from "../core/schema";

/** requirements：合法 id（非法示例 `1abc`） */
export const NODE_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidNodeIdFormat(id: string): boolean {
  return NODE_ID_PATTERN.test(id.trim());
}

function walkIds(list: Node[], acc: Set<string>): void {
  for (const n of list) {
    acc.add(n.id);
    if (n.type === "panel" || n.type === "button") {
      walkIds(n.children, acc);
    }
  }
}

export function collectAllNodeIds(project: Project): Set<string> {
  const s = new Set<string>();
  walkIds(project.nodes, s);
  return s;
}

/** `excludeIds`：当前选中的 id 在改 id 时从冲突检测中排除 */
export function isNodeIdAvailable(
  project: Project,
  id: string,
  excludeIds: ReadonlySet<string>,
): boolean {
  const all = collectAllNodeIds(project);
  for (const ex of excludeIds) {
    all.delete(ex);
  }
  return !all.has(id);
}
