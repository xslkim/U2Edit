/** 画布视口：屏幕像素 / 画布逻辑像素，范围与 tasks T1.8 一致 */
export const VIEW_SCALE_MIN = 0.1;
export const VIEW_SCALE_MAX = 5;

export function clampViewScale(s: number): number {
  return Math.min(VIEW_SCALE_MAX, Math.max(VIEW_SCALE_MIN, s));
}

export interface ViewPan {
  x: number;
  y: number;
}

/** 以屏幕点 (sx,sy) 为锚缩放：保持该点下画布坐标不变 */
export function zoomAtScreenPoint(
  pan: ViewPan,
  scale: number,
  sx: number,
  sy: number,
  newScale: number,
): ViewPan {
  const ns = clampViewScale(newScale);
  const cx = (sx - pan.x) / scale;
  const cy = (sy - pan.y) / scale;
  return {
    x: sx - cx * ns,
    y: sy - cy * ns,
  };
}

/** 与当前 renderer 初始布局一致：边距 padPx、且不超过 100%（1 画布像素 = 1 屏幕像素） */
export function fitCanvasInitial(
  stageW: number,
  stageH: number,
  cw: number,
  ch: number,
  padPx: number,
): { scale: number; panX: number; panY: number } {
  const sw = Math.max(1, stageW - padPx * 2);
  const sh = Math.max(1, stageH - padPx * 2);
  const scale = Math.min(sw / cw, sh / ch, 1);
  const panX = (stageW - cw * scale) / 2;
  const panY = (stageH - ch * scale) / 2;
  return { scale, panX, panY };
}

/** Ctrl+1：四周留 marginRatio（如 0.05）后取最小缩放比使整画布可见 */
export function fitCanvasToWindow(
  stageW: number,
  stageH: number,
  cw: number,
  ch: number,
  marginRatio: number,
): { scale: number; panX: number; panY: number } {
  const m = Math.min(0.45, Math.max(0, marginRatio));
  const innerW = stageW * (1 - 2 * m);
  const innerH = stageH * (1 - 2 * m);
  const sw = Math.max(1, innerW);
  const sh = Math.max(1, innerH);
  const scale = Math.min(sw / cw, sh / ch);
  const s = clampViewScale(scale);
  const panX = (stageW - cw * s) / 2;
  const panY = (stageH - ch * s) / 2;
  return { scale: s, panX, panY };
}

/** Ctrl+0：1:1 且居中 */
export function centerOneToOne(
  stageW: number,
  stageH: number,
  cw: number,
  ch: number,
): { scale: number; panX: number; panY: number } {
  const scale = 1;
  const panX = (stageW - cw * scale) / 2;
  const panY = (stageH - ch * scale) / 2;
  return { scale, panX, panY };
}

/** 滚轮 deltaY → 缩放乘子（约 1 档 5%） */
export function wheelScaleFactor(deltaY: number): number {
  const d = Math.sign(deltaY) * Math.min(80, Math.abs(deltaY));
  return Math.exp(-d * 0.0025);
}
