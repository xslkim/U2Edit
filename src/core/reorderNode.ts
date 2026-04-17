import type { Command } from "./history";
import { findNode, getChildList, ReorderCommand } from "./history";
import type { Project } from "./schema";

/** 同一父节点 children 内调整顺序；数组靠后为上层 z-order。根节点或找不到则返回 null */
export function reorderCommandForNode(
  project: Project,
  nodeId: string,
  mode: "up" | "down" | "front" | "back",
): Command | null {
  const f = findNode(project, nodeId);
  if (!f || !f.parent) {
    return null;
  }
  const parentId = f.parent.id;
  const list = getChildList(project, parentId);
  const len = list.length;
  const i = f.index;
  let to = i;
  if (mode === "up") {
    to = Math.min(len - 1, i + 1);
  } else if (mode === "down") {
    to = Math.max(0, i - 1);
  } else if (mode === "front") {
    to = len - 1;
  } else {
    to = 0;
  }
  if (to === i) {
    return null;
  }
  return new ReorderCommand(project, parentId, i, to, "层级");
}
