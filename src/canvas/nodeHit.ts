import type { Node } from "../core/schema";
import { nodeTopLeft } from "./pivotMath";

/** 画布坐标系下的轴对齐包围盒（左上角 + 尺寸） */
export interface CanvasAabb {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getCanvasAabb(n: Node): CanvasAabb {
  const tl = nodeTopLeft(n.pivot, n.x, n.y, n.width, n.height);
  return { x: tl.x, y: tl.y, width: n.width, height: n.height };
}

export function pointInAabb(px: number, py: number, b: CanvasAabb): boolean {
  return px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height;
}

/** 深度优先（与 Konva 添加顺序一致：父在后辈之前），仅 visible 节点 */
export function collectVisiblePaintOrder(root: Node | undefined): Node[] {
  const out: Node[] = [];
  function walk(n: Node): void {
    if (!n.visible) {
      return;
    }
    out.push(n);
    if ("children" in n && n.children.length) {
      for (const c of n.children) {
        walk(c);
      }
    }
  }
  if (root) {
    walk(root);
  }
  return out;
}

/** 画布坐标下包含该点的节点，顺序为绘制顺序（从后到前，最后一个为最上层） */
export function nodesHitByPoint(paintOrder: Node[], px: number, py: number): Node[] {
  return paintOrder.filter((n) => pointInAabb(px, py, getCanvasAabb(n)));
}

/** 取最上层命中（paintOrder 中最后一个命中的节点） */
export function topHitId(hits: Node[]): string | null {
  if (hits.length === 0) {
    return null;
  }
  return hits[hits.length - 1].id;
}

/** Alt+穿透：从顶层下一层开始，每次再向下一层，循环（hits 为绘制序：后者在上） */
export function altPickId(hits: Node[], drillIndex: number): string | null {
  if (hits.length === 0) {
    return null;
  }
  const n = hits.length;
  const idx = (n - 2 - (drillIndex % n) + n * 4) % n;
  return hits[idx].id;
}

/** 选框（画布坐标）与节点 AABB：完全包围 */
export function aabbFullyInRect(box: CanvasAabb, rect: CanvasAabb): boolean {
  return (
    box.x >= rect.x &&
    box.y >= rect.y &&
    box.x + box.width <= rect.x + rect.width &&
    box.y + box.height <= rect.y + rect.height
  );
}

/** 将拖拽两点规范为左上 + 宽高 */
export function normalizeRect(x1: number, y1: number, x2: number, y2: number): CanvasAabb {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return { x, y, width, height };
}

export function idsFullyInsideMarquee(
  paintOrder: Node[],
  rect: CanvasAabb,
): Set<string> {
  const set = new Set<string>();
  for (const n of paintOrder) {
    const b = getCanvasAabb(n);
    if (aabbFullyInRect(b, rect)) {
      set.add(n.id);
    }
  }
  return set;
}
