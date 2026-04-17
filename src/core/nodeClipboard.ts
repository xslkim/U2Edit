import { maxSuffixForType, placementTopLeftInParent } from "./addNodeHelpers";
import {
  AddNodeCommand,
  CompositeCommand,
  findNode,
  getChildList,
  type Command,
} from "./history";
import type { Node, NodeType, Project } from "./schema";

const NODE_TYPES: NodeType[] = [
  "image",
  "text",
  "button",
  "panel",
  "slider",
  "toggle",
  "inputField",
];

function isParentWithChildren(n: Node): n is Extract<Node, { children: Node[] }> {
  return n.type === "panel" || n.type === "button";
}

function walkPreorder(root: Node, visit: (n: Node) => void): void {
  visit(root);
  if (isParentWithChildren(root)) {
    for (const c of root.children) {
      walkPreorder(c, visit);
    }
  }
}

/** 多选时仅保留「选中根」：若某节点的祖先也在选中集中则去掉该节点 */
export function selectionRootIds(project: Project, selected: ReadonlySet<string>): string[] {
  const rootPanelId = project.nodes[0]?.id;
  const out: string[] = [];
  for (const id of selected) {
    if (id === rootPanelId) {
      continue;
    }
    let under = false;
    let cur = findNode(project, id);
    while (cur?.parent) {
      if (selected.has(cur.parent.id)) {
        under = true;
        break;
      }
      cur = findNode(project, cur.parent.id);
    }
    if (!under) {
      out.push(id);
    }
  }
  return out;
}

/** 深拷贝选中根子树，供内存剪贴板保存 */
export function copyRootsFromSelection(project: Project, selected: ReadonlySet<string>): Node[] {
  const ids = selectionRootIds(project, selected);
  return ids
    .map((id) => {
      const f = findNode(project, id);
      return f ? structuredClone(f.node) : null;
    })
    .filter((n): n is Node => n !== null);
}

/**
 * 为粘贴生成新 id（整棵子树）；先按旧 id 抬升各类型 max，再前序分配新 id。
 */
export function remappedCloneRoots(project: Project, roots: Node[]): Node[] {
  const clones = roots.map((r) => structuredClone(r));
  const max = new Map<NodeType, number>();
  for (const t of NODE_TYPES) {
    max.set(t, maxSuffixForType(project, t));
  }
  for (const root of clones) {
    walkPreorder(root, (n) => {
      const t = n.type;
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^${escaped}_(\\d+)$`);
      const m = n.id.match(re);
      if (m) {
        const v = parseInt(m[1], 10);
        max.set(t, Math.max(max.get(t) ?? 0, v));
      }
    });
  }
  for (const root of clones) {
    walkPreorder(root, (n) => {
      const t = n.type;
      const next = (max.get(t) ?? 0) + 1;
      max.set(t, next);
      n.id = `${t}_${next}`;
    });
  }
  return clones;
}

export type PastePlacement =
  | { kind: "canvas"; x: number; y: number }
  | { kind: "viewport-center"; center: { x: number; y: number } }
  /** T2.3：在剪贴板副本坐标上平移（相对当前粘贴父节点的局部坐标） */
  | { kind: "local-offset"; dx: number; dy: number };

/** Ctrl+V / Ctrl+D 默认偏移（requirements §2.6.5 / tasks T2.3） */
export const SHORTCUT_PASTE_OFFSET = 10;

export interface PasteCommandResult {
  command: Command;
  /** 粘贴后根节点 id（供选中） */
  newRootIds: string[];
}

/** 将剪贴板根列表粘贴到父节点下（末尾追加）；剪贴板为空返回 null */
export function buildPasteCommand(
  project: Project,
  clipboardRoots: Node[] | null | undefined,
  parentId: string,
  placement: PastePlacement,
): PasteCommandResult | null {
  if (!clipboardRoots || clipboardRoots.length === 0) {
    return null;
  }
  const newRoots = remappedCloneRoots(project, clipboardRoots);
  if (placement.kind === "local-offset") {
    for (const root of newRoots) {
      root.x += placement.dx;
      root.y += placement.dy;
    }
  } else {
    for (let i = 0; i < newRoots.length; i++) {
      const node = newRoots[i];
      const ox = i * 16;
      const oy = i * 16;
      let cx: number;
      let cy: number;
      if (placement.kind === "canvas") {
        cx = placement.x + ox;
        cy = placement.y + oy;
      } else {
        cx = placement.center.x + ox;
        cy = placement.center.y + oy;
      }
      const pos = placementTopLeftInParent(project, parentId, { x: cx, y: cy }, node.width, node.height);
      node.x = pos.x;
      node.y = pos.y;
    }
  }
  const newRootIds = newRoots.map((r) => r.id);
  const list = getChildList(project, parentId);
  const start = list.length;
  const cmds: AddNodeCommand[] = [];
  for (let i = 0; i < newRoots.length; i++) {
    cmds.push(new AddNodeCommand(project, parentId, start + i, newRoots[i], "粘贴"));
  }
  if (cmds.length === 1) {
    return { command: cmds[0], newRootIds };
  }
  return { command: new CompositeCommand(cmds, "粘贴"), newRootIds };
}

/** 用于测试：子树内全部 id */
export function collectIdsInForest(roots: Node[]): string[] {
  const out: string[] = [];
  for (const r of roots) {
    walkPreorder(r, (n) => out.push(n.id));
  }
  return out;
}

export function clipboardHasRoots(roots: Node[] | null | undefined): boolean {
  return Array.isArray(roots) && roots.length > 0;
}
