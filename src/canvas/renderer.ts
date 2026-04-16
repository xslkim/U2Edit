import Konva from "konva";
import { joinProjectPath } from "../core/project";
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

/** 从磁盘绝对路径加载位图（由宿主注入；失败返回 null） */
export type ImageLoader = (absolutePath: string) => Promise<HTMLImageElement | null>;

export interface MountProjectCanvasOptions {
  container: HTMLDivElement;
  project: Project;
  projectDir: string | null;
  loadImage: ImageLoader;
}

export interface MountedCanvas {
  destroy(): void;
  redraw(): Promise<void>;
  getStage(): Konva.Stage | null;
}

const PAD = 16;
const GRAY = "#3f3f46";
const CANVAS_WHITE = "#ffffff";

function basename(p: string): string {
  const s = p.replace(/[/\\]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i >= 0 ? s.slice(i + 1) : s;
}

export function resolveAssetAbsolute(
  project: Project,
  projectDir: string | null,
  assetId: string | null,
): string | null {
  if (!projectDir || !assetId) {
    return null;
  }
  const ref = project.assets.find((a) => a.id === assetId);
  if (!ref) {
    return null;
  }
  const rel = ref.path.replace(/^[/\\]+/, "");
  return joinProjectPath(projectDir, rel);
}

function computeFit(
  stageW: number,
  stageH: number,
  cw: number,
  ch: number,
): { x: number; y: number; scale: number } {
  const sw = Math.max(1, stageW - PAD * 2);
  const sh = Math.max(1, stageH - PAD * 2);
  const scale = Math.min(sw / cw, sh / ch, 1);
  const x = (stageW - cw * scale) / 2;
  const y = (stageH - ch * scale) / 2;
  return { x, y, scale };
}

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

export function mountProjectCanvas(opts: MountProjectCanvasOptions): MountedCanvas {
  const { container, project, projectDir, loadImage } = opts;
  let stage: Konva.Stage | null = null;
  let mainLayer: Konva.Layer | null = null;
  let world: Konva.Group | null = null;
  let ro: ResizeObserver | null = null;
  let lastImgMap: Map<string, HTMLImageElement | null> | null = null;

  const layoutWorld = (): void => {
    if (!stage || !world || !mainLayer) {
      return;
    }
    const w = container.clientWidth || 400;
    const h = container.clientHeight || 300;
    stage.width(w);
    stage.height(h);
    const cw = project.meta.canvasWidth;
    const ch = project.meta.canvasHeight;
    const fit = computeFit(w, h, cw, ch);
    world.position({ x: fit.x, y: fit.y });
    world.scale({ x: fit.scale, y: fit.scale });
    mainLayer.batchDraw();
  };

  const destroy = (): void => {
    ro?.disconnect();
    ro = null;
    stage?.destroy();
    stage = null;
    mainLayer = null;
    world = null;
    lastImgMap = null;
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
    const imgMap = lastImgMap ?? new Map();
    const root = project.nodes[0];
    if (root) {
      const g = renderNode(project, projectDir, imgMap, root);
      if (g) {
        world.add(g);
      }
    }
    layoutWorld();
  };

  const redraw = async (): Promise<void> => {
    ro?.disconnect();
    ro = null;
    stage?.destroy();
    stage = null;
    mainLayer = null;
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

    mainLayer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: w,
        height: h,
        fill: GRAY,
        listening: false,
      }),
    );

    const cw = project.meta.canvasWidth;
    const ch = project.meta.canvasHeight;
    const fit = computeFit(w, h, cw, ch);
    world = new Konva.Group({
      x: fit.x,
      y: fit.y,
      scaleX: fit.scale,
      scaleY: fit.scale,
    });
    mainLayer.add(world);

    const paths = new Set<string>();
    if (project.nodes[0]) {
      collectPaths(project, projectDir, project.nodes[0], paths);
    }
    lastImgMap = await preloadImages(paths, loadImage);
    rebuildContent();

    ro = new ResizeObserver(() => {
      layoutWorld();
    });
    ro.observe(container);
  };

  return {
    destroy,
    redraw,
    getStage: () => stage,
  };
}
