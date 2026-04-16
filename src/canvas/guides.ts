import { worldTopLeftOfNode } from "../core/addNodeHelpers";
import { findNode } from "../core/history";
import type { Project } from "../core/schema";
import type { CanvasAabb } from "./nodeHit";
import { RESIZE_MIN } from "./resizeMath";
import type { ResizeHandleIndex } from "./selectionOverlay";

/** 需求 2.6.3：吸附阈值 5 **屏幕** CSS 像素（不随画布缩放变化） */
export const SNAP_THRESHOLD_SCREEN_PX = 5;

export function snapThresholdCanvasUnits(viewScale: number): number {
  return SNAP_THRESHOLD_SCREEN_PX / viewScale;
}

export function unionWorldBoxes(boxes: CanvasAabb[]): CanvasAabb | null {
  if (boxes.length === 0) {
    return null;
  }
  let u = { ...boxes[0] };
  for (let i = 1; i < boxes.length; i++) {
    const b = boxes[i];
    const x2 = Math.max(u.x + u.width, b.x + b.width);
    const y2 = Math.max(u.y + u.height, b.y + b.height);
    u.x = Math.min(u.x, b.x);
    u.y = Math.min(u.y, b.y);
    u.width = x2 - u.x;
    u.height = y2 - u.y;
  }
  return u;
}

export function worldAabbOfNode(project: Project, nodeId: string): CanvasAabb | null {
  const f = findNode(project, nodeId);
  if (!f) {
    return null;
  }
  const tl = worldTopLeftOfNode(project, nodeId);
  return { x: tl.x, y: tl.y, width: f.node.width, height: f.node.height };
}

/** 左/中/右、上/中/下 世界坐标 */
export function alignmentLinesFromWorldBox(b: CanvasAabb): { vx: number[]; hy: number[] } {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return {
    vx: [b.x, cx, b.x + b.width],
    hy: [b.y, cy, b.y + b.height],
  };
}

/**
 * 从「被排除节点」的各个父节点下收集**同级**节点的对齐线（世界坐标），不含被排除节点自身。
 */
export function collectSiblingAlignmentLines(
  project: Project,
  excludeIds: ReadonlySet<string>,
): { verticalX: number[]; horizontalY: number[] } {
  const vx = new Set<number>();
  const hy = new Set<number>();
  const parents = new Set<string>();
  for (const id of excludeIds) {
    const f = findNode(project, id);
    if (f?.parent) {
      parents.add(f.parent.id);
    }
  }
  for (const pid of parents) {
    const pf = findNode(project, pid);
    if (!pf || !("children" in pf.node)) {
      continue;
    }
    for (const ch of pf.node.children) {
      if (excludeIds.has(ch.id)) {
        continue;
      }
      const b = worldAabbOfNode(project, ch.id);
      if (!b) {
        continue;
      }
      const L = alignmentLinesFromWorldBox(b);
      for (const x of L.vx) {
        vx.add(x);
      }
      for (const y of L.hy) {
        hy.add(y);
      }
    }
  }
  return { verticalX: [...vx], horizontalY: [...hy] };
}

function best1DAlign(
  sources: readonly number[],
  targets: readonly number[],
  thresh: number,
): { delta: number; line: number } | null {
  let best: { delta: number; line: number; ad: number } | null = null;
  for (const s of sources) {
    for (const t of targets) {
      const delta = t - s;
      const ad = Math.abs(delta);
      if (ad <= thresh && (!best || ad < best.ad)) {
        best = { delta, line: t, ad };
      }
    }
  }
  return best ? { delta: best.delta, line: best.line } : null;
}

export interface SnapDragResult {
  adjustX: number;
  adjustY: number;
  /** 垂直参考线 x（绿色） */
  guideVerticalX: number[];
  /** 水平参考线 y（红色） */
  guideHorizontalY: number[];
}

/** 多选整体包围盒与同级对齐线：返回平移修正（世界坐标，与节点 x/y 增量一致） */
export function snapDragUnionBox(
  union: CanvasAabb,
  verticalX: readonly number[],
  horizontalY: readonly number[],
  thresh: number,
): SnapDragResult {
  const L = alignmentLinesFromWorldBox(union);
  const bx = best1DAlign(L.vx, verticalX, thresh);
  const by = best1DAlign(L.hy, horizontalY, thresh);
  return {
    adjustX: bx?.delta ?? 0,
    adjustY: by?.delta ?? 0,
    guideVerticalX: bx ? [bx.line] : [],
    guideHorizontalY: by ? [by.line] : [],
  };
}

function snapScalar(value: number, targets: readonly number[], thresh: number): { next: number; line: number } | null {
  let best: { next: number; line: number; ad: number } | null = null;
  for (const t of targets) {
    const d = t - value;
    const ad = Math.abs(d);
    if (ad <= thresh && (!best || ad < best.ad)) {
      best = { next: t, line: t, ad };
    }
  }
  return best;
}

export interface SnapResizeResult {
  box: CanvasAabb;
  guideVerticalX: number[];
  guideHorizontalY: number[];
}

/** pivot=topLeft 时的缩放吸附（Shift 等比时跳过，由调用方控制） */
export function snapResizeTopLeftPivot(
  box: CanvasAabb,
  handle: ResizeHandleIndex,
  verticalX: readonly number[],
  horizontalY: readonly number[],
  thresh: number,
): SnapResizeResult {
  let { x, y, width: w, height: h } = box;
  const gvx: number[] = [];
  const ghy: number[] = [];

  const snapV = (edge: number): number => {
    const r = snapScalar(edge, verticalX, thresh);
    if (r) {
      gvx.push(r.line);
      return r.next;
    }
    return edge;
  };
  const snapH = (edge: number): number => {
    const r = snapScalar(edge, horizontalY, thresh);
    if (r) {
      ghy.push(r.line);
      return r.next;
    }
    return edge;
  };

  switch (handle) {
    case 7: {
      const nr = snapV(x + w);
      const nb = snapH(y + h);
      w = Math.max(RESIZE_MIN, nr - x);
      h = Math.max(RESIZE_MIN, nb - y);
      break;
    }
    case 0: {
      const nl = snapV(x);
      const nt = snapH(y);
      const brx = x + w;
      const bry = y + h;
      w = Math.max(RESIZE_MIN, brx - nl);
      h = Math.max(RESIZE_MIN, bry - nt);
      x = nl;
      y = nt;
      break;
    }
    case 2: {
      const nr = snapV(x + w);
      const nt = snapH(y);
      w = Math.max(RESIZE_MIN, nr - x);
      const bry = y + h;
      h = Math.max(RESIZE_MIN, bry - nt);
      y = nt;
      break;
    }
    case 5: {
      const nl = snapV(x);
      const nb = snapH(y + h);
      const brx = x + w;
      w = Math.max(RESIZE_MIN, brx - nl);
      h = Math.max(RESIZE_MIN, nb - y);
      x = nl;
      break;
    }
    case 4: {
      const nr = snapV(x + w);
      w = Math.max(RESIZE_MIN, nr - x);
      break;
    }
    case 3: {
      const nl = snapV(x);
      const brx = x + w;
      w = Math.max(RESIZE_MIN, brx - nl);
      x = nl;
      break;
    }
    case 6: {
      const nb = snapH(y + h);
      h = Math.max(RESIZE_MIN, nb - y);
      break;
    }
    case 1: {
      const nt = snapH(y);
      const bry = y + h;
      h = Math.max(RESIZE_MIN, bry - nt);
      y = nt;
      break;
    }
    default: {
      return { box: { x, y, width: w, height: h }, guideVerticalX: [], guideHorizontalY: [] };
    }
  }

  return { box: { x, y, width: w, height: h }, guideVerticalX: gvx, guideHorizontalY: ghy };
}

/** pivot=center 且角手柄：保持中心，吸附左右/上下边 */
export function snapResizeCenterPivotCorner(
  box: CanvasAabb,
  verticalX: readonly number[],
  horizontalY: readonly number[],
  thresh: number,
): SnapResizeResult {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let { x, y, width: w, height: h } = box;
  const gvx: number[] = [];
  const ghy: number[] = [];

  let bestL: { d: number; nl: number; line: number } | null = null;
  for (const line of verticalX) {
    const nl = line;
    const nw = 2 * (cx - nl);
    if (nw < RESIZE_MIN) {
      continue;
    }
    const d = Math.abs(nl - x);
    if (d <= thresh && (!bestL || d < bestL.d)) {
      bestL = { d, nl, line };
    }
  }
  let bestR: { d: number; nr: number; line: number } | null = null;
  for (const line of verticalX) {
    const nr = line;
    const nl = 2 * cx - nr;
    const nw = nr - nl;
    if (nw < RESIZE_MIN) {
      continue;
    }
    const d = Math.abs(nr - (x + w));
    if (d <= thresh && (!bestR || d < bestR.d)) {
      bestR = { d, nr, line };
    }
  }
  if (bestL && (!bestR || bestL.d <= bestR.d)) {
    x = bestL.nl;
    w = 2 * (cx - x);
    gvx.push(bestL.line);
  } else if (bestR) {
    const nl = 2 * cx - bestR.nr;
    x = nl;
    w = bestR.nr - nl;
    gvx.push(bestR.line);
  }

  let bestT: { d: number; nt: number; line: number } | null = null;
  for (const line of horizontalY) {
    const nt = line;
    const nh = 2 * (cy - nt);
    if (nh < RESIZE_MIN) {
      continue;
    }
    const d = Math.abs(nt - y);
    if (d <= thresh && (!bestT || d < bestT.d)) {
      bestT = { d, nt, line };
    }
  }
  let bestB: { d: number; nb: number; line: number } | null = null;
  for (const line of horizontalY) {
    const nb = line;
    const nt = 2 * cy - nb;
    const nh = nb - nt;
    if (nh < RESIZE_MIN) {
      continue;
    }
    const d = Math.abs(nb - (y + h));
    if (d <= thresh && (!bestB || d < bestB.d)) {
      bestB = { d, nb, line };
    }
  }
  if (bestT && (!bestB || bestT.d <= bestB.d)) {
    y = bestT.nt;
    h = 2 * (cy - y);
    ghy.push(bestT.line);
  } else if (bestB) {
    const nt = 2 * cy - bestB.nb;
    y = nt;
    h = bestB.nb - nt;
    ghy.push(bestB.line);
  }

  return { box: { x, y, width: w, height: h }, guideVerticalX: gvx, guideHorizontalY: ghy };
}
