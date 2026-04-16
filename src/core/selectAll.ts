import { findNode, getChildList } from "./history";
import type { Project } from "./schema";

/**
 * 全选「当前容器」：无选中时为 root_panel；有选中时为第一个选中节点的父节点（父为 null 时用 root）。
 * requirements §2.6.5
 */
export function containerIdForSelectAll(project: Project, selectedIds: ReadonlySet<string>): string | null {
  const rootId = project.nodes[0]?.id;
  if (!rootId) {
    return null;
  }
  if (selectedIds.size === 0) {
    return rootId;
  }
  const first = [...selectedIds][0];
  const f = findNode(project, first);
  if (!f) {
    return rootId;
  }
  if (!f.parent) {
    return rootId;
  }
  return f.parent.id;
}

export function idsDirectChildren(project: Project, containerId: string): string[] {
  return getChildList(project, containerId).map((n) => n.id);
}
