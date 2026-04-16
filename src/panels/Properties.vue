<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import type { Command } from "../core/history";
import { CompositeCommand, findNode, PatchNodeCommand } from "../core/history";
import type {
  ButtonNode,
  ImageNode,
  InputFieldNode,
  Node,
  PanelNode,
  Pivot,
  Project,
  SliderNode,
  TextNode,
  ToggleNode,
} from "../core/schema";
import ColorPicker from "./ColorPicker.vue";
import AssetPicker from "./AssetPicker.vue";
import { parseHexColor, rgbaToHex } from "./colorFormat";
import type { SelectionStore } from "../canvas/selection";
import {
  isNodeIdAvailable,
  isValidNodeIdFormat,
} from "./propertyValidation";

const props = defineProps<{
  project: Project;
  /** 解析资源缩略图路径；无目录时 AssetPicker 仅列 id */
  projectDir: string | null;
  selection: SelectionStore;
  commitCommand: (cmd: Command) => void;
  /** 拖拽改数值时画布需重绘（就地改节点不替换 project 引用） */
  requestRedraw?: () => void;
}>();

const colorPickerOpen = ref(false);
const assetPickerOpen = ref(false);

type ColorEditKind =
  | "textColor"
  | "imageTint"
  | "panelBgTint"
  | "buttonBgTint"
  | "inputTextColor"
  | "inputPlaceholderColor";

const colorEditKind = ref<ColorEditKind | null>(null);
const colorInitialHex = ref("#FFFFFFFFFFFFF".slice(0, 7));

const fieldSessionBefore = ref<Map<string, Node>>(new Map());
const colorPickerAnchorRef = ref<HTMLElement | null>(null);
const assetPickerAnchorRef = ref<HTMLElement | null>(null);

watch(colorPickerOpen, (v) => {
  if (v) {
    assetPickerOpen.value = false;
  }
});
watch(assetPickerOpen, (v) => {
  if (v) {
    colorPickerOpen.value = false;
  }
});

function hexNormalize(s: string): string {
  const p = parseHexColor(s);
  return p ? rgbaToHex(p) : s.trim().toUpperCase();
}

function snapshotNodesForIds(ids: string[]): Map<string, Node> {
  const m = new Map<string, Node>();
  for (const id of ids) {
    const f = findNode(props.project, id);
    if (f) {
      m.set(id, structuredClone(f.node));
    }
  }
  return m;
}

function restoreSessionNodes(): void {
  const m = fieldSessionBefore.value;
  for (const [id, snap] of m) {
    const f = findNode(props.project, id);
    if (!f) {
      continue;
    }
    f.list[f.index] = structuredClone(snap);
  }
  fieldSessionBefore.value = new Map();
  colorEditKind.value = null;
  props.requestRedraw?.();
}

function openTextColor(anchor: HTMLElement): void {
  colorPickerAnchorRef.value = anchor;
  const ids = selectedNodes.value.filter((n) => n.type === "text").map((n) => n.id);
  fieldSessionBefore.value = snapshotNodesForIds(ids);
  colorEditKind.value = "textColor";
  colorInitialHex.value = hexNormalize(commonStringLoose("color") ?? "#FFFFFF");
  colorPickerOpen.value = true;
}

function previewTextColor(hex: string): void {
  for (const n of selectedNodes.value) {
    if (n.type === "text") {
      (n as TextNode).color = hex;
    }
  }
  props.requestRedraw?.();
}

function commitTextColor(hex: string): void {
  const baseline = colorInitialHex.value;
  colorPickerOpen.value = false;
  colorEditKind.value = null;
  if (hexNormalize(hex) === hexNormalize(baseline)) {
    restoreSessionNodes();
    fieldSessionBefore.value = new Map();
    props.requestRedraw?.();
    return;
  }
  const before = fieldSessionBefore.value;
  fieldSessionBefore.value = new Map();
  const cmds: Command[] = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "text") {
      continue;
    }
    const snap = before.get(n.id);
    if (!snap) {
      continue;
    }
    cmds.push(
      new PatchNodeCommand(props.project, n.id, { color: hex }, "文本颜色", snap),
    );
  }
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else if (cmds.length > 1) {
    props.commitCommand(new CompositeCommand(cmds, "文本颜色"));
  }
}

function cancelColorPicker(): void {
  colorPickerOpen.value = false;
  restoreSessionNodes();
}

// —— Image tint ——

function openImageTint(anchor: HTMLElement): void {
  colorPickerAnchorRef.value = anchor;
  const ids = selectedNodes.value.filter((n) => n.type === "image").map((n) => n.id);
  fieldSessionBefore.value = snapshotNodesForIds(ids);
  colorEditKind.value = "imageTint";
  const t = commonStringLoose("tint");
  colorInitialHex.value = hexNormalize(typeof t === "string" ? t : "#FFFFFF");
  colorPickerOpen.value = true;
}

function previewImageTint(hex: string): void {
  for (const n of selectedNodes.value) {
    if (n.type === "image") {
      (n as ImageNode).tint = hex;
    }
  }
  props.requestRedraw?.();
}

function commitImageTint(hex: string): void {
  const baseline = colorInitialHex.value;
  colorPickerOpen.value = false;
  colorEditKind.value = null;
  if (hexNormalize(hex) === hexNormalize(baseline)) {
    restoreSessionNodes();
    fieldSessionBefore.value = new Map();
    props.requestRedraw?.();
    return;
  }
  const before = fieldSessionBefore.value;
  fieldSessionBefore.value = new Map();
  const cmds: Command[] = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "image") {
      continue;
    }
    const snap = before.get(n.id);
    if (!snap) {
      continue;
    }
    cmds.push(
      new PatchNodeCommand(props.project, n.id, { tint: hex }, "图片着色", snap),
    );
  }
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else if (cmds.length > 1) {
    props.commitCommand(new CompositeCommand(cmds, "图片着色"));
  }
}

// —— Asset id（Image）——

const assetSessionBefore = ref<Map<string, Node>>(new Map());
const assetInitialId = ref<string | null>(null);

function openImageAsset(anchor: HTMLElement): void {
  assetPickerAnchorRef.value = anchor;
  const ids = selectedNodes.value.filter((n) => n.type === "image").map((n) => n.id);
  assetSessionBefore.value = snapshotNodesForIds(ids);
  const c = commonStringLoose("assetId");
  assetInitialId.value = typeof c === "string" ? c : null;
  assetPickerOpen.value = true;
}

function commitImageAsset(id: string | null): void {
  assetPickerOpen.value = false;
  if (id === assetInitialId.value) {
    assetSessionBefore.value = new Map();
    return;
  }
  const before = assetSessionBefore.value;
  assetSessionBefore.value = new Map();
  const cmds: Command[] = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "image") {
      continue;
    }
    const snap = before.get(n.id);
    if (!snap) {
      continue;
    }
    cmds.push(
      new PatchNodeCommand(props.project, n.id, { assetId: id }, "图片资源", snap),
    );
  }
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else if (cmds.length > 1) {
    props.commitCommand(new CompositeCommand(cmds, "图片资源"));
  }
}

function cancelAssetPicker(): void {
  assetPickerOpen.value = false;
  const m = assetSessionBefore.value;
  for (const [id, snap] of m) {
    const f = findNode(props.project, id);
    if (!f) {
      continue;
    }
    f.list[f.index] = structuredClone(snap);
  }
  assetSessionBefore.value = new Map();
  props.requestRedraw?.();
}

function commonInputFieldTextColor(): string | null {
  const ns = selectedNodes.value.filter((n): n is InputFieldNode => n.type === "inputField");
  if (ns.length === 0) {
    return null;
  }
  const v0 = ns[0].text.color;
  for (const n of ns) {
    if (n.text.color !== v0) {
      return null;
    }
  }
  return v0;
}

function commonInputFieldPlaceholderColor(): string | null {
  const ns = selectedNodes.value.filter((n): n is InputFieldNode => n.type === "inputField");
  if (ns.length === 0) {
    return null;
  }
  const v0 = ns[0].placeholder.color;
  for (const n of ns) {
    if (n.placeholder.color !== v0) {
      return null;
    }
  }
  return v0;
}

function patchBackgroundAsset(
  id: string | null,
  node: PanelNode | ButtonNode | InputFieldNode,
): Record<string, unknown> {
  const bg = node.background;
  const tint = bg?.tint ?? "#FFFFFF";
  if (id === null && !bg) {
    return { background: null };
  }
  return {
    background: {
      assetId: id,
      tint,
    },
  };
}

function patchBackgroundTint(
  tint: string,
  node: PanelNode | ButtonNode | InputFieldNode,
): Record<string, unknown> {
  const bg = node.background;
  const assetId = bg?.assetId ?? null;
  return {
    background: {
      assetId,
      tint,
    },
  };
}

function openPanelBgTint(anchor: HTMLElement): void {
  colorPickerAnchorRef.value = anchor;
  const ids = selectedNodes.value.filter((n) => n.type === "panel").map((n) => n.id);
  fieldSessionBefore.value = snapshotNodesForIds(ids);
  colorEditKind.value = "panelBgTint";
  const ns = selectedNodes.value.filter((n): n is PanelNode => n.type === "panel");
  const t = ns[0]?.background?.tint ?? "#FFFFFF";
  let same = true;
  for (const n of ns) {
    if ((n.background?.tint ?? "#FFFFFF") !== t) {
      same = false;
      break;
    }
  }
  colorInitialHex.value = hexNormalize(same ? t : "#FFFFFF");
  colorPickerOpen.value = true;
}

function previewPanelBgTint(hex: string): void {
  for (const n of selectedNodes.value) {
    if (n.type === "panel") {
      const pn = n as PanelNode;
      const bg = pn.background;
      pn.background = {
        assetId: bg?.assetId ?? null,
        tint: hex,
      };
    }
  }
  props.requestRedraw?.();
}

function commitPanelBgTint(hex: string): void {
  const baseline = colorInitialHex.value;
  colorPickerOpen.value = false;
  colorEditKind.value = null;
  if (hexNormalize(hex) === hexNormalize(baseline)) {
    restoreSessionNodes();
    fieldSessionBefore.value = new Map();
    props.requestRedraw?.();
    return;
  }
  const before = fieldSessionBefore.value;
  fieldSessionBefore.value = new Map();
  const cmds: Command[] = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "panel") {
      continue;
    }
    const snap = before.get(n.id);
    if (!snap) {
      continue;
    }
    const pn = n as PanelNode;
    cmds.push(
      new PatchNodeCommand(
        props.project,
        n.id,
        patchBackgroundTint(hex, pn),
        "面板背景着色",
        snap,
      ),
    );
  }
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else if (cmds.length > 1) {
    props.commitCommand(new CompositeCommand(cmds, "面板背景着色"));
  }
}

function commonPanelBgAssetId(): string | null {
  const ns = selectedNodes.value.filter((n): n is PanelNode => n.type === "panel");
  if (ns.length === 0) {
    return null;
  }
  const v0 = ns[0].background?.assetId ?? null;
  for (const n of ns) {
    if ((n.background?.assetId ?? null) !== v0) {
      return null;
    }
  }
  return v0;
}

function openPanelBgAsset(anchor: HTMLElement): void {
  assetPickerAnchorRef.value = anchor;
  const ids = selectedNodes.value.filter((n) => n.type === "panel").map((n) => n.id);
  assetSessionBefore.value = snapshotNodesForIds(ids);
  assetInitialId.value = commonPanelBgAssetId();
  assetPickerOpen.value = true;
}

function commitPanelBgAsset(id: string | null): void {
  assetPickerOpen.value = false;
  if (id === assetInitialId.value) {
    assetSessionBefore.value = new Map();
    return;
  }
  const before = assetSessionBefore.value;
  assetSessionBefore.value = new Map();
  const cmds: Command[] = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "panel") {
      continue;
    }
    const snap = before.get(n.id);
    if (!snap) {
      continue;
    }
    const pn = n as PanelNode;
    cmds.push(
      new PatchNodeCommand(
        props.project,
        n.id,
        patchBackgroundAsset(id, pn),
        "面板背景图",
        snap,
      ),
    );
  }
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else if (cmds.length > 1) {
    props.commitCommand(new CompositeCommand(cmds, "面板背景图"));
  }
}

// —— Button background ——

function openButtonBgTint(anchor: HTMLElement): void {
  colorPickerAnchorRef.value = anchor;
  const ids = selectedNodes.value.filter((n) => n.type === "button").map((n) => n.id);
  fieldSessionBefore.value = snapshotNodesForIds(ids);
  colorEditKind.value = "buttonBgTint";
  const ns = selectedNodes.value.filter((n): n is ButtonNode => n.type === "button");
  const t = ns[0]?.background?.tint ?? "#FFFFFF";
  let same = true;
  for (const n of ns) {
    if ((n.background?.tint ?? "#FFFFFF") !== t) {
      same = false;
      break;
    }
  }
  colorInitialHex.value = hexNormalize(same ? t : "#FFFFFF");
  colorPickerOpen.value = true;
}

function previewButtonBgTint(hex: string): void {
  for (const n of selectedNodes.value) {
    if (n.type === "button") {
      const bn = n as ButtonNode;
      const bg = bn.background;
      bn.background = {
        assetId: bg?.assetId ?? null,
        tint: hex,
      };
    }
  }
  props.requestRedraw?.();
}

function commitButtonBgTint(hex: string): void {
  const baseline = colorInitialHex.value;
  colorPickerOpen.value = false;
  colorEditKind.value = null;
  if (hexNormalize(hex) === hexNormalize(baseline)) {
    restoreSessionNodes();
    fieldSessionBefore.value = new Map();
    props.requestRedraw?.();
    return;
  }
  const before = fieldSessionBefore.value;
  fieldSessionBefore.value = new Map();
  const cmds: Command[] = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "button") {
      continue;
    }
    const snap = before.get(n.id);
    if (!snap) {
      continue;
    }
    const bn = n as ButtonNode;
    cmds.push(
      new PatchNodeCommand(
        props.project,
        n.id,
        patchBackgroundTint(hex, bn),
        "按钮背景着色",
        snap,
      ),
    );
  }
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else if (cmds.length > 1) {
    props.commitCommand(new CompositeCommand(cmds, "按钮背景着色"));
  }
}

function commonButtonBgAssetId(): string | null {
  const ns = selectedNodes.value.filter((n): n is ButtonNode => n.type === "button");
  if (ns.length === 0) {
    return null;
  }
  const v0 = ns[0].background?.assetId ?? null;
  for (const n of ns) {
    if ((n.background?.assetId ?? null) !== v0) {
      return null;
    }
  }
  return v0;
}

function openButtonBgAsset(anchor: HTMLElement): void {
  assetPickerAnchorRef.value = anchor;
  const ids = selectedNodes.value.filter((n) => n.type === "button").map((n) => n.id);
  assetSessionBefore.value = snapshotNodesForIds(ids);
  assetInitialId.value = commonButtonBgAssetId();
  assetPickerOpen.value = true;
}

function commitButtonBgAsset(id: string | null): void {
  assetPickerOpen.value = false;
  if (id === assetInitialId.value) {
    assetSessionBefore.value = new Map();
    return;
  }
  const before = assetSessionBefore.value;
  assetSessionBefore.value = new Map();
  const cmds: Command[] = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "button") {
      continue;
    }
    const snap = before.get(n.id);
    if (!snap) {
      continue;
    }
    const bn = n as ButtonNode;
    cmds.push(
      new PatchNodeCommand(
        props.project,
        n.id,
        patchBackgroundAsset(id, bn),
        "按钮背景图",
        snap,
      ),
    );
  }
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else if (cmds.length > 1) {
    props.commitCommand(new CompositeCommand(cmds, "按钮背景图"));
  }
}

// —— InputField 文本色 / 占位色 ——

function openInputTextColor(anchor: HTMLElement): void {
  colorPickerAnchorRef.value = anchor;
  const ids = selectedNodes.value.filter((n) => n.type === "inputField").map((n) => n.id);
  fieldSessionBefore.value = snapshotNodesForIds(ids);
  colorEditKind.value = "inputTextColor";
  colorInitialHex.value = hexNormalize(commonInputFieldTextColor() ?? "#FFFFFF");
  colorPickerOpen.value = true;
}

function previewInputTextColor(hex: string): void {
  for (const n of selectedNodes.value) {
    if (n.type === "inputField") {
      const inp = n as InputFieldNode;
      inp.text = { ...inp.text, color: hex };
    }
  }
  props.requestRedraw?.();
}

function commitInputTextColor(hex: string): void {
  const baseline = colorInitialHex.value;
  colorPickerOpen.value = false;
  colorEditKind.value = null;
  if (hexNormalize(hex) === hexNormalize(baseline)) {
    restoreSessionNodes();
    fieldSessionBefore.value = new Map();
    props.requestRedraw?.();
    return;
  }
  const before = fieldSessionBefore.value;
  fieldSessionBefore.value = new Map();
  const cmds: Command[] = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "inputField") {
      continue;
    }
    const snap = before.get(n.id);
    if (!snap) {
      continue;
    }
    const inp = n as InputFieldNode;
    cmds.push(
      new PatchNodeCommand(
        props.project,
        n.id,
        { text: { ...inp.text, color: hex } },
        "输入框文字颜色",
        snap,
      ),
    );
  }
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else if (cmds.length > 1) {
    props.commitCommand(new CompositeCommand(cmds, "输入框文字颜色"));
  }
}

function openInputPlaceholderColor(anchor: HTMLElement): void {
  colorPickerAnchorRef.value = anchor;
  const ids = selectedNodes.value.filter((n) => n.type === "inputField").map((n) => n.id);
  fieldSessionBefore.value = snapshotNodesForIds(ids);
  colorEditKind.value = "inputPlaceholderColor";
  colorInitialHex.value = hexNormalize(commonInputFieldPlaceholderColor() ?? "#999999");
  colorPickerOpen.value = true;
}

function previewInputPlaceholderColor(hex: string): void {
  for (const n of selectedNodes.value) {
    if (n.type === "inputField") {
      const inp = n as InputFieldNode;
      inp.placeholder = { ...inp.placeholder, color: hex };
    }
  }
  props.requestRedraw?.();
}

function commitInputPlaceholderColor(hex: string): void {
  const baseline = colorInitialHex.value;
  colorPickerOpen.value = false;
  colorEditKind.value = null;
  if (hexNormalize(hex) === hexNormalize(baseline)) {
    restoreSessionNodes();
    fieldSessionBefore.value = new Map();
    props.requestRedraw?.();
    return;
  }
  const before = fieldSessionBefore.value;
  fieldSessionBefore.value = new Map();
  const cmds: Command[] = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "inputField") {
      continue;
    }
    const snap = before.get(n.id);
    if (!snap) {
      continue;
    }
    const inp = n as InputFieldNode;
    cmds.push(
      new PatchNodeCommand(
        props.project,
        n.id,
        { placeholder: { ...inp.placeholder, color: hex } },
        "占位符颜色",
        snap,
      ),
    );
  }
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else if (cmds.length > 1) {
    props.commitCommand(new CompositeCommand(cmds, "占位符颜色"));
  }
}

function commonInputBgAssetId(): string | null {
  const ns = selectedNodes.value.filter((n): n is InputFieldNode => n.type === "inputField");
  if (ns.length === 0) {
    return null;
  }
  const v0 = ns[0].background?.assetId ?? null;
  for (const n of ns) {
    if ((n.background?.assetId ?? null) !== v0) {
      return null;
    }
  }
  return v0;
}

function openInputBgAsset(anchor: HTMLElement): void {
  assetPickerAnchorRef.value = anchor;
  const ids = selectedNodes.value.filter((n) => n.type === "inputField").map((n) => n.id);
  assetSessionBefore.value = snapshotNodesForIds(ids);
  assetInitialId.value = commonInputBgAssetId();
  assetPickerOpen.value = true;
}

function commitInputBgAsset(id: string | null): void {
  assetPickerOpen.value = false;
  if (id === assetInitialId.value) {
    assetSessionBefore.value = new Map();
    return;
  }
  const before = assetSessionBefore.value;
  assetSessionBefore.value = new Map();
  const cmds: Command[] = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "inputField") {
      continue;
    }
    const snap = before.get(n.id);
    if (!snap) {
      continue;
    }
    const inp = n as InputFieldNode;
    cmds.push(
      new PatchNodeCommand(
        props.project,
        n.id,
        patchBackgroundAsset(id, inp),
        "输入框背景图",
        snap,
      ),
    );
  }
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else if (cmds.length > 1) {
    props.commitCommand(new CompositeCommand(cmds, "输入框背景图"));
  }
}

function onColorPreview(hex: string): void {
  const k = colorEditKind.value;
  if (k === "textColor") {
    previewTextColor(hex);
  } else if (k === "imageTint") {
    previewImageTint(hex);
  } else if (k === "panelBgTint") {
    previewPanelBgTint(hex);
  } else if (k === "buttonBgTint") {
    previewButtonBgTint(hex);
  } else if (k === "inputTextColor") {
    previewInputTextColor(hex);
  } else if (k === "inputPlaceholderColor") {
    previewInputPlaceholderColor(hex);
  }
}

function onColorConfirm(hex: string): void {
  const k = colorEditKind.value;
  if (k === "textColor") {
    commitTextColor(hex);
  } else if (k === "imageTint") {
    commitImageTint(hex);
  } else if (k === "panelBgTint") {
    commitPanelBgTint(hex);
  } else if (k === "buttonBgTint") {
    commitButtonBgTint(hex);
  } else if (k === "inputTextColor") {
    commitInputTextColor(hex);
  } else if (k === "inputPlaceholderColor") {
    commitInputPlaceholderColor(hex);
  }
}

function onAssetConfirm(id: string | null): void {
  /* 根据当前打开的 asset 会话：以 assetPickerOpen 为准，由调用方传入前已设好 session */
  const hasImg = selectedNodes.value.some((n) => n.type === "image");
  const hasPanel = selectedNodes.value.some((n) => n.type === "panel");
  const hasBtn = selectedNodes.value.some((n) => n.type === "button");
  const hasInp = selectedNodes.value.some((n) => n.type === "inputField");
  if (hasImg && sameType.value === "image") {
    commitImageAsset(id);
  } else if (hasPanel && sameType.value === "panel") {
    commitPanelBgAsset(id);
  } else if (hasBtn && sameType.value === "button") {
    commitButtonBgAsset(id);
  } else if (hasInp && sameType.value === "inputField") {
    commitInputBgAsset(id);
  }
}

const PIVOTS: Pivot[] = [
  "topLeft",
  "topCenter",
  "topRight",
  "centerLeft",
  "center",
  "centerRight",
  "bottomLeft",
  "bottomCenter",
  "bottomRight",
];

const TEXT_ALIGNS = ["left", "center", "right"] as const;

const idDraft = ref("");
const idError = ref(false);
const dragField = ref<string | null>(null);
const dragBeforeById = ref<Map<string, Node>>(new Map());
let dragLastClientX = 0;

const selectedNodes = computed((): Node[] => {
  const ids = [...props.selection.selectedIds.value];
  const out: Node[] = [];
  for (const id of ids) {
    const f = findNode(props.project, id);
    if (f) {
      out.push(f.node);
    }
  }
  return out;
});

const single = computed(() => selectedNodes.value.length === 1);
const multi = computed(() => selectedNodes.value.length > 1);
const none = computed(() => selectedNodes.value.length === 0);

const sameType = computed(() => {
  const ns = selectedNodes.value;
  if (ns.length === 0) {
    return null;
  }
  const t = ns[0].type;
  return ns.every((n) => n.type === t) ? t : null;
});

const textNode = computed((): TextNode | null => {
  const n = selectedNodes.value[0];
  return n?.type === "text" ? n : null;
});

const buttonNode = computed((): ButtonNode | null => {
  const n = selectedNodes.value[0];
  return n?.type === "button" ? n : null;
});

const sliderNode = computed((): SliderNode | null => {
  const n = selectedNodes.value[0];
  return n?.type === "slider" ? n : null;
});

const toggleNode = computed((): ToggleNode | null => {
  const n = selectedNodes.value[0];
  return n?.type === "toggle" ? n : null;
});

function commonNumber(key: keyof Node): number | null {
  const ns = selectedNodes.value;
  if (ns.length === 0) {
    return null;
  }
  const v0 = ns[0][key];
  if (typeof v0 !== "number") {
    return null;
  }
  for (const n of ns) {
    const v = n[key];
    if (typeof v !== "number" || v !== v0) {
      return null;
    }
  }
  return v0;
}

function commonString(key: keyof Node): string | null {
  const ns = selectedNodes.value;
  if (ns.length === 0) {
    return null;
  }
  const v0 = ns[0][key];
  if (typeof v0 !== "string") {
    return null;
  }
  for (const n of ns) {
    const v = n[key];
    if (typeof v !== "string" || v !== v0) {
      return null;
    }
  }
  return v0;
}

/** 非全体 Node 共有的字符串字段（如 color / assetId / tint） */
function commonStringLoose(key: string): string | null {
  const ns = selectedNodes.value;
  if (ns.length === 0) {
    return null;
  }
  const r = (x: Node) => (x as unknown as Record<string, unknown>)[key];
  const v0 = r(ns[0]);
  if (typeof v0 !== "string") {
    return null;
  }
  for (const n of ns) {
    const v = r(n);
    if (typeof v !== "string" || v !== v0) {
      return null;
    }
  }
  return v0;
}

function commonPivot(): Pivot | null {
  const ns = selectedNodes.value;
  if (ns.length === 0) {
    return null;
  }
  const v0 = ns[0].pivot;
  for (const n of ns) {
    if (n.pivot !== v0) {
      return null;
    }
  }
  return v0;
}

function commonOpacity(): number | null {
  return commonNumber("opacity" as keyof Node);
}

const visibleUniform = computed(() => {
  const ns = selectedNodes.value;
  if (ns.length === 0) {
    return false;
  }
  const v0 = ns[0].visible;
  return ns.every((n) => n.visible === v0);
});

watch(
  () => [...props.selection.selectedIds.value].sort().join(","),
  () => {
    idDraft.value = single.value ? (selectedNodes.value[0]?.id ?? "") : "";
    idError.value = false;
  },
  { immediate: true },
);

function pushPatches(
  patches: Array<{ id: string; patch: Record<string, unknown> }>,
  label: string,
): void {
  if (patches.length === 0) {
    return;
  }
  const cmds = patches.map(
    (p) => new PatchNodeCommand(props.project, p.id, p.patch, label),
  );
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else {
    props.commitCommand(new CompositeCommand(cmds, label));
  }
}

function commitNumericField(key: "x" | "y" | "width" | "height", value: number): void {
  const ids = selectedNodes.value.map((n) => n.id);
  const ps = ids.map((id) => ({ id, patch: { [key]: value } as Record<string, unknown> }));
  pushPatches(ps, key.toUpperCase());
}

function commitOpacity(value: number): void {
  const v = Math.min(1, Math.max(0, value));
  const ids = selectedNodes.value.map((n) => n.id);
  pushPatches(
    ids.map((id) => ({ id, patch: { opacity: v } })),
    "opacity",
  );
}

function commitPivot(value: Pivot): void {
  const ids = selectedNodes.value.map((n) => n.id);
  pushPatches(ids.map((id) => ({ id, patch: { pivot: value } })), "pivot");
}

function commitVisible(value: boolean): void {
  const ids = selectedNodes.value.map((n) => n.id);
  pushPatches(ids.map((id) => ({ id, patch: { visible: value } })), "visible");
}

function commitName(value: string): void {
  const ids = selectedNodes.value.map((n) => n.id);
  pushPatches(ids.map((id) => ({ id, patch: { name: value } })), "name");
}

function onIdBlur(): void {
  if (!single.value) {
    return;
  }
  const raw = idDraft.value.trim();
  const node = selectedNodes.value[0];
  if (!node || raw === node.id) {
    idError.value = !isValidNodeIdFormat(raw);
    return;
  }
  if (!isValidNodeIdFormat(raw)) {
    idError.value = true;
    return;
  }
  if (!isNodeIdAvailable(props.project, raw, new Set([node.id]))) {
    idError.value = true;
    return;
  }
  idError.value = false;
  props.commitCommand(
    new PatchNodeCommand(props.project, node.id, { id: raw }, "重命名 id", structuredClone(node)),
  );
}

function onNumberKeydown(
  e: KeyboardEvent,
  key: "x" | "y" | "width" | "height",
  current: number | null,
): void {
  if (current === null || e.key === "Tab") {
    return;
  }
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dir = e.key === "ArrowUp" ? 1 : -1;
    commitNumericField(key, current + dir * step);
  }
}

function onOpacityKeydown(e: KeyboardEvent, current: number | null): void {
  if (current === null) {
    return;
  }
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) * 0.01;
    const dir = e.key === "ArrowUp" ? 1 : -1;
    commitOpacity(current + dir * step);
  }
}

function startDrag(
  field: "x" | "y" | "width" | "height",
  e: MouseEvent,
): void {
  if (none.value || commonNumber(field) === null) {
    return;
  }
  e.preventDefault();
  dragField.value = field;
  dragLastClientX = e.clientX;
  const m = new Map<string, Node>();
  for (const n of selectedNodes.value) {
    m.set(n.id, structuredClone(n));
  }
  dragBeforeById.value = m;
  document.body.style.cursor = "ew-resize";
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragUp, { once: true });
}

function onDragMove(e: PointerEvent): void {
  const field = dragField.value as "x" | "y" | "width" | "height" | null;
  if (!field) {
    return;
  }
  const dx = e.clientX - dragLastClientX;
  dragLastClientX = e.clientX;
  const mult = e.shiftKey ? 10 : 1;
  const delta = dx * mult;
  for (const n of selectedNodes.value) {
    const v = n[field] as number;
    (n as unknown as Record<string, number>)[field] = v + delta;
  }
  props.requestRedraw?.();
}

function onDragUp(): void {
  const field = dragField.value as "x" | "y" | "width" | "height" | null;
  document.body.style.cursor = "";
  window.removeEventListener("pointermove", onDragMove);
  dragField.value = null;
  if (!field) {
    return;
  }
  const before = dragBeforeById.value;
  const cmds: Command[] = [];
  for (const n of selectedNodes.value) {
    const snap = before.get(n.id);
    if (!snap) {
      continue;
    }
    const val = (n as unknown as Record<string, number>)[field];
    cmds.push(
      new PatchNodeCommand(
        props.project,
        n.id,
        { [field]: val },
        `拖拽 ${field.toUpperCase()}`,
        snap,
      ),
    );
  }
  dragBeforeById.value = new Map();
  if (cmds.length === 0) {
    return;
  }
  if (cmds.length === 1) {
    props.commitCommand(cmds[0]);
  } else {
    props.commitCommand(new CompositeCommand(cmds, `拖拽 ${field.toUpperCase()}`));
  }
}

onUnmounted(() => {
  window.removeEventListener("pointermove", onDragMove);
  document.body.style.cursor = "";
});

// —— 控件特有 ——

function commitTextContent(value: string): void {
  const ids = selectedNodes.value.filter((n) => n.type === "text").map((n) => n.id);
  pushPatches(ids.map((id) => ({ id, patch: { content: value } })), "文本");
}

function commitTextFontSize(value: number): void {
  const ids = selectedNodes.value.filter((n) => n.type === "text").map((n) => n.id);
  pushPatches(ids.map((id) => ({ id, patch: { fontSize: value } })), "字号");
}

function commitTextAlign(value: (typeof TEXT_ALIGNS)[number]): void {
  const ids = selectedNodes.value.filter((n) => n.type === "text").map((n) => n.id);
  pushPatches(ids.map((id) => ({ id, patch: { textAlign: value } })), "对齐");
}

function commitButtonLabel(value: string): void {
  const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "button") {
      continue;
    }
    patches.push({
      id: n.id,
      patch: { label: { ...n.label, content: value } },
    });
  }
  pushPatches(patches, "按钮文字");
}

function commitButtonLabelFontSize(value: number): void {
  const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "button") {
      continue;
    }
    patches.push({
      id: n.id,
      patch: { label: { ...n.label, fontSize: value } },
    });
  }
  pushPatches(patches, "按钮字号");
}

function commitSliderDefault(v: number): void {
  const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "slider") {
      continue;
    }
    patches.push({ id: n.id, patch: { defaultValue: v } });
  }
  pushPatches(patches, "Slider 默认值");
}

function commitToggleDefault(v: boolean): void {
  const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
  for (const n of selectedNodes.value) {
    if (n.type !== "toggle") {
      continue;
    }
    patches.push({ id: n.id, patch: { defaultOn: v } });
  }
  pushPatches(patches, "Toggle 默认");
}

const pickerCurrentAssetId = computed((): string | null => {
  const st = sameType.value;
  if (st === "image") {
    const c = commonStringLoose("assetId");
    return typeof c === "string" ? c : null;
  }
  if (st === "panel") {
    return commonPanelBgAssetId();
  }
  if (st === "button") {
    return commonButtonBgAssetId();
  }
  if (st === "inputField") {
    return commonInputBgAssetId();
  }
  return null;
});
</script>

<template>
  <div class="properties">
    <p v-if="none" class="properties__empty">未选中节点</p>

    <template v-else>
      <section class="properties__sec">
        <h3 class="properties__h">基础</h3>
        <label v-if="single" class="properties__row">
          <span
            class="properties__label"
            title="字母或下划线开头，仅字母数字下划线"
          >
            id
          </span>
          <input
            v-model="idDraft"
            class="properties__input"
            :class="{ 'properties__input--err': idError }"
            type="text"
            spellcheck="false"
            autocomplete="off"
            :title="idError ? '非法 id 或与现有 id 冲突' : ''"
            @blur="onIdBlur"
          />
        </label>
        <div v-else class="properties__row">
          <span class="properties__label">id</span>
          <span class="properties__mixed">—</span>
        </div>

        <label class="properties__row">
          <span class="properties__label">名称</span>
          <input
            class="properties__input"
            type="text"
            :value="commonString('name') ?? ''"
            :placeholder="multi ? '—' : ''"
            @change="
              (e) =>
                commitName((e.target as HTMLInputElement).value)
            "
          />
        </label>
      </section>

      <section class="properties__sec">
        <h3 class="properties__h">变换</h3>

        <label
          v-for="key in (['x', 'y', 'width', 'height'] as const)"
          :key="key"
          class="properties__row"
        >
          <span
            class="properties__label properties__label--drag"
            @mousedown="startDrag(key, $event)"
          >
            {{ key === 'width' ? 'W' : key === 'height' ? 'H' : key.toUpperCase() }}:
          </span>
          <input
            class="properties__input properties__input--num"
            type="number"
            :value="commonNumber(key) ?? ''"
            :placeholder="commonNumber(key) === null && !none ? '—' : ''"
            step="1"
            @keydown="onNumberKeydown($event, key, commonNumber(key))"
            @change="
              (e) =>
                commitNumericField(key, Number((e.target as HTMLInputElement).value))
            "
          />
        </label>

        <label class="properties__row">
          <span class="properties__label">Pivot</span>
          <select
            class="properties__input"
            :value="commonPivot() ?? ''"
            :disabled="commonPivot() === null"
            @change="
              (e) =>
                commitPivot((e.target as HTMLSelectElement).value as Pivot)
            "
          >
            <option v-if="commonPivot() === null" value="">—</option>
            <option v-for="p in PIVOTS" :key="p" :value="p">{{ p }}</option>
          </select>
        </label>
      </section>

      <section class="properties__sec">
        <h3 class="properties__h">外观</h3>
        <label v-if="visibleUniform" class="properties__row properties__row--check">
          <span class="properties__label">可见</span>
          <input
            type="checkbox"
            :checked="selectedNodes[0]!.visible"
            @change="
              (e) =>
                commitVisible((e.target as HTMLInputElement).checked)
            "
          />
        </label>
        <div v-else class="properties__row">
          <span class="properties__label">可见</span>
          <span class="properties__mixed">—</span>
        </div>

        <label class="properties__row">
          <span class="properties__label">opacity</span>
          <input
            class="properties__input properties__input--num"
            type="number"
            min="0"
            max="1"
            step="0.01"
            :value="commonOpacity() ?? ''"
            :placeholder="commonOpacity() === null && !none ? '—' : ''"
            @keydown="onOpacityKeydown($event, commonOpacity())"
            @change="
              (e) =>
                commitOpacity(Number((e.target as HTMLInputElement).value))
            "
          />
        </label>
      </section>

      <section v-if="sameType === 'text'" class="properties__sec">
        <h3 class="properties__h">文本</h3>
        <label class="properties__row properties__row--block">
          <span class="properties__label">content</span>
          <textarea
            class="properties__textarea"
            rows="2"
            :value="textNode?.content ?? ''"
            @change="
              (e) =>
                commitTextContent((e.target as HTMLTextAreaElement).value)
            "
          />
        </label>
        <label class="properties__row">
          <span class="properties__label">fontSize</span>
          <input
            class="properties__input properties__input--num"
            type="number"
            :value="textNode?.fontSize ?? ''"
            @change="
              (e) =>
                commitTextFontSize(Number((e.target as HTMLInputElement).value))
            "
          />
        </label>
        <label class="properties__row">
          <span class="properties__label">textAlign</span>
          <select
            class="properties__input"
            :value="textNode?.textAlign ?? ''"
            @change="
              (e) =>
                commitTextAlign(
                  (e.target as HTMLSelectElement).value as (typeof TEXT_ALIGNS)[number],
                )
            "
          >
            <option v-for="a in TEXT_ALIGNS" :key="a" :value="a">{{ a }}</option>
          </select>
        </label>
        <div class="properties__row properties__row--color">
          <span class="properties__label">color</span>
          <button
            type="button"
            class="properties__swatch"
            :style="{
              background: hexNormalize(commonStringLoose('color') ?? '#CCCCCC'),
            }"
            :disabled="commonStringLoose('color') === null"
            title="选择颜色"
            @click="(e) => openTextColor(e.currentTarget as HTMLElement)"
          />
        </div>
      </section>

      <section v-if="sameType === 'button'" class="properties__sec">
        <h3 class="properties__h">按钮</h3>
        <label class="properties__row">
          <span class="properties__label">label</span>
          <input
            class="properties__input"
            type="text"
            :value="buttonNode?.label.content ?? ''"
            @change="
              (e) =>
                commitButtonLabel((e.target as HTMLInputElement).value)
            "
          />
        </label>
        <label class="properties__row">
          <span class="properties__label">label.fontSize</span>
          <input
            class="properties__input properties__input--num"
            type="number"
            :value="buttonNode?.label.fontSize ?? ''"
            @change="
              (e) =>
                commitButtonLabelFontSize(Number((e.target as HTMLInputElement).value))
            "
          />
        </label>
        <div class="properties__row">
          <span class="properties__label">background</span>
          <button
            type="button"
            class="properties__asset-btn"
            @click="(e) => openButtonBgAsset(e.currentTarget as HTMLElement)"
          >
            {{ commonButtonBgAssetId() ?? "无" }}
          </button>
        </div>
        <div class="properties__row properties__row--color">
          <span class="properties__label">bg.tint</span>
          <button
            type="button"
            class="properties__swatch"
            :style="{
              background: hexNormalize(
                buttonNode?.background?.tint ?? '#FFFFFF',
              ),
            }"
            title="背景着色"
            @click="(e) => openButtonBgTint(e.currentTarget as HTMLElement)"
          />
        </div>
      </section>

      <section v-if="sameType === 'image'" class="properties__sec">
        <h3 class="properties__h">图片</h3>
        <div class="properties__row">
          <span class="properties__label">assetId</span>
          <button
            type="button"
            class="properties__asset-btn"
            @click="(e) => openImageAsset(e.currentTarget as HTMLElement)"
          >
            {{ commonStringLoose('assetId') ?? "—" }}
          </button>
        </div>
        <div class="properties__row properties__row--color">
          <span class="properties__label">tint</span>
          <button
            type="button"
            class="properties__swatch"
            :style="{
              background: hexNormalize(commonStringLoose('tint') ?? '#FFFFFF'),
            }"
            :disabled="commonStringLoose('tint') === null"
            title="着色"
            @click="(e) => openImageTint(e.currentTarget as HTMLElement)"
          />
        </div>
      </section>

      <section v-if="sameType === 'panel'" class="properties__sec">
        <h3 class="properties__h">面板</h3>
        <div class="properties__row">
          <span class="properties__label">assetId</span>
          <button
            type="button"
            class="properties__asset-btn"
            @click="(e) => openPanelBgAsset(e.currentTarget as HTMLElement)"
          >
            {{ commonPanelBgAssetId() ?? "—" }}
          </button>
        </div>
        <div class="properties__row properties__row--color">
          <span class="properties__label">tint</span>
          <button
            type="button"
            class="properties__swatch"
            :style="{
              background: hexNormalize(
                selectedNodes[0]?.type === 'panel'
                  ? (selectedNodes[0] as PanelNode).background?.tint ?? '#FFFFFF'
                  : '#FFFFFF',
              ),
            }"
            title="背景着色"
            @click="(e) => openPanelBgTint(e.currentTarget as HTMLElement)"
          />
        </div>
      </section>

      <section v-if="sameType === 'slider'" class="properties__sec">
        <h3 class="properties__h">Slider</h3>
        <label class="properties__row">
          <span class="properties__label">defaultValue</span>
          <input
            class="properties__input properties__input--num"
            type="number"
            step="0.01"
            :value="sliderNode?.defaultValue ?? ''"
            @change="
              (e) =>
                commitSliderDefault(Number((e.target as HTMLInputElement).value))
            "
          />
        </label>
      </section>

      <section v-if="sameType === 'toggle'" class="properties__sec">
        <h3 class="properties__h">Toggle</h3>
        <label class="properties__row properties__row--check">
          <span class="properties__label">defaultOn</span>
          <input
            type="checkbox"
            :checked="toggleNode?.defaultOn ?? false"
            @change="
              (e) =>
                commitToggleDefault((e.target as HTMLInputElement).checked)
            "
          />
        </label>
      </section>

      <section v-if="sameType === 'inputField'" class="properties__sec">
        <h3 class="properties__h">输入框</h3>
        <div class="properties__row">
          <span class="properties__label">背景图</span>
          <button
            type="button"
            class="properties__asset-btn"
            @click="(e) => openInputBgAsset(e.currentTarget as HTMLElement)"
          >
            {{ commonInputBgAssetId() ?? "—" }}
          </button>
        </div>
        <div class="properties__row properties__row--color">
          <span class="properties__label">text.color</span>
          <button
            type="button"
            class="properties__swatch"
            :style="{
              background: hexNormalize(commonInputFieldTextColor() ?? '#FFFFFF'),
            }"
            :disabled="commonInputFieldTextColor() === null"
            title="文字颜色"
            @click="(e) => openInputTextColor(e.currentTarget as HTMLElement)"
          />
        </div>
        <div class="properties__row properties__row--color">
          <span class="properties__label">placeholder</span>
          <button
            type="button"
            class="properties__swatch"
            :style="{
              background: hexNormalize(
                commonInputFieldPlaceholderColor() ?? '#999999',
              ),
            }"
            :disabled="commonInputFieldPlaceholderColor() === null"
            title="占位符颜色"
            @click="(e) => openInputPlaceholderColor(e.currentTarget as HTMLElement)"
          />
        </div>
      </section>

      <ColorPicker
        v-model:open="colorPickerOpen"
        hide-trigger
        :anchor-target="colorPickerAnchorRef"
        :initial-color="colorInitialHex"
        @preview="onColorPreview"
        @confirm="onColorConfirm"
        @cancel="cancelColorPicker"
      />
      <AssetPicker
        v-model:open="assetPickerOpen"
        hide-trigger
        :anchor-target="assetPickerAnchorRef"
        :project="project"
        :project-dir="projectDir"
        :current-asset-id="pickerCurrentAssetId"
        @confirm="onAssetConfirm"
        @cancel="cancelAssetPicker"
      />
    </template>
  </div>
</template>

<style scoped>
.properties {
  font-size: 0.75rem;
  color: #18181b;
  min-height: 0;
  overflow: auto;
  padding: 0.35rem 0.5rem 0.75rem;
}

.properties__empty {
  margin: 0;
  color: #71717a;
  font-size: 0.8rem;
}

.properties__sec {
  margin-bottom: 0.75rem;
}

.properties__h {
  margin: 0 0 0.35rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #71717a;
}

.properties__row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.35rem;
}

.properties__row--block {
  flex-direction: column;
  align-items: stretch;
}

.properties__row--check {
  gap: 0.5rem;
}

.properties__label {
  flex: none;
  width: 72px;
  color: #52525b;
  overflow: hidden;
  text-overflow: ellipsis;
}

.properties__label--drag {
  cursor: ew-resize;
  user-select: none;
}

.properties__input {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 0.15rem 0.35rem;
  border: 1px solid #d4d4d8;
  border-radius: 3px;
}

.properties__input--num {
  max-width: 120px;
}

.properties__input--err {
  border-color: #dc2626;
  background: #fef2f2;
}

.properties__textarea {
  width: 100%;
  font: inherit;
  padding: 0.25rem 0.35rem;
  border: 1px solid #d4d4d8;
  border-radius: 3px;
  resize: vertical;
}

.properties__mixed,
.properties__hint {
  color: #a1a1aa;
  font-size: 0.7rem;
}

.properties__row--color {
  align-items: center;
}

.properties__swatch {
  width: 28px;
  height: 22px;
  padding: 0;
  border: 1px solid #d4d4d8;
  border-radius: 3px;
  cursor: pointer;
  flex: none;
}

.properties__swatch:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.properties__asset-btn {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.15rem 0.35rem;
  border: 1px solid #d4d4d8;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
