import { worldTopLeftOfNode } from "../core/addNodeHelpers";
import { findNode } from "../core/history";
import type { Pivot, Project } from "../core/schema";
import type { CanvasAabb } from "./nodeHit";
import { pivotCoordsFromTopLeft } from "./pivotMath";
import type { ResizeHandleIndex } from "./selectionOverlay";

export const RESIZE_MIN = 10;

function clampAspectCorner(
  nw: number,
  nh: number,
  shiftKey: boolean,
  aspectWOverH: number,
): { w: number; h: number } {
  if (!shiftKey || aspectWOverH <= 0) {
    return { w: Math.max(RESIZE_MIN, nw), h: Math.max(RESIZE_MIN, nh) };
  }
  const r = aspectWOverH;
  let w = Math.max(RESIZE_MIN, nw);
  let h = Math.max(RESIZE_MIN, nh);
  if (w / h > r) {
    h = w / r;
  } else {
    w = h * r;
  }
  return { w: Math.max(RESIZE_MIN, w), h: Math.max(RESIZE_MIN, h) };
}

/** pivot=center 时角拖拽：对角与指针关于中心对称，几何中心不动（requirements §2.6.4） */
function resizeCenterPivotCorner(
  box: CanvasAabb,
  _handle: ResizeHandleIndex,
  px: number,
  py: number,
  shiftKey: boolean,
  aspectWOverH: number,
): CanvasAabb {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const oppX = 2 * cx - px;
  const oppY = 2 * cy - py;
  const mnx = Math.min(px, oppX);
  const mny = Math.min(py, oppY);
  const mx = Math.max(px, oppX);
  const my = Math.max(py, oppY);
  let newW = Math.max(RESIZE_MIN, mx - mnx);
  let newH = Math.max(RESIZE_MIN, my - mny);
  if (shiftKey) {
    const o = clampAspectCorner(newW, newH, true, aspectWOverH);
    newW = o.w;
    newH = o.h;
    return { x: cx - newW / 2, y: cy - newH / 2, width: newW, height: newH };
  }
  return { x: mnx, y: mny, width: newW, height: newH };
}

/**
 * 世界坐标 AABB + 手柄 + 指针：返回新 AABB（宽/高 ≥ RESIZE_MIN）。
 * Shift+**角**手柄：保持 `aspectWOverH`（初始 w/h）；边中点忽略 Shift（与需求 2.6.4 一致）。
 * `pivot === "center"` 且为角手柄时保持包围盒中心不动。
 */
export function resizeWorldAabbByPointer(
  box: CanvasAabb,
  handle: ResizeHandleIndex,
  px: number,
  py: number,
  shiftKey: boolean,
  aspectWOverH: number,
  pivot: Pivot,
): CanvasAabb {
  const isCorner = handle === 0 || handle === 2 || handle === 5 || handle === 7;
  if (pivot === "center" && isCorner) {
    return resizeCenterPivotCorner(box, handle, px, py, shiftKey, aspectWOverH);
  }

  const x = box.x;
  const y = box.y;
  const w0 = box.width;
  const h0 = box.height;
  const brx = x + w0;
  const bry = y + h0;

  switch (handle) {
    case 7: {
      let nw = px - x;
      let nh = py - y;
      if (shiftKey) {
        const o = clampAspectCorner(nw, nh, true, aspectWOverH);
        nw = o.w;
        nh = o.h;
      } else {
        nw = Math.max(RESIZE_MIN, nw);
        nh = Math.max(RESIZE_MIN, nh);
      }
      return { x, y, width: nw, height: nh };
    }
    case 0: {
      const maxTlx = brx - RESIZE_MIN;
      const maxTly = bry - RESIZE_MIN;
      let ntlx = Math.min(px, maxTlx);
      let ntly = Math.min(py, maxTly);
      let nw = brx - ntlx;
      let nh = bry - ntly;
      if (shiftKey) {
        const o = clampAspectCorner(nw, nh, true, aspectWOverH);
        nw = o.w;
        nh = o.h;
        ntlx = brx - nw;
        ntly = bry - nh;
      }
      return { x: ntlx, y: ntly, width: nw, height: nh };
    }
    case 2: {
      const bly = bry;
      let nw = px - x;
      let nh = bly - py;
      if (shiftKey) {
        const o = clampAspectCorner(nw, nh, true, aspectWOverH);
        nw = o.w;
        nh = o.h;
      } else {
        nw = Math.max(RESIZE_MIN, nw);
        nh = Math.max(RESIZE_MIN, nh);
      }
      return { x, y: bly - nh, width: nw, height: nh };
    }
    case 5: {
      let nw = brx - px;
      let nh = bry - py;
      if (shiftKey) {
        const o = clampAspectCorner(nw, nh, true, aspectWOverH);
        nw = o.w;
        nh = o.h;
      } else {
        nw = Math.max(RESIZE_MIN, nw);
        nh = Math.max(RESIZE_MIN, nh);
      }
      const ntlx = brx - nw;
      const ntly = bry - nh;
      return { x: ntlx, y: ntly, width: nw, height: nh };
    }
    case 1: {
      const ntly = Math.min(py, bry - RESIZE_MIN);
      const nh = bry - ntly;
      return { x, y: ntly, width: w0, height: nh };
    }
    case 6: {
      const nh = Math.max(RESIZE_MIN, py - y);
      return { x, y, width: w0, height: nh };
    }
    case 3: {
      const ntlx = Math.min(px, brx - RESIZE_MIN);
      const nw = brx - ntlx;
      return { x: ntlx, y, width: nw, height: h0 };
    }
    case 4: {
      const nw = Math.max(RESIZE_MIN, px - x);
      return { x, y, width: nw, height: h0 };
    }
    default: {
      const _e: never = handle;
      return _e;
    }
  }
}

/** 将世界坐标 AABB 写回节点（pivot x/y + width/height）；根节点勿调用 */
export function applyWorldAabbToNode(project: Project, nodeId: string, worldBox: CanvasAabb): void {
  const f = findNode(project, nodeId);
  if (!f) {
    return;
  }
  const parent = f.parent;
  const pWorld = parent ? worldTopLeftOfNode(project, parent.id) : { x: 0, y: 0 };
  const localTlX = worldBox.x - pWorld.x;
  const localTlY = worldBox.y - pWorld.y;
  const n = f.node;
  const p = pivotCoordsFromTopLeft(n.pivot, localTlX, localTlY, worldBox.width, worldBox.height);
  n.x = p.x;
  n.y = p.y;
  n.width = worldBox.width;
  n.height = worldBox.height;
}
