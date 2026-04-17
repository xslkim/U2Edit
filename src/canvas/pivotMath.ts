import type { Pivot } from "../core/schema";

/** 从节点左上角到 pivot 锚点在局部坐标中的偏移（与 requirements §2.5 一致） */
export function pivotOffsetFromTopLeft(
  pivot: Pivot,
  width: number,
  height: number,
): { x: number; y: number } {
  const fx: Record<Pivot, number> = {
    topLeft: 0,
    topCenter: 0.5,
    topRight: 1,
    centerLeft: 0,
    center: 0.5,
    centerRight: 1,
    bottomLeft: 0,
    bottomCenter: 0.5,
    bottomRight: 1,
  };
  const fy: Record<Pivot, number> = {
    topLeft: 0,
    topCenter: 0,
    topRight: 0,
    centerLeft: 0.5,
    center: 0.5,
    centerRight: 0.5,
    bottomLeft: 1,
    bottomCenter: 1,
    bottomRight: 1,
  };
  return { x: fx[pivot] * width, y: fy[pivot] * height };
}

/** 节点左上角在父坐标系中的位置（父坐标原点为父节点左上角） */
export function nodeTopLeft(
  pivot: Pivot,
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const o = pivotOffsetFromTopLeft(pivot, width, height);
  return { x: x - o.x, y: y - o.y };
}

/** 已知左上角与尺寸，反算 pivot 锚点坐标（与 `nodeTopLeft` 互逆） */
export function pivotCoordsFromTopLeft(
  pivot: Pivot,
  tlX: number,
  tlY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const o = pivotOffsetFromTopLeft(pivot, width, height);
  return { x: tlX + o.x, y: tlY + o.y };
}
