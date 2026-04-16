import Konva from "konva";
import { resolveAssetAbsolute } from "../core/assetPath";
import type { Command } from "../core/history";
import { CompositeCommand, findNode, PatchNodeCommand } from "../core/history";
import type {
  AssetTintRef,
  ButtonNode,
  ImageNode,
  InputFieldNode,
  Node,
  PanelNode,
  Project,
  SliderNode,
  TextNode,
  ToggleNode,
} from "../core/schema";
import { nodeTopLeft } from "./pivotMath";
import {
  centerOneToOne,
  clampViewScale,
  fitCanvasInitial,
  fitCanvasToWindow,
  wheelScaleFactor,
  zoomAtScreenPoint,
} from "./viewTransform";
import type { SelectionStore } from "./selection";
import {
  altPickId,
  collectVisiblePaintOrder,
  filterUnlockedNodes,
  findNodeById,
  getCanvasAabb,
  idsFullyInsideMarquee,
  normalizeRect,
  nodesHitByPoint,
  topHitId,
  type CanvasAabb,
} from "./nodeHit";
import {
  buildSelectionOverlayLayer,
  cursorCssForHandleIndex,
  hitTestResizeHandle,
} from "./selectionOverlay";

/** 从磁盘绝对路径加载位图（由宿主注入；失败返回 null） */
export type ImageLoader = (absolutePath: string) => Promise<HTMLImageElement | null>;

export interface CanvasViewState {
  scale: number;
  zoomPercent: number;
  panX: number;
  panY: number;
  gridStep: number;
}

export interface MountProjectCanvasOptions {
  container: HTMLDivElement;
  project: Project;
  projectDir: string | null;
  loadImage: ImageLoader;
  onViewChange?: (state: CanvasViewState) => void;
  selection: SelectionStore;
  /** 仅编辑器内存锁定：命中测试忽略 */
  isNodeLocked?: (id: string) => boolean;
  /** T1.12：松手时入栈；未传则仅不记录历史 */
  commitCommand?: (cmd: Command) => void;
}

export interface MountedCanvas {
  destroy(): void;
  redraw(): Promise<void>;
  refreshSelection(): void;
  /** 仅重绘场景（无图片预加载），用于改 visible 等 */
  rebuildScene(): void;
  /** 将节点 AABB 平移进视口（画布坐标） */
  ensureNodeVisible(nodeId: string): void;
  getStage(): Konva.Stage | null;
  /** 当前视口中心在根画布坐标系中的点（与 stage 坐标一致） */
  getViewportCenterCanvas(): { x: number; y: number } | null;
}

const PAD = 16;
const GRAY = "#3f3f46";
const CANVAS_WHITE = "#ffffff";

function basename(p: string): string {
  const s = p.replace(/[/\\]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i >= 0 ? s.slice(i + 1) : s;
}

export { resolveAssetAbsolute } from "../core/assetPath";

function missingPlaceholder(width: number, height: number, hint: string): Konva.Group {
  const g = new Konva.Group();
  g.add(
    new Konva.Rect({
      width,
      height,
      fill: "#fee2e2",
      stroke: "#ef4444",
      strokeWidth: 1,
    }),
  );
  g.add(
    new Konva.Text({
      text: hint,
      fontSize: 11,
      fontFamily: "system-ui, sans-serif",
      fill: "#b91c1c",
      width,
      height,
      align: "center",
      verticalAlign: "middle",
      padding: 4,
    }),
  );
  return g;
}

function applyTintOverlay(group: Konva.Group, width: number, height: number, tint: string): void {
  if (!tint || tint.toUpperCase() === "#FFFFFF") {
    return;
  }
  const r = new Konva.Rect({
    width,
    height,
    fill: tint,
    opacity: 0.35,
    listening: false,
  });
  r.globalCompositeOperation("multiply");
  group.add(r);
}

function drawAssetTintRef(
  ref: AssetTintRef | null | undefined,
  width: number,
  height: number,
  imgMap: Map<string, HTMLImageElement | null>,
  absPath: string | null,
  missingLabel: string,
): Konva.Group {
  const g = new Konva.Group();
  const tint = ref?.tint ?? "#FFFFFF";
  const id = ref?.assetId ?? null;
  if (!id || !absPath) {
    return g;
  }
  const cached = imgMap.get(absPath);
  if (!cached) {
    g.add(missingPlaceholder(width, height, missingLabel));
    return g;
  }
  const ig = new Konva.Group();
  ig.add(
    new Konva.Image({
      image: cached,
      width,
      height,
    }),
  );
  applyTintOverlay(ig, width, height, tint);
  g.add(ig);
  return g;
}

function drawTextNode(n: TextNode): Konva.Group {
  const tl = nodeTopLeft(n.pivot, n.x, n.y, n.width, n.height);
  const g = new Konva.Group({ x: tl.x, y: tl.y, opacity: n.opacity });
  g.add(
    new Konva.Text({
      text: n.content,
      fontSize: n.fontSize,
      fontFamily: "system-ui, sans-serif",
      fill: n.color,
      width: n.width,
      height: n.height,
      align: n.textAlign,
      verticalAlign: "middle",
    }),
  );
  return g;
}

function drawImageNode(
  n: ImageNode,
  imgMap: Map<string, HTMLImageElement | null>,
  absPath: string | null,
): Konva.Group {
  const tl = nodeTopLeft(n.pivot, n.x, n.y, n.width, n.height);
  const g = new Konva.Group({ x: tl.x, y: tl.y, opacity: n.opacity });
  const tint = n.tint ?? "#FFFFFF";
  if (!n.assetId || !absPath) {
    g.add(missingPlaceholder(n.width, n.height, "无 asset"));
    return g;
  }
  const img = imgMap.get(absPath);
  if (!img) {
    g.add(missingPlaceholder(n.width, n.height, `Missing: ${basename(absPath)}`));
    return g;
  }
  const inner = new Konva.Group();
  inner.add(
    new Konva.Image({
      image: img,
      width: n.width,
      height: n.height,
    }),
  );
  applyTintOverlay(inner, n.width, n.height, tint);
  g.add(inner);
  return g;
}

async function preloadImages(
  paths: Set<string>,
  loadImage: ImageLoader,
): Promise<Map<string, HTMLImageElement | null>> {
  const map = new Map<string, HTMLImageElement | null>();
  for (const p of paths) {
    try {
      const img = await loadImage(p);
      map.set(p, img);
    } catch {
      map.set(p, null);
    }
  }
  return map;
}

function collectPaths(project: Project, projectDir: string | null, node: Node, acc: Set<string>): void {
  if (!projectDir) {
    return;
  }
  function walk(n: Node): void {
    switch (n.type) {
      case "image":
        {
          const abs = resolveAssetAbsolute(project, projectDir, n.assetId);
          if (abs) {
            acc.add(abs);
          }
        }
        break;
      case "panel":
        {
          const abs = resolveAssetAbsolute(project, projectDir, n.background?.assetId ?? null);
          if (abs) {
            acc.add(abs);
          }
          n.children.forEach(walk);
        }
        break;
      case "button":
        {
          const abs = resolveAssetAbsolute(project, projectDir, n.background?.assetId ?? null);
          if (abs) {
            acc.add(abs);
          }
          n.children.forEach(walk);
        }
        break;
      case "slider":
        {
          for (const id of [
            n.trackImage?.assetId,
            n.fillImage?.assetId,
            n.thumbImage?.assetId,
          ]) {
            const abs = resolveAssetAbsolute(project, projectDir, id ?? null);
            if (abs) {
              acc.add(abs);
            }
          }
        }
        break;
      case "toggle":
        {
          for (const id of [n.background?.assetId, n.checkmark?.assetId]) {
            const abs = resolveAssetAbsolute(project, projectDir, id ?? null);
            if (abs) {
              acc.add(abs);
            }
          }
        }
        break;
      case "inputField":
        {
          const abs = resolveAssetAbsolute(project, projectDir, n.background?.assetId ?? null);
          if (abs) {
            acc.add(abs);
          }
        }
        break;
      default:
        break;
    }
  }
  walk(node);
}

function renderNode(
  project: Project,
  projectDir: string | null,
  imgMap: Map<string, HTMLImageElement | null>,
  n: Node,
): Konva.Group | null {
  if (!n.visible) {
    return null;
  }
  if (n.type === "text") {
    return drawTextNode(n);
  }
  if (n.type === "image") {
    const abs = resolveAssetAbsolute(project, projectDir, n.assetId);
    return drawImageNode(n, imgMap, abs);
  }
  if (n.type === "panel") {
    return renderPanelLike(project, projectDir, imgMap, n, false);
  }
  if (n.type === "button") {
    return renderPanelLike(project, projectDir, imgMap, n, true);
  }
  if (n.type === "slider") {
    return renderSlider(project, projectDir, imgMap, n);
  }
  if (n.type === "toggle") {
    return renderToggle(project, projectDir, imgMap, n);
  }
  if (n.type === "inputField") {
    return renderInputField(project, projectDir, imgMap, n);
  }
  return null;
}

function renderPanelLike(
  project: Project,
  projectDir: string | null,
  imgMap: Map<string, HTMLImageElement | null>,
  n: PanelNode | ButtonNode,
  isButton: boolean,
): Konva.Group {
  const tl = nodeTopLeft(n.pivot, n.x, n.y, n.width, n.height);
  const wrap = new Konva.Group({ x: tl.x, y: tl.y });

  const shell = new Konva.Group({ opacity: n.opacity });
  const bgRef = n.background;
  const abs = resolveAssetAbsolute(project, projectDir, bgRef?.assetId ?? null);
  if (bgRef?.assetId && abs) {
    const img = imgMap.get(abs);
    if (img) {
      const ig = new Konva.Group();
      ig.add(
        new Konva.Image({
          image: img,
          width: n.width,
          height: n.height,
        }),
      );
      applyTintOverlay(ig, n.width, n.height, bgRef.tint ?? "#FFFFFF");
      shell.add(ig);
    } else {
      shell.add(missingPlaceholder(n.width, n.height, `Missing: ${basename(abs)}`));
    }
  }

  wrap.add(shell);

  const inner = new Konva.Group({ opacity: 1, x: 0, y: 0 });
  if (isButton) {
    const b = n as ButtonNode;
    inner.add(
      new Konva.Text({
        text: b.label.content,
        fontSize: b.label.fontSize,
        fontFamily: "system-ui, sans-serif",
        fill: b.label.color,
        width: n.width,
        height: n.height,
        align: b.label.textAlign,
        verticalAlign: "middle",
      }),
    );
  }
  for (const ch of n.children) {
    const g = renderNode(project, projectDir, imgMap, ch);
    if (g) {
      inner.add(g);
    }
  }
  wrap.add(inner);
  return wrap;
}

function renderSlider(
  project: Project,
  projectDir: string | null,
  imgMap: Map<string, HTMLImageElement | null>,
  n: SliderNode,
): Konva.Group {
  const tl = nodeTopLeft(n.pivot, n.x, n.y, n.width, n.height);
  const root = new Konva.Group({ x: tl.x, y: tl.y });

  const shell = new Konva.Group({ opacity: n.opacity });
  const trackAbs = resolveAssetAbsolute(project, projectDir, n.trackImage?.assetId ?? null);
  const trackH = Math.max(10, Math.floor(n.height * 0.45));
  const trackG = drawAssetTintRef(
    n.trackImage,
    n.width,
    trackH,
    imgMap,
    trackAbs,
    `Missing: ${basename(trackAbs ?? "track")}`,
  );
  if (trackG.getChildren().length === 0) {
    shell.add(
      new Konva.Rect({
        width: n.width,
        height: trackH,
        fill: "#e4e4e7",
        stroke: "#a1a1aa",
        strokeWidth: 1,
      }),
    );
  } else {
    shell.add(trackG);
  }

  shell.add(
    new Konva.Text({
      text: "🎚",
      x: 4,
      y: trackH + 4,
      fontSize: 14,
    }),
  );
  shell.add(
    new Konva.Text({
      text: n.name,
      y: n.height - 20,
      width: n.width,
      fontSize: 12,
      fontFamily: "system-ui, sans-serif",
      fill: "#18181b",
      align: "center",
    }),
  );
  root.add(shell);
  return root;
}

function renderToggle(
  project: Project,
  projectDir: string | null,
  imgMap: Map<string, HTMLImageElement | null>,
  n: ToggleNode,
): Konva.Group {
  const tl = nodeTopLeft(n.pivot, n.x, n.y, n.width, n.height);
  const root = new Konva.Group({ x: tl.x, y: tl.y });
  const shell = new Konva.Group({ opacity: n.opacity });
  const bgAbs = resolveAssetAbsolute(project, projectDir, n.background?.assetId ?? null);
  const bgW = Math.min(48, Math.floor(n.width * 0.22));
  const bgG = drawAssetTintRef(
    n.background,
    bgW,
    n.height,
    imgMap,
    bgAbs,
    `Missing: ${basename(bgAbs ?? "bg")}`,
  );
  if (bgG.getChildren().length === 0) {
    shell.add(
      new Konva.Rect({
        width: bgW,
        height: n.height,
        fill: "#e4e4e7",
        stroke: "#a1a1aa",
        strokeWidth: 1,
      }),
    );
  } else {
    shell.add(bgG);
  }

  const ckAbs = resolveAssetAbsolute(project, projectDir, n.checkmark?.assetId ?? null);
  const sz = Math.min(n.height - 6, 26);
  const ckG = drawAssetTintRef(
    n.checkmark,
    sz,
    sz,
    imgMap,
    ckAbs,
    `Missing: ${basename(ckAbs ?? "check")}`,
  );
  ckG.x(bgW + 6);
  ckG.y((n.height - sz) / 2);
  shell.add(ckG);

  shell.add(
    new Konva.Text({
      text: n.label.content,
      x: bgW + sz + 16,
      y: (n.height - n.label.fontSize) / 2,
      fontSize: n.label.fontSize,
      fontFamily: "system-ui, sans-serif",
      fill: n.label.color,
    }),
  );
  root.add(shell);
  return root;
}

function renderInputField(
  project: Project,
  projectDir: string | null,
  imgMap: Map<string, HTMLImageElement | null>,
  n: InputFieldNode,
): Konva.Group {
  const tl = nodeTopLeft(n.pivot, n.x, n.y, n.width, n.height);
  const root = new Konva.Group({ x: tl.x, y: tl.y });
  const shell = new Konva.Group({ opacity: n.opacity });
  const bgAbs = resolveAssetAbsolute(project, projectDir, n.background?.assetId ?? null);
  const bgG = drawAssetTintRef(
    n.background,
    n.width,
    n.height,
    imgMap,
    bgAbs,
    `Missing: ${basename(bgAbs ?? "input")}`,
  );
  if (bgG.getChildren().length === 0) {
    shell.add(
      new Konva.Rect({
        width: n.width,
        height: n.height,
        fill: "#f4f4f5",
        stroke: "#a1a1aa",
        strokeWidth: 1,
      }),
    );
  } else {
    shell.add(bgG);
  }
  const display = n.text.content.trim() ? n.text.content : n.placeholder.content;
  const style = n.text.content.trim() ? n.text : n.placeholder;
  shell.add(
    new Konva.Text({
      text: display,
      x: 8,
      y: (n.height - style.fontSize) / 2,
      fontSize: style.fontSize,
      fontFamily: "system-ui, sans-serif",
      fill: style.color,
      width: n.width - 16,
    }),
  );
  root.add(shell);
  root.add(
    new Konva.Text({
      text: n.name,
      y: n.height + 2,
      fontSize: 10,
      fill: "#71717a",
    }),
  );
  return root;
}

const GRID_CYCLE = [0, 10, 50, 100] as const;

function buildGrid(cw: number, ch: number, step: number): Konva.Group {
  const g = new Konva.Group({ listening: false });
  const stroke = "rgba(15, 23, 42, 0.14)";
  for (let x = 0; x <= cw; x += step) {
    g.add(
      new Konva.Line({
        points: [x, 0, x, ch],
        stroke,
        strokeWidth: 1,
      }),
    );
  }
  for (let y = 0; y <= ch; y += step) {
    g.add(
      new Konva.Line({
        points: [0, y, cw, y],
        stroke,
        strokeWidth: 1,
      }),
    );
  }
  return g;
}

function isEditableDomTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) {
    return false;
  }
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return el.isContentEditable === true;
}

const MARQUEE_THRESHOLD_PX = 4;

export function mountProjectCanvas(opts: MountProjectCanvasOptions): MountedCanvas {
  const { container, project, projectDir, loadImage, onViewChange, selection, commitCommand } = opts;
  const isNodeLocked = opts.isNodeLocked ?? ((): boolean => false);
  let stage: Konva.Stage | null = null;
  let mainLayer: Konva.Layer | null = null;
  let bgRect: Konva.Rect | null = null;
  let viewport: Konva.Group | null = null;
  let world: Konva.Group | null = null;
  let ro: ResizeObserver | null = null;
  let lastImgMap: Map<string, HTMLImageElement | null> | null = null;

  let viewPan = { x: 0, y: 0 };
  let viewScale = 1;
  let gridStep: number = 0;
  let spaceHeld = false;
  let panDragging = false;
  let panPointerStart = { x: 0, y: 0 };
  let panViewStart = { x: 0, y: 0 };

  let selectionOverlayGroup: Konva.Group | null = null;
  let marqueeRectKonva: Konva.Rect | null = null;
  let emptyClickPending = false;
  let marqueeActive = false;
  let screenMarqueeStart: { x: number; y: number } | null = null;
  let canvasMarqueeStart: { x: number; y: number } | null = null;
  let altDrillIndex = 0;

  /** T1.12 画布拖拽移动 */
  let nodeDragPending = false;
  let nodeDragActive = false;
  let nodeDragPointerStartScr: { x: number; y: number } | null = null;
  let nodeDragStartCanvas: { x: number; y: number } | null = null;
  let nodeDragIds: string[] = [];
  let nodeDragSnapshots: Map<string, Node> = new Map();

  /** T1.13：悬停命中（平移/拖拽中由 updateContainerCursor 覆盖） */
  let hoverCursor = "";

  const resetNodeDrag = (): void => {
    nodeDragPending = false;
    nodeDragActive = false;
    nodeDragPointerStartScr = null;
    nodeDragStartCanvas = null;
    nodeDragIds = [];
    nodeDragSnapshots = new Map();
  };

  const rootPanelId = (): string | null => project.nodes[0]?.id ?? null;

  const movableSelectedIds = (): string[] => {
    const rid = rootPanelId();
    return [...selection.selectedIds.value].filter((id) => id !== rid && !isNodeLocked(id));
  };

  const tryBeginNodeDrag = (ev: MouseEvent, canvasPt: { x: number; y: number }): void => {
    if (!commitCommand) {
      return;
    }
    const ids = movableSelectedIds();
    if (ids.length === 0) {
      return;
    }
    nodeDragSnapshots = new Map();
    for (const id of ids) {
      const f = findNode(project, id);
      if (!f) {
        resetNodeDrag();
        return;
      }
      nodeDragSnapshots.set(id, structuredClone(f.node));
    }
    nodeDragPending = true;
    nodeDragActive = false;
    nodeDragPointerStartScr = { x: ev.clientX, y: ev.clientY };
    nodeDragStartCanvas = { x: canvasPt.x, y: canvasPt.y };
    nodeDragIds = ids;
  };

  const stageToCanvas = (sx: number, sy: number): { x: number; y: number } => ({
    x: (sx - viewPan.x) / viewScale,
    y: (sy - viewPan.y) / viewScale,
  });

  const destroyMarqueeVisual = (): void => {
    marqueeRectKonva?.destroy();
    marqueeRectKonva = null;
  };

  const collectSelectionBoxes = (): CanvasAabb[] => {
    const ids = selection.selectedIds.value;
    if (ids.size === 0 || !project.nodes[0]) {
      return [];
    }
    const paintOrder = collectVisiblePaintOrder(project.nodes[0]);
    const byId = new Map(paintOrder.map((n) => [n.id, n]));
    const boxes: CanvasAabb[] = [];
    for (const id of ids) {
      const n = byId.get(id);
      if (n) {
        boxes.push(getCanvasAabb(n));
      }
    }
    return boxes;
  };

  const updateHoverCursorFromCanvas = (canvasX: number, canvasY: number): void => {
    const boxes = collectSelectionBoxes();
    const rh = hitTestResizeHandle(canvasX, canvasY, boxes);
    if (rh) {
      hoverCursor = cursorCssForHandleIndex(rh.handle);
      return;
    }
    const root = project.nodes[0];
    if (!root) {
      hoverCursor = "";
      return;
    }
    const paintOrder = collectVisiblePaintOrder(root);
    const hitsRaw = nodesHitByPoint(paintOrder, canvasX, canvasY);
    const hits = filterUnlockedNodes(hitsRaw, isNodeLocked);
    if (hits.length > 0) {
      hoverCursor = "pointer";
      return;
    }
    hoverCursor = "";
  };

  const refreshHoverCursorFromStage = (): void => {
    if (!stage || panDragging || nodeDragActive || nodeDragPending) {
      updateContainerCursor();
      return;
    }
    const p = stage.getPointerPosition();
    if (p) {
      const c = stageToCanvas(p.x, p.y);
      updateHoverCursorFromCanvas(c.x, c.y);
    }
    updateContainerCursor();
  };

  const updateSelectionOverlay = (): void => {
    selectionOverlayGroup?.destroy();
    selectionOverlayGroup = null;
    if (!world) {
      return;
    }
    const boxes = collectSelectionBoxes();
    if (boxes.length === 0) {
      mainLayer?.batchDraw();
      refreshHoverCursorFromStage();
      return;
    }
    selectionOverlayGroup = buildSelectionOverlayLayer(boxes);
    world.add(selectionOverlayGroup);
    mainLayer?.batchDraw();
    refreshHoverCursorFromStage();
  };

  const notifyView = (): void => {
    onViewChange?.({
      scale: viewScale,
      zoomPercent: Math.round(viewScale * 100),
      panX: viewPan.x,
      panY: viewPan.y,
      gridStep,
    });
  };

  const updateContainerCursor = (): void => {
    if (panDragging) {
      container.style.cursor = "grabbing";
      return;
    }
    if (nodeDragActive) {
      container.style.cursor = "move";
      return;
    }
    if (nodeDragPending && !nodeDragActive) {
      container.style.cursor = "pointer";
      return;
    }
    if (spaceHeld) {
      container.style.cursor = "grab";
      return;
    }
    container.style.cursor = hoverCursor || "";
  };

  const applyViewportTransform = (): void => {
    if (!viewport) {
      return;
    }
    viewport.position(viewPan);
    viewport.scale({ x: viewScale, y: viewScale });
    mainLayer?.batchDraw();
    notifyView();
  };

  const syncStageSize = (): void => {
    if (!stage || !bgRect) {
      return;
    }
    const w = container.clientWidth || 400;
    const h = container.clientHeight || 300;
    stage.width(w);
    stage.height(h);
    bgRect.width(w);
    bgRect.height(h);
    applyViewportTransform();
  };

  const cycleGrid = (): void => {
    const idx = GRID_CYCLE.indexOf(gridStep as (typeof GRID_CYCLE)[number]);
    const next = GRID_CYCLE[(idx < 0 ? 0 : idx + 1) % GRID_CYCLE.length];
    gridStep = next;
    rebuildContent();
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>): void => {
    e.evt.preventDefault();
    e.evt.stopPropagation();
    if (!stage) {
      return;
    }
    const p = stage.getPointerPosition();
    if (!p) {
      return;
    }
    const factor = wheelScaleFactor(e.evt.deltaY);
    const newS = clampViewScale(viewScale * factor);
    viewPan = zoomAtScreenPoint(viewPan, viewScale, p.x, p.y, newS);
    viewScale = clampViewScale(newS);
    applyViewportTransform();
  };

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>): void => {
    const ev = e.evt;
    const wantPan = ev.button === 1 || (spaceHeld && ev.button === 0);
    if (wantPan) {
      ev.preventDefault();
      panDragging = true;
      panPointerStart = { x: ev.clientX, y: ev.clientY };
      panViewStart = { ...viewPan };
      updateContainerCursor();
      return;
    }

    if (ev.button !== 0 || !stage) {
      return;
    }

    const p = stage.getPointerPosition();
    if (!p) {
      return;
    }

    if (!ev.altKey) {
      altDrillIndex = 0;
    }

    const canvasPt = stageToCanvas(p.x, p.y);
    const paintOrder = collectVisiblePaintOrder(project.nodes[0]);
    const hitsRaw = nodesHitByPoint(paintOrder, canvasPt.x, canvasPt.y);
    const hits = filterUnlockedNodes(hitsRaw, isNodeLocked);
    const tid = topHitId(hits);

    if (tid) {
      emptyClickPending = false;
      destroyMarqueeVisual();
      marqueeActive = false;
      screenMarqueeStart = null;
      canvasMarqueeStart = null;
      if (ev.ctrlKey || ev.metaKey) {
        selection.toggle(tid);
      } else if (ev.altKey && hits.length > 0) {
        const pick = altPickId(hits, altDrillIndex);
        if (pick) {
          selection.selectOnly(pick);
          altDrillIndex++;
        }
      } else if (!selection.has(tid)) {
        selection.selectOnly(tid);
      }
      updateSelectionOverlay();
      tryBeginNodeDrag(ev, canvasPt);
      updateContainerCursor();
      return;
    }

    if (ev.ctrlKey || ev.metaKey || ev.altKey) {
      return;
    }

    emptyClickPending = true;
    marqueeActive = false;
    screenMarqueeStart = { x: p.x, y: p.y };
    canvasMarqueeStart = { x: canvasPt.x, y: canvasPt.y };
    destroyMarqueeVisual();
  };

  const onWindowMouseMove = (e: MouseEvent): void => {
    if (panDragging) {
      e.preventDefault();
      const dx = e.clientX - panPointerStart.x;
      const dy = e.clientY - panPointerStart.y;
      viewPan = { x: panViewStart.x + dx, y: panViewStart.y + dy };
      applyViewportTransform();
      return;
    }

    if ((nodeDragPending || nodeDragActive) && stage && nodeDragStartCanvas) {
      const p = stage.getPointerPosition();
      if (!p) {
        updateContainerCursor();
        return;
      }
      if (nodeDragPending && !nodeDragActive && nodeDragPointerStartScr) {
        const dist = Math.hypot(e.clientX - nodeDragPointerStartScr.x, e.clientY - nodeDragPointerStartScr.y);
        if (dist < MARQUEE_THRESHOLD_PX) {
          updateContainerCursor();
          return;
        }
        nodeDragActive = true;
      }
      if (nodeDragActive) {
        const curCanvas = stageToCanvas(p.x, p.y);
        let dx = curCanvas.x - nodeDragStartCanvas.x;
        let dy = curCanvas.y - nodeDragStartCanvas.y;
        if (e.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) {
            dy = 0;
          } else {
            dx = 0;
          }
        }
        for (const id of nodeDragIds) {
          const snap = nodeDragSnapshots.get(id);
          const f = findNode(project, id);
          if (!snap || !f) {
            continue;
          }
          f.node.x = snap.x + dx;
          f.node.y = snap.y + dy;
        }
        rebuildContent();
        updateContainerCursor();
      }
      return;
    }

    if (stage && !nodeDragActive && !nodeDragPending) {
      const ph = stage.getPointerPosition();
      if (ph) {
        const c = stageToCanvas(ph.x, ph.y);
        updateHoverCursorFromCanvas(c.x, c.y);
      }
    }
    updateContainerCursor();

    if (!stage || !screenMarqueeStart || !canvasMarqueeStart) {
      return;
    }

    const p = stage.getPointerPosition();
    if (!p) {
      return;
    }

    if (!marqueeActive && emptyClickPending) {
      const d = Math.hypot(p.x - screenMarqueeStart.x, p.y - screenMarqueeStart.y);
      if (d > MARQUEE_THRESHOLD_PX) {
        marqueeActive = true;
        emptyClickPending = false;
        marqueeRectKonva = new Konva.Rect({
          stroke: "#2563eb",
          dash: [4, 4],
          strokeWidth: 1,
          fill: "rgba(37, 99, 235, 0.08)",
          listening: false,
        });
        world?.add(marqueeRectKonva);
      }
    }

    if (marqueeActive && marqueeRectKonva && canvasMarqueeStart) {
      const c = stageToCanvas(p.x, p.y);
      const r = normalizeRect(canvasMarqueeStart.x, canvasMarqueeStart.y, c.x, c.y);
      marqueeRectKonva.setAttrs({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      });
      mainLayer?.batchDraw();
    }
  };

  const onWindowMouseUp = (e: MouseEvent): void => {
    if (panDragging) {
      panDragging = false;
      refreshHoverCursorFromStage();
      return;
    }

    if (nodeDragPending || nodeDragActive) {
      const didDrag = nodeDragActive;
      if (didDrag && commitCommand) {
        const cmds: PatchNodeCommand[] = [];
        for (const id of nodeDragIds) {
          const snap = nodeDragSnapshots.get(id);
          const f = findNode(project, id);
          if (!snap || !f) {
            continue;
          }
          if (f.node.x === snap.x && f.node.y === snap.y) {
            continue;
          }
          cmds.push(
            new PatchNodeCommand(
              project,
              id,
              { x: f.node.x, y: f.node.y },
              "移动",
              snap,
            ),
          );
        }
        if (cmds.length === 1) {
          commitCommand(cmds[0]);
        } else if (cmds.length > 1) {
          commitCommand(new CompositeCommand(cmds, "移动"));
        }
      }
      resetNodeDrag();
      refreshHoverCursorFromStage();
      emptyClickPending = false;
      marqueeActive = false;
      screenMarqueeStart = null;
      canvasMarqueeStart = null;
      destroyMarqueeVisual();
      return;
    }

    if (!stage || !canvasMarqueeStart) {
      emptyClickPending = false;
      marqueeActive = false;
      screenMarqueeStart = null;
      canvasMarqueeStart = null;
      destroyMarqueeVisual();
      return;
    }

    if (marqueeActive && marqueeRectKonva) {
      const p = stage.getPointerPosition();
      const c = p
        ? stageToCanvas(p.x, p.y)
        : stageToCanvas(
            e.clientX - container.getBoundingClientRect().left,
            e.clientY - container.getBoundingClientRect().top,
          );
      const r = normalizeRect(canvasMarqueeStart.x, canvasMarqueeStart.y, c.x, c.y);
      const po = collectVisiblePaintOrder(project.nodes[0]);
      const rawIds = idsFullyInsideMarquee(po, r);
      const unlocked = new Set<string>();
      for (const id of rawIds) {
        if (!isNodeLocked(id)) {
          unlocked.add(id);
        }
      }
      selection.setAll(unlocked);
      updateSelectionOverlay();
    } else if (emptyClickPending) {
      selection.clear();
      updateSelectionOverlay();
    }

    emptyClickPending = false;
    marqueeActive = false;
    screenMarqueeStart = null;
    canvasMarqueeStart = null;
    destroyMarqueeVisual();
  };

  const onWindowKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) {
      return;
    }
    if (e.key === "Escape" && !isEditableDomTarget(e.target)) {
      e.preventDefault();
      selection.clear();
      emptyClickPending = false;
      marqueeActive = false;
      screenMarqueeStart = null;
      canvasMarqueeStart = null;
      destroyMarqueeVisual();
      resetNodeDrag();
      updateSelectionOverlay();
      return;
    }
    if (!isEditableDomTarget(e.target)) {
      const k = e.key;
      if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
        if (commitCommand) {
          const step = e.shiftKey ? 10 : 1;
          let dx = 0;
          let dy = 0;
          if (k === "ArrowLeft") {
            dx = -step;
          } else if (k === "ArrowRight") {
            dx = step;
          } else if (k === "ArrowUp") {
            dy = -step;
          } else {
            dy = step;
          }
          const ids = movableSelectedIds();
          if (ids.length > 0) {
            e.preventDefault();
            const cmds: PatchNodeCommand[] = [];
            for (const id of ids) {
              const f = findNode(project, id);
              if (!f) {
                continue;
              }
              const snap = structuredClone(f.node);
              cmds.push(
                new PatchNodeCommand(
                  project,
                  id,
                  { x: f.node.x + dx, y: f.node.y + dy },
                  "方向键",
                  snap,
                ),
              );
            }
            if (cmds.length === 1) {
              commitCommand(cmds[0]);
            } else {
              commitCommand(new CompositeCommand(cmds, "方向键"));
            }
            rebuildContent();
            return;
          }
        }
      }
    }
    if (e.code === "Space" && !isEditableDomTarget(e.target)) {
      e.preventDefault();
      spaceHeld = true;
      updateContainerCursor();
      return;
    }
    if (isEditableDomTarget(e.target)) {
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) {
      return;
    }
    const cw = project.meta.canvasWidth;
    const ch = project.meta.canvasHeight;
    const sw = stage?.width() ?? 400;
    const sh = stage?.height() ?? 300;
    if (e.key === "0") {
      e.preventDefault();
      const o = centerOneToOne(sw, sh, cw, ch);
      viewScale = o.scale;
      viewPan = { x: o.panX, y: o.panY };
      applyViewportTransform();
      return;
    }
    if (e.key === "1") {
      e.preventDefault();
      const o = fitCanvasToWindow(sw, sh, cw, ch, 0.05);
      viewScale = o.scale;
      viewPan = { x: o.panX, y: o.panY };
      applyViewportTransform();
      return;
    }
    if (e.key.toLowerCase() === "g") {
      e.preventDefault();
      cycleGrid();
    }
  };

  const onWindowKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Space") {
      spaceHeld = false;
      refreshHoverCursorFromStage();
    }
  };

  const onContainerPointerLeave = (): void => {
    hoverCursor = "";
    updateContainerCursor();
  };

  const destroy = (): void => {
    resetNodeDrag();
    container.removeEventListener("pointerleave", onContainerPointerLeave);
    hoverCursor = "";
    ro?.disconnect();
    ro = null;
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onWindowMouseUp);
    window.removeEventListener("keydown", onWindowKeyDown);
    window.removeEventListener("keyup", onWindowKeyUp);
    stage?.off("wheel", onWheel);
    stage?.off("mousedown", onStageMouseDown);
    stage?.destroy();
    stage = null;
    mainLayer = null;
    bgRect = null;
    viewport = null;
    world = null;
    lastImgMap = null;
    container.style.cursor = "";
  };

  const rebuildContent = (): void => {
    if (!world) {
      return;
    }
    world.destroyChildren();
    const cw = project.meta.canvasWidth;
    const ch = project.meta.canvasHeight;
    world.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: cw,
        height: ch,
        fill: CANVAS_WHITE,
        listening: false,
      }),
    );
    if (gridStep > 0) {
      world.add(buildGrid(cw, ch, gridStep));
    }
    const imgMap = lastImgMap ?? new Map();
    const rootNode = project.nodes[0];
    if (rootNode) {
      const g = renderNode(project, projectDir, imgMap, rootNode);
      if (g) {
        world.add(g);
      }
    }
    applyViewportTransform();
    updateSelectionOverlay();
  };

  const redraw = async (): Promise<void> => {
    resetNodeDrag();
    container.removeEventListener("pointerleave", onContainerPointerLeave);
    hoverCursor = "";
    ro?.disconnect();
    ro = null;
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onWindowMouseUp);
    window.removeEventListener("keydown", onWindowKeyDown);
    window.removeEventListener("keyup", onWindowKeyUp);
    stage?.off("wheel", onWheel);
    stage?.off("mousedown", onStageMouseDown);
    stage?.destroy();
    stage = null;
    mainLayer = null;
    bgRect = null;
    viewport = null;
    world = null;

    const w = container.clientWidth || 400;
    const h = container.clientHeight || 300;
    stage = new Konva.Stage({
      container,
      width: w,
      height: h,
    });
    mainLayer = new Konva.Layer();
    stage.add(mainLayer);

    bgRect = new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: h,
      fill: GRAY,
      listening: false,
    });
    mainLayer.add(bgRect);

    const cw = project.meta.canvasWidth;
    const ch = project.meta.canvasHeight;
    const init = fitCanvasInitial(w, h, cw, ch, PAD);
    viewScale = init.scale;
    viewPan = { x: init.panX, y: init.panY };
    gridStep = 0;

    viewport = new Konva.Group();
    mainLayer.add(viewport);

    world = new Konva.Group();
    viewport.add(world);

    const paths = new Set<string>();
    if (project.nodes[0]) {
      collectPaths(project, projectDir, project.nodes[0], paths);
    }
    lastImgMap = await preloadImages(paths, loadImage);
    rebuildContent();

    stage.on("wheel", onWheel);
    stage.on("mousedown", onStageMouseDown);
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);
    container.addEventListener("pointerleave", onContainerPointerLeave);

    ro = new ResizeObserver(() => {
      syncStageSize();
    });
    ro.observe(container);
  };

  const rebuildScene = (): void => {
    rebuildContent();
  };

  const ensureNodeVisible = (nodeId: string): void => {
    const rootNode = project.nodes[0];
    if (!rootNode || !stage) {
      return;
    }
    const n = findNodeById(rootNode, nodeId);
    if (!n) {
      return;
    }
    const box = getCanvasAabb(n);
    const sw = stage.width();
    const sh = stage.height();
    const mg = PAD;
    let pan = { ...viewPan };
    const sl = pan.x + box.x * viewScale;
    const sr = pan.x + (box.x + box.width) * viewScale;
    const st = pan.y + box.y * viewScale;
    const sb = pan.y + (box.y + box.height) * viewScale;
    if (sl < mg) {
      pan.x += mg - sl;
    }
    if (sr > sw - mg) {
      pan.x -= sr - (sw - mg);
    }
    if (st < mg) {
      pan.y += mg - st;
    }
    if (sb > sh - mg) {
      pan.y -= sb - (sh - mg);
    }
    viewPan = pan;
    applyViewportTransform();
  };

  const getViewportCenterCanvas = (): { x: number; y: number } | null => {
    if (!stage) {
      return null;
    }
    return stageToCanvas(stage.width() / 2, stage.height() / 2);
  };

  return {
    destroy,
    redraw,
    refreshSelection: updateSelectionOverlay,
    rebuildScene,
    ensureNodeVisible,
    getStage: () => stage,
    getViewportCenterCanvas,
  };
}
