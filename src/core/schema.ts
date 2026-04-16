/**
 * project.yaml 数据模型（与 docs/requirements.md §3.2、§3.3 对齐）
 */

export const CURRENT_SCHEMA_VERSION = 1 as const;

// —— 枚举 ——

export type Pivot =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "centerLeft"
  | "center"
  | "centerRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight";

export type TextAlign = "left" | "center" | "right";

export type SliderDirection = "horizontal" | "vertical";

export type NodeType = "image" | "text" | "button" | "panel" | "slider" | "toggle" | "inputField";

// —— 通用结构 ——

/** 带可选 tint 的资源引用（省略 tint 时 YAML 侧可省略，内存模型显式给出默认值） */
export interface AssetTintRef {
  assetId: string | null;
  /** 默认 `#FFFFFF` */
  tint: string;
}

export interface TextLabelStyle {
  content: string;
  fontSize: number;
  color: string;
  textAlign: TextAlign;
}

export interface Meta {
  name: string;
  schemaVersion: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface AssetRef {
  id: string;
  path: string;
  width: number;
  height: number;
}

export interface UnityExportConfig {
  assetRootPath: string;
  defaultFont: string;
  fontSizeScale: number;
  renderMode: string;
  referenceResolution: [number, number];
  screenMatchMode: number;
}

export interface UnrealExportConfig {
  assetRootPath: string;
  defaultFont: string;
  fontSizeScale: number;
}

export interface ExportConfig {
  unity: UnityExportConfig;
  unreal: UnrealExportConfig;
}

interface BaseNode {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pivot: Pivot;
  visible: boolean;
  opacity: number;
}

export interface ImageNode extends BaseNode {
  type: "image";
  assetId: string | null;
  tint: string;
}

export interface TextNode extends BaseNode {
  type: "text";
  content: string;
  fontSize: number;
  color: string;
  textAlign: TextAlign;
}

export interface ButtonNode extends BaseNode {
  type: "button";
  background: AssetTintRef | null;
  label: TextLabelStyle;
  children: Node[];
}

export interface PanelNode extends BaseNode {
  type: "panel";
  background: AssetTintRef | null;
  children: Node[];
}

export interface SliderNode extends BaseNode {
  type: "slider";
  direction: SliderDirection;
  defaultValue: number;
  trackImage: AssetTintRef | null;
  fillImage: AssetTintRef | null;
  thumbImage: AssetTintRef | null;
}

export interface ToggleNode extends BaseNode {
  type: "toggle";
  defaultOn: boolean;
  background: AssetTintRef | null;
  checkmark: AssetTintRef | null;
  label: TextLabelStyle;
}

export interface InputFieldNode extends BaseNode {
  type: "inputField";
  background: AssetTintRef | null;
  placeholder: TextLabelStyle;
  text: TextLabelStyle;
}

export type Node =
  | ImageNode
  | TextNode
  | ButtonNode
  | PanelNode
  | SliderNode
  | ToggleNode
  | InputFieldNode;

export interface Project {
  meta: Meta;
  assets: AssetRef[];
  nodes: Node[];
  export: ExportConfig;
}

// —— 默认值工厂（requirements §2.6.2）——

const commonBase = (): Pick<BaseNode, "pivot" | "visible" | "opacity"> => ({
  pivot: "topLeft",
  visible: true,
  opacity: 1.0,
});

export function createDefaultImage(overrides: Partial<Omit<ImageNode, "type">> = {}): ImageNode {
  return {
    id: "image_new",
    name: "Image",
    type: "image",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    ...commonBase(),
    assetId: null,
    tint: "#FFFFFF",
    ...overrides,
  };
}

export function createDefaultText(overrides: Partial<Omit<TextNode, "type">> = {}): TextNode {
  return {
    id: "text_new",
    name: "Text",
    type: "text",
    x: 0,
    y: 0,
    width: 200,
    height: 40,
    ...commonBase(),
    content: "Text",
    fontSize: 24,
    color: "#FFFFFF",
    textAlign: "left",
    ...overrides,
  };
}

export function createDefaultButton(overrides: Partial<Omit<ButtonNode, "type">> = {}): ButtonNode {
  return {
    id: "button_new",
    name: "Button",
    type: "button",
    x: 0,
    y: 0,
    width: 200,
    height: 60,
    ...commonBase(),
    background: null,
    label: {
      content: "Button",
      fontSize: 20,
      color: "#000000",
      textAlign: "center",
    },
    children: [],
    ...overrides,
  };
}

export function createDefaultPanel(overrides: Partial<Omit<PanelNode, "type">> = {}): PanelNode {
  return {
    id: "panel_new",
    name: "Panel",
    type: "panel",
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    ...commonBase(),
    background: null,
    children: [],
    ...overrides,
  };
}

export function createDefaultSlider(overrides: Partial<Omit<SliderNode, "type">> = {}): SliderNode {
  return {
    id: "slider_new",
    name: "Slider",
    type: "slider",
    x: 0,
    y: 0,
    width: 300,
    height: 40,
    ...commonBase(),
    direction: "horizontal",
    defaultValue: 0.5,
    trackImage: null,
    fillImage: null,
    thumbImage: null,
    ...overrides,
  };
}

export function createDefaultToggle(overrides: Partial<Omit<ToggleNode, "type">> = {}): ToggleNode {
  return {
    id: "toggle_new",
    name: "Toggle",
    type: "toggle",
    x: 0,
    y: 0,
    width: 200,
    height: 40,
    ...commonBase(),
    defaultOn: false,
    background: null,
    checkmark: null,
    label: {
      content: "Toggle",
      fontSize: 16,
      color: "#FFFFFF",
      textAlign: "left",
    },
    ...overrides,
  };
}

export function createDefaultInputField(
  overrides: Partial<Omit<InputFieldNode, "type">> = {},
): InputFieldNode {
  return {
    id: "inputField_new",
    name: "InputField",
    type: "inputField",
    x: 0,
    y: 0,
    width: 300,
    height: 50,
    ...commonBase(),
    background: null,
    placeholder: {
      content: "Enter text...",
      fontSize: 16,
      color: "#999999",
      textAlign: "left",
    },
    text: {
      content: "",
      fontSize: 16,
      color: "#FFFFFF",
      textAlign: "left",
    },
    ...overrides,
  };
}
