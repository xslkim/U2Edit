import { worldTopLeftOfNode } from "../core/addNodeHelpers";
import type { Node as SchemaNode, Project } from "../core/schema";
import {
  collectVisiblePaintOrder,
  filterUnlockedNodes,
  pointInAabb,
  type CanvasAabb,
} from "./nodeHit";

/**
 * 与 Konva 绘制序一致，但包围盒使用**根画布世界坐标**（支持嵌套节点命中）。
 */
export function nodesHitByCanvasPointWorld(
  project: Project,
  paintOrder: SchemaNode[],
  px: number,
  py: number,
): SchemaNode[] {
  return paintOrder.filter((n) => {
    const tl = worldTopLeftOfNode(project, n.id);
    const b: CanvasAabb = { x: tl.x, y: tl.y, width: n.width, height: n.height };
    return pointInAabb(px, py, b);
  });
}

/**
 * T2.8：落点下**最上层**的容器（panel / button）；无则 root_panel。
 * 非容器（如 Image）在上层时向下穿透，不把其当作父节点。
 */
export function resolveImageDropParentId(
  project: Project,
  canvasX: number,
  canvasY: number,
  isLocked: (id: string) => boolean,
): string {
  const root = project.nodes[0];
  if (!root) {
    return "";
  }
  const paintOrder = collectVisiblePaintOrder(root);
  const hitsRaw = nodesHitByCanvasPointWorld(project, paintOrder, canvasX, canvasY);
  const hits = filterUnlockedNodes(hitsRaw, isLocked);
  for (let i = hits.length - 1; i >= 0; i--) {
    const n = hits[i];
    if (n.type === "panel" || n.type === "button") {
      return n.id;
    }
  }
  return root.id;
}
