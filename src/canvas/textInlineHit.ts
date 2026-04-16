import type { Project } from "../core/schema";
import { nodesHitByCanvasPointWorld } from "./dropParent";
import { collectVisiblePaintOrder, filterUnlockedNodes } from "./nodeHit";

/**
 * T2.9：若落点处**最上层**可见节点为 Text，返回其 id；否则 null（例如上层为 Image 则不编辑下层 Text）。
 */
export function findTopTextNodeIdAtCanvasPoint(
  project: Project,
  canvasX: number,
  canvasY: number,
  isLocked: (id: string) => boolean,
): string | null {
  const root = project.nodes[0];
  if (!root) {
    return null;
  }
  const paintOrder = collectVisiblePaintOrder(root);
  const hitsRaw = nodesHitByCanvasPointWorld(project, paintOrder, canvasX, canvasY);
  const hits = filterUnlockedNodes(hitsRaw, isLocked);
  if (hits.length === 0) {
    return null;
  }
  const top = hits[hits.length - 1];
  return top.type === "text" ? top.id : null;
}
