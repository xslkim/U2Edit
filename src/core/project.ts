import yaml from "js-yaml";
import { readText, writeText } from "./fileService";
import type {
  AssetRef,
  AssetTintRef,
  ButtonNode,
  ExportConfig,
  ImageNode,
  InputFieldNode,
  Meta,
  Node,
  PanelNode,
  Project,
  SliderNode,
  TextLabelStyle,
  TextNode,
  ToggleNode,
} from "./schema";
import { createDefaultPanel, CURRENT_SCHEMA_VERSION } from "./schema";
import { UnsupportedSchemaError } from "./errors";
import { getReadableSchemaCap } from "./schemaVersionPolicy";

export interface ValidationError {
  /** JSON Pointer 风格或语义路径，如 `nodes[2].id` */
  path: string;
  message: string;
  code?: string;
}

const ID_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const PIVOTS = new Set<string>([
  "topLeft",
  "topCenter",
  "topRight",
  "centerLeft",
  "center",
  "centerRight",
  "bottomLeft",
  "bottomCenter",
  "bottomRight",
]);

const TEXT_ALIGNS = new Set<string>(["left", "center", "right"]);

const SLIDER_DIRECTIONS = new Set<string>(["horizontal", "vertical"]);

const NODE_TYPES = new Set<string>([
  "image",
  "text",
  "button",
  "panel",
  "slider",
  "toggle",
  "inputField",
]);

/** 项目目录下的相对路径拼接（保留 Windows 反斜杠） */
export function joinProjectPath(dir: string, file: string): string {
  const d = dir.replace(/[/\\]+$/, "");
  const sep = d.includes("\\") ? "\\" : "/";
  return `${d}${sep}${file}`;
}

function joinDirFile(dir: string, file: string): string {
  return joinProjectPath(dir, file);
}

/** 新建项目时 `export` 占位（与 T1.2 fixture 一致结构） */
export const DEFAULT_EXPORT_TEMPLATE: ExportConfig = {
  unity: {
    assetRootPath: "Assets/UI",
    defaultFont: "Assets/Fonts/Default.asset",
    fontSizeScale: 1,
    renderMode: "ScreenSpaceOverlay",
    referenceResolution: [1920, 1080],
    screenMatchMode: 0.5,
  },
  unreal: {
    assetRootPath: "/Game/UI",
    defaultFont: "/Game/Fonts/Default",
    fontSizeScale: 1,
  },
};

/**
 * 创建空白可保存项目（单根 panel，空 assets）。
 */
export function createBlankProject(opts: {
  name: string;
  canvasWidth: number;
  canvasHeight: number;
}): Project {
  const root = createDefaultPanel({
    id: "root_panel",
    name: "Root",
    x: 0,
    y: 0,
    width: opts.canvasWidth,
    height: opts.canvasHeight,
    children: [],
  });
  const exportCfg = structuredClone(DEFAULT_EXPORT_TEMPLATE);
  exportCfg.unity.referenceResolution = [opts.canvasWidth, opts.canvasHeight];
  return {
    meta: {
      name: opts.name.trim(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      canvasWidth: opts.canvasWidth,
      canvasHeight: opts.canvasHeight,
    },
    assets: [],
    nodes: [root],
    export: exportCfg,
  };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function reqNum(raw: Record<string, unknown>, key: string, ctx: string): number {
  const v = raw[key];
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new Error(`${ctx}: 缺少或非法数字字段 "${key}"`);
  }
  return v;
}

function reqStr(raw: Record<string, unknown>, key: string, ctx: string): string {
  const v = raw[key];
  if (typeof v !== "string") {
    throw new Error(`${ctx}: 缺少或非法字符串字段 "${key}"`);
  }
  return v;
}

function optBool(raw: Record<string, unknown>, key: string, ctx: string): boolean {
  const v = raw[key];
  if (typeof v !== "boolean") {
    throw new Error(`${ctx}: 缺少或非法布尔字段 "${key}"`);
  }
  return v;
}

function parseTextLabel(raw: unknown, ctx: string): TextLabelStyle {
  if (!isRecord(raw)) {
    throw new Error(`${ctx}: label/placeholder/text 必须为对象`);
  }
  return {
    content: reqStr(raw, "content", ctx),
    fontSize: reqNum(raw, "fontSize", ctx),
    color: reqStr(raw, "color", ctx),
    textAlign: reqStr(raw, "textAlign", ctx) as TextLabelStyle["textAlign"],
  };
}

function parseAssetTintRef(raw: unknown, ctx: string): AssetTintRef | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (!isRecord(raw)) {
    throw new Error(`${ctx}: 资源引用必须为对象或 null`);
  }
  const assetId =
    raw.assetId === null || raw.assetId === undefined ? null : String(raw.assetId);
  const tint = typeof raw.tint === "string" ? raw.tint : "#FFFFFF";
  return { assetId, tint };
}

function parseBaseNode(raw: Record<string, unknown>, ctx: string) {
  return {
    id: reqStr(raw, "id", ctx),
    name: reqStr(raw, "name", ctx),
    x: reqNum(raw, "x", ctx),
    y: reqNum(raw, "y", ctx),
    width: reqNum(raw, "width", ctx),
    height: reqNum(raw, "height", ctx),
    pivot: reqStr(raw, "pivot", ctx) as Node["pivot"],
    visible: optBool(raw, "visible", ctx),
    opacity: reqNum(raw, "opacity", ctx),
  };
}

function parseNode(raw: unknown, ctx: string): Node {
  if (!isRecord(raw)) {
    throw new Error(`${ctx}: 节点必须是对象`);
  }
  const type = reqStr(raw, "type", ctx);
  const base = parseBaseNode(raw, ctx);

  switch (type) {
    case "image": {
      const assetId =
        raw.assetId === null || raw.assetId === undefined ? null : String(raw.assetId);
      const tint = typeof raw.tint === "string" ? raw.tint : "#FFFFFF";
      const n: ImageNode = { ...base, type: "image", assetId, tint };
      return n;
    }
    case "text": {
      const n: TextNode = {
        ...base,
        type: "text",
        content: reqStr(raw, "content", ctx),
        fontSize: reqNum(raw, "fontSize", ctx),
        color: reqStr(raw, "color", ctx),
        textAlign: reqStr(raw, "textAlign", ctx) as TextNode["textAlign"],
      };
      return n;
    }
    case "button": {
      const ch = raw.children;
      if (!Array.isArray(ch)) {
        throw new Error(`${ctx}: button 必须有 children 数组`);
      }
      const n: ButtonNode = {
        ...base,
        type: "button",
        background: parseAssetTintRef(raw.background, `${ctx}.background`),
        label: parseTextLabel(raw.label, `${ctx}.label`),
        children: ch.map((c, i) => parseNode(c, `${ctx}.children[${i}]`)),
      };
      return n;
    }
    case "panel": {
      const ch = raw.children;
      if (!Array.isArray(ch)) {
        throw new Error(`${ctx}: panel 必须有 children 数组`);
      }
      const n: PanelNode = {
        ...base,
        type: "panel",
        background: parseAssetTintRef(raw.background, `${ctx}.background`),
        children: ch.map((c, i) => parseNode(c, `${ctx}.children[${i}]`)),
      };
      return n;
    }
    case "slider": {
      const n: SliderNode = {
        ...base,
        type: "slider",
        direction: reqStr(raw, "direction", ctx) as SliderNode["direction"],
        defaultValue: reqNum(raw, "defaultValue", ctx),
        trackImage: parseAssetTintRef(raw.trackImage, `${ctx}.trackImage`),
        fillImage: parseAssetTintRef(raw.fillImage, `${ctx}.fillImage`),
        thumbImage: parseAssetTintRef(raw.thumbImage, `${ctx}.thumbImage`),
      };
      return n;
    }
    case "toggle": {
      const n: ToggleNode = {
        ...base,
        type: "toggle",
        defaultOn: optBool(raw, "defaultOn", ctx),
        background: parseAssetTintRef(raw.background, `${ctx}.background`),
        checkmark: parseAssetTintRef(raw.checkmark, `${ctx}.checkmark`),
        label: parseTextLabel(raw.label, `${ctx}.label`),
      };
      return n;
    }
    case "inputField": {
      const n: InputFieldNode = {
        ...base,
        type: "inputField",
        background: parseAssetTintRef(raw.background, `${ctx}.background`),
        placeholder: parseTextLabel(raw.placeholder, `${ctx}.placeholder`),
        text: parseTextLabel(raw.text, `${ctx}.text`),
      };
      return n;
    }
    default:
      throw new Error(`${ctx}: 未知节点 type "${type}"`);
  }
}

function parseMeta(raw: unknown): Meta {
  if (!isRecord(raw)) {
    throw new Error("meta 必须为对象");
  }
  return {
    name: reqStr(raw, "name", "meta"),
    schemaVersion: reqNum(raw, "schemaVersion", "meta"),
    canvasWidth: reqNum(raw, "canvasWidth", "meta"),
    canvasHeight: reqNum(raw, "canvasHeight", "meta"),
  };
}

function parseAssets(raw: unknown): AssetRef[] {
  if (!Array.isArray(raw)) {
    throw new Error("assets 必须为数组");
  }
  return raw.map((a, i) => {
    if (!isRecord(a)) {
      throw new Error(`assets[${i}] 必须为对象`);
    }
    return {
      id: reqStr(a, "id", `assets[${i}]`),
      path: reqStr(a, "path", `assets[${i}]`),
      width: reqNum(a, "width", `assets[${i}]`),
      height: reqNum(a, "height", `assets[${i}]`),
    };
  });
}

function parseExport(raw: unknown): ExportConfig {
  if (!isRecord(raw)) {
    throw new Error("export 必须为对象");
  }
  const unity = raw.unity;
  const unreal = raw.unreal;
  if (!isRecord(unity) || !isRecord(unreal)) {
    throw new Error("export.unity / export.unreal 必须为对象");
  }
  const rr = unity.referenceResolution;
  if (!Array.isArray(rr) || rr.length !== 2 || typeof rr[0] !== "number" || typeof rr[1] !== "number") {
    throw new Error("export.unity.referenceResolution 必须为 [number, number]");
  }
  return {
    unity: {
      assetRootPath: reqStr(unity, "assetRootPath", "export.unity"),
      defaultFont: reqStr(unity, "defaultFont", "export.unity"),
      fontSizeScale: reqNum(unity, "fontSizeScale", "export.unity"),
      renderMode: reqStr(unity, "renderMode", "export.unity"),
      referenceResolution: [rr[0], rr[1]],
      screenMatchMode: reqNum(unity, "screenMatchMode", "export.unity"),
    },
    unreal: {
      assetRootPath: reqStr(unreal, "assetRootPath", "export.unreal"),
      defaultFont: reqStr(unreal, "defaultFont", "export.unreal"),
      fontSizeScale: reqNum(unreal, "fontSizeScale", "export.unreal"),
    },
  };
}

function assertReadableSchemaVersion(v: number): void {
  if (typeof v !== "number" || Number.isNaN(v) || v < 1 || v > getReadableSchemaCap()) {
    throw new UnsupportedSchemaError(
      `不支持的 schemaVersion: ${String(v)}（可读上限 ${getReadableSchemaCap()}）`,
    );
  }
}

function buildProjectFromLoaded(loaded: Record<string, unknown>): Project {
  const nodesRaw = loaded.nodes;
  if (!Array.isArray(nodesRaw)) {
    throw new Error("nodes 必须为数组");
  }
  const nodes = nodesRaw.map((n, i) => parseNode(n, `nodes[${i}]`));
  return {
    meta: parseMeta(loaded.meta),
    assets: parseAssets(loaded.assets),
    nodes,
    export: parseExport(loaded.export),
  };
}

/**
 * 将已反序列化的 YAML 根对象解析为 `Project`（用于迁移后与 `migrate` 衔接）。
 */
export function parseProjectObject(loaded: unknown): Project {
  if (!isRecord(loaded)) {
    throw new Error("YAML 根必须为 mapping");
  }
  const project = buildProjectFromLoaded(loaded);
  assertReadableSchemaVersion(project.meta.schemaVersion);
  return project;
}

/**
 * 将 `project.yaml` 文本解析为 `Project`（严格结构，失败抛错）。
 */
export function parseProjectYaml(content: string): Project {
  const loaded = yaml.load(content) as unknown;
  return parseProjectObject(loaded);
}

const DUMP_OPTS: yaml.DumpOptions = {
  lineWidth: -1,
  noRefs: true,
  quotingType: '"',
  sortKeys: true,
};

/**
 * 将 `Project` 序列化为 `project.yaml` 文本（稳定 key 排序，便于 round-trip 对比）。
 */
export function stringifyProject(project: Project): string {
  const plain = JSON.parse(JSON.stringify(project)) as object;
  return yaml.dump(plain, DUMP_OPTS).replace(/\r\n/g, "\n");
}

function collectAssetIdsFromTint(ref: AssetTintRef | null): string[] {
  if (!ref || ref.assetId === null) {
    return [];
  }
  return [ref.assetId];
}

function collectAssetIdsFromNode(n: Node): string[] {
  const ids: string[] = [];
  switch (n.type) {
    case "image":
      if (n.assetId) {
        ids.push(n.assetId);
      }
      break;
    case "button":
      ids.push(...collectAssetIdsFromTint(n.background));
      ids.push(...n.children.flatMap(collectAssetIdsFromNode));
      break;
    case "panel":
      ids.push(...collectAssetIdsFromTint(n.background));
      ids.push(...n.children.flatMap(collectAssetIdsFromNode));
      break;
    case "slider":
      ids.push(
        ...collectAssetIdsFromTint(n.trackImage),
        ...collectAssetIdsFromTint(n.fillImage),
        ...collectAssetIdsFromTint(n.thumbImage),
      );
      break;
    case "toggle":
      ids.push(...collectAssetIdsFromTint(n.background), ...collectAssetIdsFromTint(n.checkmark));
      break;
    case "inputField":
      ids.push(...collectAssetIdsFromTint(n.background));
      break;
    default:
      break;
  }
  return ids;
}

function checkEnums(n: Node, path: string, errors: ValidationError[]): void {
  if (!NODE_TYPES.has(n.type)) {
    errors.push({ path: `${path}.type`, message: `非法 type: ${n.type}`, code: "ENUM_TYPE" });
  }
  if (!PIVOTS.has(n.pivot)) {
    errors.push({ path: `${path}.pivot`, message: `非法 pivot: ${n.pivot}`, code: "ENUM_PIVOT" });
  }
  if (n.type === "text" && !TEXT_ALIGNS.has(n.textAlign)) {
    errors.push({ path: `${path}.textAlign`, message: `非法 textAlign: ${n.textAlign}`, code: "ENUM_TEXT_ALIGN" });
  }
  if (n.type === "button" && !TEXT_ALIGNS.has(n.label.textAlign)) {
    errors.push({
      path: `${path}.label.textAlign`,
      message: `非法 textAlign: ${n.label.textAlign}`,
      code: "ENUM_TEXT_ALIGN",
    });
  }
  if (n.type === "toggle" && !TEXT_ALIGNS.has(n.label.textAlign)) {
    errors.push({
      path: `${path}.label.textAlign`,
      message: `非法 textAlign: ${n.label.textAlign}`,
      code: "ENUM_TEXT_ALIGN",
    });
  }
  if (n.type === "inputField") {
    if (!TEXT_ALIGNS.has(n.placeholder.textAlign)) {
      errors.push({
        path: `${path}.placeholder.textAlign`,
        message: `非法 textAlign: ${n.placeholder.textAlign}`,
        code: "ENUM_TEXT_ALIGN",
      });
    }
    if (!TEXT_ALIGNS.has(n.text.textAlign)) {
      errors.push({
        path: `${path}.text.textAlign`,
        message: `非法 textAlign: ${n.text.textAlign}`,
        code: "ENUM_TEXT_ALIGN",
      });
    }
  }
  if (n.type === "slider" && !SLIDER_DIRECTIONS.has(n.direction)) {
    errors.push({
      path: `${path}.direction`,
      message: `非法 direction: ${n.direction}`,
      code: "ENUM_DIRECTION",
    });
  }
}

function walkValidate(
  n: Node,
  path: string,
  depth: number,
  seenIds: Map<string, string>,
  assetIds: Set<string>,
  errors: ValidationError[],
): void {
  if (depth > 6) {
    errors.push({
      path,
      message: `嵌套深度超过 6（当前深度 ${depth}）`,
      code: "DEPTH",
    });
    return;
  }

  if (!ID_PATTERN.test(n.id)) {
    errors.push({
      path: `${path}.id`,
      message: `id 格式非法: "${n.id}"`,
      code: "ID_FORMAT",
    });
  }

  if (seenIds.has(n.id)) {
    errors.push({
      path: `${path}.id`,
      message: `重复的 id: "${n.id}"（与 ${seenIds.get(n.id)} 冲突）`,
      code: "DUPLICATE_ID",
    });
  } else {
    seenIds.set(n.id, path);
  }

  checkEnums(n, path, errors);

  for (const aid of collectAssetIdsFromNode(n)) {
    if (!assetIds.has(aid)) {
      errors.push({
        path,
        message: `引用了不存在的 assetId: "${aid}"`,
        code: "ASSET_MISSING",
      });
    }
  }

  if (n.type === "panel" || n.type === "button") {
    for (let i = 0; i < n.children.length; i += 1) {
      walkValidate(n.children[i], `${path}.children[${i}]`, depth + 1, seenIds, assetIds, errors);
    }
  }
}

/**
 * 校验 `Project` 数据（不读写磁盘）。
 */
export function validate(project: Project): ValidationError[] {
  const errors: ValidationError[] = [];
  const assetIds = new Set(project.assets.map((a) => a.id));

  if (project.nodes.length !== 1) {
    errors.push({
      path: "nodes",
      message: `根节点必须恰好 1 个，当前为 ${project.nodes.length}`,
      code: "ROOT_COUNT",
    });
  } else {
    const root = project.nodes[0];
    if (root.type !== "panel") {
      errors.push({
        path: "nodes[0].type",
        message: `根节点 type 必须为 panel，当前为 ${root.type}`,
        code: "ROOT_TYPE",
      });
    }
  }

  const seenIds = new Map<string, string>();
  if (project.nodes.length === 1) {
    walkValidate(project.nodes[0], "nodes[0]", 1, seenIds, assetIds, errors);
  }

  return errors;
}

/**
 * 从目录读取 `project.yaml` 并解析。
 */
export async function loadProject(dir: string): Promise<{ project: Project; warnings: string[] }> {
  const path = joinDirFile(dir, "project.yaml");
  const text = await readText(path);
  const project = parseProjectYaml(text);
  return { project, warnings: [] };
}

/**
 * 将 `Project` 写入目录下的 `project.yaml`。
 */
export async function saveProject(dir: string, project: Project): Promise<void> {
  const path = joinDirFile(dir, "project.yaml");
  const text = stringifyProject(project);
  await writeText(path, text);
}
