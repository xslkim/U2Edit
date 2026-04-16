import { findNode } from "./history";
import type { Node, NodeType, Project } from "./schema";
import {
  createDefaultButton,
  createDefaultImage,
  createDefaultInputField,
  createDefaultPanel,
  createDefaultSlider,
  createDefaultText,
  createDefaultToggle,
} from "./schema";
import { nodeTopLeft } from "../canvas/pivotMath";

function collectAllIds(nodes: Node[]): string[] {
  const out: string[] = [];
  function walk(n: Node): void {
    out.push(n.id);
    if ("children" in n && n.children.length) {
      for (const c of n.children) {
        walk(c);
      }
    }
  }
  for (const n of nodes) {
    walk(n);
  }
  return out;
}

/** 节点包围盒左上角在根画布坐标系中的位置（累加父链） */
export function worldTopLeftOfNode(project: Project, nodeId: string): { x: number; y: number } {
  const f = findNode(project, nodeId);
  if (!f) {
    return { x: 0, y: 0 };
  }
  const n = f.node;
  const tl = nodeTopLeft(n.pivot, n.x, n.y, n.width, n.height);
  if (!f.parent) {
    return tl;
  }
  const pw = worldTopLeftOfNode(project, f.parent.id);
  return { x: pw.x + tl.x, y: pw.y + tl.y };
}

/**
 * 将视口中心（根画布坐标）对应为父节点局部坐标下的 (x,y)，
 * 使新建节点（pivot topLeft）几何中心落在视口中心。
 */
export function placementTopLeftInParent(
  project: Project,
  parentId: string,
  viewportCenterRoot: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  const wx = viewportCenterRoot.x - width / 2;
  const wy = viewportCenterRoot.y - height / 2;
  const pWorld = worldTopLeftOfNode(project, parentId);
  return {
    x: wx - pWorld.x,
    y: wy - pWorld.y,
  };
}

/** requirements §2.6.2：`{type}_{自增}`，序号按类型取当前最大 +1 */
export function nextAutoNodeId(project: Project, type: NodeType): string {
  const escaped = type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}_(\\d+)$`);
  let max = 0;
  for (const id of collectAllIds(project.nodes)) {
    const m = id.match(re);
    if (m) {
      max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return `${type}_${max + 1}`;
}

/** 解析插入父节点 id（requirements §2.6.2 父节点规则） */
export function resolveInsertParentId(project: Project, selectedIds: ReadonlySet<string>): string {
  const rootId = project.nodes[0]?.id;
  if (!rootId) {
    throw new Error("resolveInsertParentId: 项目无根节点");
  }
  if (selectedIds.size === 0) {
    return rootId;
  }
  const first = [...selectedIds][0];
  const f = findNode(project, first);
  if (!f) {
    return rootId;
  }
  const t = f.node.type;
  if (t === "panel" || t === "button") {
    return f.node.id;
  }
  if (f.parent) {
    return f.parent.id;
  }
  return rootId;
}

export function createNodeWithDefaults(
  type: NodeType,
  id: string,
  name: string,
  x: number,
  y: number,
): Node {
  switch (type) {
    case "image":
      return createDefaultImage({ id, name, x, y });
    case "text":
      return createDefaultText({ id, name, x, y });
    case "button":
      return createDefaultButton({ id, name, x, y });
    case "panel":
      return createDefaultPanel({ id, name, x, y });
    case "slider":
      return createDefaultSlider({ id, name, x, y });
    case "toggle":
      return createDefaultToggle({ id, name, x, y });
    case "inputField":
      return createDefaultInputField({ id, name, x, y });
    default: {
      const _exhaust: never = type;
      throw new Error(`createNodeWithDefaults: 未知类型 ${_exhaust}`);
    }
  }
}

export function defaultSizeForType(type: NodeType): { width: number; height: number } {
  const n = createNodeWithDefaults(type, "t", "t", 0, 0);
  return { width: n.width, height: n.height };
}
