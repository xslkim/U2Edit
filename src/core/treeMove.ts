import type { Command } from "./history";
import {
  AddNodeCommand,
  CompositeCommand,
  findNode,
  getChildList,
  RemoveNodeCommand,
  ReorderCommand,
} from "./history";
import type { Node, Project } from "./schema";

/** 需求：root 为第 1 层，整棵树最深不超过 6 层 */
export const MAX_TREE_DEPTH = 6;

function isContainer(n: Node): n is Extract<Node, { children: Node[] }> {
  return n.type === "panel" || n.type === "button";
}

/** root 为第 1 层 */
export function globalLevel(project: Project, nodeId: string): number {
  let level = 0;
  function walk(list: Node[], depth: number): boolean {
    for (const n of list) {
      const next = depth + 1;
      if (n.id === nodeId) {
        level = next;
        return true;
      }
      if (isContainer(n) && walk(n.children, next)) {
        return true;
      }
    }
    return false;
  }
  walk(project.nodes, 0);
  if (level === 0) {
    throw new Error(`globalLevel: 找不到 ${nodeId}`);
  }
  return level;
}

/** 子树内节点的最大全局层级（含自身） */
export function maxGlobalLevelInSubtree(project: Project, nodeId: string): number {
  const f = findNode(project, nodeId);
  if (!f) {
    throw new Error(`maxGlobalLevelInSubtree: 找不到 ${nodeId}`);
  }
  let max = globalLevel(project, nodeId);
  if (isContainer(f.node)) {
    for (const c of f.node.children) {
      max = Math.max(max, maxGlobalLevelInSubtree(project, c.id));
    }
  }
  return max;
}

/** `ancestorId` 是否为 `descendantId` 的祖先（含自身） */
export function isAncestorOrSelf(project: Project, ancestorId: string, descendantId: string): boolean {
  if (ancestorId === descendantId) {
    return true;
  }
  const f = findNode(project, descendantId);
  if (!f || !f.parent) {
    return false;
  }
  return isAncestorOrSelf(project, ancestorId, f.parent.id);
}

export interface TreeMoveValidation {
  ok: boolean;
  /** 需求 2.9 / 2.11.3 文案 */
  message?: string;
}

export function validateTreeMove(project: Project, movedId: string, newParentId: string): TreeMoveValidation {
  const root = project.nodes[0];
  if (!root || movedId === root.id) {
    return { ok: false, message: "不能移动根节点" };
  }

  const moved = findNode(project, movedId);
  if (!moved) {
    return { ok: false, message: "找不到被拖拽节点" };
  }

  const np = findNode(project, newParentId);
  if (!np || !isContainer(np.node)) {
    return { ok: false, message: "只能拖入 Panel 或 Button 下" };
  }

  if (movedId === newParentId) {
    return { ok: false, message: "不能拖入自身" };
  }

  if (isAncestorOrSelf(project, movedId, newParentId)) {
    return { ok: false, message: "不能拖入自己的子节点内" };
  }

  const maxOld = maxGlobalLevelInSubtree(project, movedId);
  const Lm = globalLevel(project, movedId);
  const Lp = globalLevel(project, newParentId);
  const delta = Lp + 1 - Lm;
  if (maxOld + delta > MAX_TREE_DEPTH) {
    return { ok: false, message: "超过最大嵌套层级（6 层）" };
  }

  return { ok: true };
}

/**
 * 将 `movedId` 从当前位置移除后，插入到 `newParentId` 的 `children` 的 `insertIndex`。
 * 索引相对于「已移除 `movedId` 之后」的目标父列表。
 */
export function buildMoveNodeCommand(
  project: Project,
  movedId: string,
  newParentId: string,
  insertIndex: number,
  label = "移动节点",
): Command | null {
  const v = validateTreeMove(project, movedId, newParentId);
  if (!v.ok) {
    return null;
  }

  const moved = findNode(project, movedId)!;
  const oldParentId = moved.parent ? moved.parent.id : null;
  const fromIndex = moved.index;

  if (oldParentId === newParentId) {
    const list = getChildList(project, newParentId);
    const n = list.length;
    if (insertIndex < 0 || insertIndex >= n) {
      return null;
    }
    if (fromIndex === insertIndex) {
      return null;
    }
    return new ReorderCommand(project, newParentId, fromIndex, insertIndex, label);
  }

  const tlist = getChildList(project, newParentId);
  if (insertIndex < 0 || insertIndex > tlist.length) {
    return null;
  }

  const snap = structuredClone(moved.node);
  return new CompositeCommand(
    [
      new RemoveNodeCommand(project, movedId, `${label}-remove`),
      new AddNodeCommand(project, newParentId, insertIndex, snap, `${label}-add`),
    ],
    label,
  );
}

function targetIndexAfterRemoval(sameList: boolean, fromIndex: number, targetIndexBeforeRemoval: number): number {
  if (!sameList) {
    return targetIndexBeforeRemoval;
  }
  if (fromIndex < targetIndexBeforeRemoval) {
    return targetIndexBeforeRemoval - 1;
  }
  return targetIndexBeforeRemoval;
}

/**
 * 插入到 `targetId` 之前（同一父下），得到 `movedId` 在目标父列表中的插入下标（移除 moved 之后）。
 */
export function insertIndexBeforeNode(
  project: Project,
  movedId: string,
  targetParentId: string,
  targetId: string,
): number | null {
  const moved = findNode(project, movedId);
  const target = findNode(project, targetId);
  if (!moved || !target || target.parent?.id !== targetParentId) {
    return null;
  }
  const ti = target.index;
  const sameList = moved.parent?.id === targetParentId;
  return targetIndexAfterRemoval(sameList, moved.index, ti);
}

/**
 * 插入到 `targetId` 之后（同一父下）。
 */
export function insertIndexAfterNode(
  project: Project,
  movedId: string,
  targetParentId: string,
  targetId: string,
): number | null {
  const moved = findNode(project, movedId);
  const target = findNode(project, targetId);
  if (!moved || !target || target.parent?.id !== targetParentId) {
    return null;
  }
  const ti = target.index + 1;
  const sameList = moved.parent?.id === targetParentId;
  return targetIndexAfterRemoval(sameList, moved.index, ti);
}

/** 作为容器最后一个子节点插入 */
export function insertIndexAppendChild(project: Project, movedId: string, containerId: string): number | null {
  const moved = findNode(project, movedId);
  const c = findNode(project, containerId);
  if (!moved || !c || !isContainer(c.node)) {
    return null;
  }
  const list = getChildList(project, containerId);
  const ti = list.length;
  const sameList = moved.parent?.id === containerId;
  const fromIndex = moved.index;
  return targetIndexAfterRemoval(sameList, fromIndex, ti);
}

export type TreeDropZone = "before" | "after" | "into";

/** 节点树拖拽落点 → 可执行命令（供 NodeTree 使用） */
export function planTreeDrop(
  project: Project,
  draggedId: string,
  targetId: string,
  zone: TreeDropZone,
  rootId: string,
): { ok: true; cmd: Command } | { ok: false; message: string } {
  if (draggedId === targetId) {
    return { ok: false, message: "目标与拖拽相同" };
  }
  if (draggedId === rootId) {
    return { ok: false, message: "不能移动根节点" };
  }

  const target = findNode(project, targetId);
  if (!target) {
    return { ok: false, message: "找不到目标节点" };
  }

  const fail = (pid: string): { ok: false; message: string } => {
    const v = validateTreeMove(project, draggedId, pid);
    return { ok: false, message: v.ok ? "无法完成移动" : v.message ?? "无法完成移动" };
  };

  if (zone === "into") {
    if (!isContainer(target.node)) {
      return { ok: false, message: "只能拖入 Panel 或 Button 下" };
    }
    const idx = insertIndexAppendChild(project, draggedId, targetId);
    if (idx === null) {
      return { ok: false, message: "无法插入" };
    }
    const cmd = buildMoveNodeCommand(project, draggedId, targetId, idx);
    if (!cmd) {
      return fail(targetId);
    }
    return { ok: true, cmd };
  }

  if (zone === "before") {
    if (targetId === rootId) {
      return { ok: false, message: "不能在根之前插入" };
    }
    const pid = target.parent?.id;
    if (!pid) {
      return { ok: false, message: "无法在此外插入" };
    }
    const idx = insertIndexBeforeNode(project, draggedId, pid, targetId);
    if (idx === null) {
      return { ok: false, message: "无法插入" };
    }
    const cmd = buildMoveNodeCommand(project, draggedId, pid, idx);
    if (!cmd) {
      return fail(pid);
    }
    return { ok: true, cmd };
  }

  if (targetId === rootId) {
    const cmd = buildMoveNodeCommand(project, draggedId, rootId, 0);
    if (!cmd) {
      return fail(rootId);
    }
    return { ok: true, cmd };
  }

  const pid = target.parent?.id;
  if (!pid) {
    return { ok: false, message: "无法在此外插入" };
  }
  const idx = insertIndexAfterNode(project, draggedId, pid, targetId);
  if (idx === null) {
    return { ok: false, message: "无法插入" };
  }
  const cmd = buildMoveNodeCommand(project, draggedId, pid, idx);
  if (!cmd) {
    return fail(pid);
  }
  return { ok: true, cmd };
}
