import Konva from "konva";
import type { CanvasAabb } from "./nodeHit";

const STROKE = "#2563eb";
const HANDLE = 6;

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
        x: hx[i] - HANDLE / 2,
        y: hy[i] - HANDLE / 2,
        width: HANDLE,
        height: HANDLE,
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
