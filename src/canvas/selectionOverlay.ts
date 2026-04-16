import Konva from "konva";
import type { CanvasAabb } from "./nodeHit";

const STROKE = "#2563eb";

/** 与 Konva 手柄方一致，供命中与 T1.13 指针样式共用 */
export const SELECTION_HANDLE_PX = 6;

/** 单个节点：蓝色描边 + 8 个手柄（不参与命中） */
export function buildNodeSelectionChrome(box: CanvasAabb): Konva.Group {
  const g = new Konva.Group({ listening: false });
  g.add(
    new Konva.Rect({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      stroke: STROKE,
      strokeWidth: 2,
      listening: false,
    }),
  );
  const hx = [
    box.x,
    box.x + box.width / 2,
    box.x + box.width,
    box.x,
    box.x + box.width,
    box.x,
    box.x + box.width / 2,
    box.x + box.width,
  ];
  const hy = [
    box.y,
    box.y,
    box.y,
    box.y + box.height / 2,
    box.y + box.height / 2,
    box.y + box.height,
    box.y + box.height,
    box.y + box.height,
  ];
  for (let i = 0; i < 8; i++) {
    g.add(
      new Konva.Rect({
        x: hx[i] - SELECTION_HANDLE_PX / 2,
        y: hy[i] - SELECTION_HANDLE_PX / 2,
        width: SELECTION_HANDLE_PX,
        height: SELECTION_HANDLE_PX,
        fill: "#ffffff",
        stroke: STROKE,
        strokeWidth: 1,
        listening: false,
      }),
    );
  }
  return g;
}

export function buildSelectionOverlayLayer(boxes: CanvasAabb[]): Konva.Group {
  const layer = new Konva.Group({ listening: false });
  for (const b of boxes) {
    layer.add(buildNodeSelectionChrome(b));
  }
  return layer;
}

/** 8 向手柄索引：0 左上 … 7 右下，与 `buildNodeSelectionChrome` 中 hx/hy 顺序一致 */
export type ResizeHandleIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** requirements 2.2：↔ ↕ ↗ ↘ 对应 CSS resize 光标 */
export function cursorCssForHandleIndex(i: ResizeHandleIndex): string {
  switch (i) {
    case 0:
    case 7:
      return "nwse-resize";
    case 1:
    case 6:
      return "ns-resize";
    case 2:
    case 5:
      return "nesw-resize";
    case 3:
    case 4:
      return "ew-resize";
    default:
      return "default";
  }
}

/**
 * 命中选中框上的 resize 手柄（后绘制的框优先，与 Konva 叠放一致）
 */
export function hitTestResizeHandle(
  px: number,
  py: number,
  boxes: CanvasAabb[],
): { boxIndex: number; handle: ResizeHandleIndex } | null {
  const half = SELECTION_HANDLE_PX / 2;
  const hxOf = (box: CanvasAabb): number[] => [
    box.x,
    box.x + box.width / 2,
    box.x + box.width,
    box.x,
    box.x + box.width,
    box.x,
    box.x + box.width / 2,
    box.x + box.width,
  ];
  const hyOf = (box: CanvasAabb): number[] => [
    box.y,
    box.y,
    box.y,
    box.y + box.height / 2,
    box.y + box.height / 2,
    box.y + box.height,
    box.y + box.height,
    box.y + box.height,
  ];
  for (let bi = boxes.length - 1; bi >= 0; bi--) {
    const box = boxes[bi];
    const hx = hxOf(box);
    const hy = hyOf(box);
    for (let i = 7; i >= 0; i--) {
      const cx = hx[i];
      const cy = hy[i];
      if (px >= cx - half && px <= cx + half && py >= cy - half && py <= cy + half) {
        return { boxIndex: bi, handle: i as ResizeHandleIndex };
      }
    }
  }
  return null;
}
