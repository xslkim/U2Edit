<script setup lang="ts">
import {
  computed,
  nextTick,
  onUnmounted,
  ref,
  watch,
} from "vue";
import {
  clamp01,
  parseHexColor,
  rgbToHsv,
  rgbaFromHsv,
  rgbaToHex,
  type RGBA,
} from "./colorFormat";

const props = withDefaults(
  defineProps<{
    /** v-model:open */
    open: boolean;
    /** 打开时的初始颜色（含 #RRGGBB / #RRGGBBAA） */
    initialColor: string;
    disabled?: boolean;
    /** 为 true 时不渲染内置色块，由父级提供 anchorTarget 定位 */
    hideTrigger?: boolean;
    /** 与 hideTrigger 联用：行内按钮（父级模板会自动解包 ref） */
    anchorTarget?: HTMLElement | null;
  }>(),
  { disabled: false, hideTrigger: false },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  preview: [hex: string];
  confirm: [hex: string];
  cancel: [];
}>();

const anchorRef = ref<HTMLButtonElement | null>(null);
const popoverRef = ref<HTMLDivElement | null>(null);
const svRef = ref<HTMLDivElement | null>(null);
const hueRef = ref<HTMLDivElement | null>(null);
const alphaRef = ref<HTMLDivElement | null>(null);

const h = ref(0);
const s = ref(1);
const v = ref(1);
const alpha = ref(1);
const hexInput = ref("");
const hexInvalid = ref(false);

const popoverStyle = ref<Record<string, string>>({});

const svBackground = computed(() => {
  const pure = rgbaFromHsv(h.value, 1, 1, 1);
  const hex = rgbaToHex({ ...pure, a: 1 });
  return hex;
});

const displayHex = computed(() => rgbaToHex(currentRgba()));

function currentRgba(): RGBA {
  return rgbaFromHsv(h.value, s.value, v.value, alpha.value);
}

function syncFromInitial(): void {
  const p = parseHexColor(props.initialColor) ?? parseHexColor("#FFFFFF")!;
  const { h: hh, s: ss, v: vv } = rgbToHsv(p.r, p.g, p.b);
  h.value = hh;
  s.value = ss;
  v.value = vv;
  alpha.value = p.a;
  hexInput.value = rgbaToHex({ r: p.r, g: p.g, b: p.b, a: p.a });
  hexInvalid.value = false;
}

function emitPreview(): void {
  emit("preview", rgbaToHex(currentRgba()));
}

function anchorElement(): HTMLElement | null {
  return props.anchorTarget ?? anchorRef.value;
}

function updatePopoverPosition(): void {
  const el = anchorElement();
  if (!el) {
    return;
  }
  const r = el.getBoundingClientRect();
  const top = Math.min(r.bottom + 6, window.innerHeight - 320);
  const left = Math.min(r.left, window.innerWidth - 260);
  popoverStyle.value = {
    position: "fixed",
    top: `${Math.max(8, top)}px`,
    left: `${Math.max(8, left)}px`,
    zIndex: "10050",
  };
}

let offOutside: (() => void) | null = null;
let offEsc: (() => void) | null = null;
let offResize: (() => void) | null = null;

function teardownListeners(): void {
  offOutside?.();
  offOutside = null;
  offEsc?.();
  offEsc = null;
  offResize?.();
  offResize = null;
}

function isInside(el: HTMLElement | null, target: EventTarget | null): boolean {
  if (!el || !target || !(target instanceof Node)) {
    return false;
  }
  return el.contains(target);
}

function onDocumentPointerDown(ev: PointerEvent): void {
  if (!props.open) {
    return;
  }
  const t = ev.target;
  if (
    isInside(popoverRef.value, t) ||
    isInside(anchorRef.value, t) ||
    isInside(props.anchorTarget ?? null, t)
  ) {
    return;
  }
  const hex = rgbaToHex(currentRgba());
  emit("update:open", false);
  teardownListeners();
  emit("confirm", hex);
}

function onDocumentKeyDown(ev: KeyboardEvent): void {
  if (!props.open || ev.key !== "Escape") {
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();
  emit("update:open", false);
  teardownListeners();
  emit("cancel");
}

function onWindowResize(): void {
  if (props.open) {
    updatePopoverPosition();
  }
}

watch(
  () => props.open,
  async (v) => {
    if (v) {
      syncFromInitial();
      await nextTick();
      updatePopoverPosition();
      offOutside = () =>
        document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      document.addEventListener("pointerdown", onDocumentPointerDown, true);
      offEsc = () => document.removeEventListener("keydown", onDocumentKeyDown, true);
      document.addEventListener("keydown", onDocumentKeyDown, true);
      window.addEventListener("resize", onWindowResize);
      offResize = () => window.removeEventListener("resize", onWindowResize);
    } else {
      teardownListeners();
    }
  },
);

watch(
  () => [h.value, s.value, v.value, alpha.value],
  () => {
    if (!props.open) {
      return;
    }
    hexInput.value = rgbaToHex(currentRgba());
    hexInvalid.value = false;
    emitPreview();
  },
);

function toggleOpen(): void {
  if (props.disabled) {
    return;
  }
  emit("update:open", !props.open);
}

watch(
  () => props.anchorTarget,
  () => {
    if (props.open) {
      void nextTick(() => updatePopoverPosition());
    }
  },
);

function onSvPointer(ev: PointerEvent): void {
  const el = svRef.value;
  if (!el) {
    return;
  }
  const r = el.getBoundingClientRect();
  const x = clamp01((ev.clientX - r.left) / r.width);
  const y = clamp01((ev.clientY - r.top) / r.height);
  s.value = x;
  v.value = 1 - y;
}

function onHuePointer(ev: PointerEvent): void {
  const el = hueRef.value;
  if (!el) {
    return;
  }
  const r = el.getBoundingClientRect();
  const x = clamp01((ev.clientX - r.left) / r.width);
  h.value = x * 360;
}

function onAlphaPointer(ev: PointerEvent): void {
  const el = alphaRef.value;
  if (!el) {
    return;
  }
  const r = el.getBoundingClientRect();
  const x = clamp01((ev.clientX - r.left) / r.width);
  alpha.value = x;
}

let dragKind: "sv" | "hue" | "alpha" | null = null;

function startSvDrag(e: PointerEvent): void {
  e.preventDefault();
  dragKind = "sv";
  onSvPointer(e);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", endDrag, { once: true });
}

function startHueDrag(e: PointerEvent): void {
  e.preventDefault();
  dragKind = "hue";
  onHuePointer(e);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", endDrag, { once: true });
}

function startAlphaDrag(e: PointerEvent): void {
  e.preventDefault();
  dragKind = "alpha";
  onAlphaPointer(e);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", endDrag, { once: true });
}

function onDragMove(e: PointerEvent): void {
  if (dragKind === "sv") {
    onSvPointer(e);
  } else if (dragKind === "hue") {
    onHuePointer(e);
  } else if (dragKind === "alpha") {
    onAlphaPointer(e);
  }
}

function endDrag(): void {
  dragKind = null;
  window.removeEventListener("pointermove", onDragMove);
}

function onHexInput(ev: Event): void {
  const raw = (ev.target as HTMLInputElement).value;
  hexInput.value = raw;
  const p = parseHexColor(raw);
  if (!p) {
    hexInvalid.value = true;
    return;
  }
  hexInvalid.value = false;
  const { h: hh, s: ss, v: vv } = rgbToHsv(p.r, p.g, p.b);
  h.value = hh;
  s.value = ss;
  v.value = vv;
  alpha.value = p.a;
  emitPreview();
}

function onConfirm(): void {
  const hex = rgbaToHex(currentRgba());
  emit("update:open", false);
  teardownListeners();
  emit("confirm", hex);
}

function onCancel(): void {
  emit("update:open", false);
  teardownListeners();
  emit("cancel");
}

onUnmounted(() => {
  teardownListeners();
  window.removeEventListener("pointermove", onDragMove);
});
</script>

<template>
  <div class="color-picker">
    <button
      v-if="!hideTrigger"
      ref="anchorRef"
      type="button"
      class="color-picker__swatch"
      :disabled="disabled"
      :title="disabled ? '' : '选择颜色'"
      @click="toggleOpen"
    >
      <span
        class="color-picker__fill"
        :style="{ background: displayHex }"
      />
    </button>
    <Teleport to="body">
      <div
        v-show="open"
        ref="popoverRef"
        class="color-picker__popover"
        :style="popoverStyle"
        @pointerdown.stop
      >
        <div
          ref="svRef"
          class="color-picker__sv"
          :style="{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${svBackground})`,
          }"
          @pointerdown="startSvDrag"
        />
        <div
          ref="hueRef"
          class="color-picker__bar color-picker__bar--hue"
          @pointerdown="startHueDrag"
        />
        <div
          ref="alphaRef"
          class="color-picker__bar color-picker__bar--alpha"
          :style="{
            background: `linear-gradient(to right, transparent, ${rgbaToHex({ ...rgbaFromHsv(h, s, v, 1), a: 1 })})`,
          }"
          @pointerdown="startAlphaDrag"
        />
        <label class="color-picker__hex-row">
          <span class="color-picker__hex-label">#</span>
          <input
            v-model="hexInput"
            class="color-picker__hex"
            :class="{ 'color-picker__hex--err': hexInvalid }"
            type="text"
            spellcheck="false"
            autocomplete="off"
            @input="onHexInput"
          />
        </label>
        <div class="color-picker__actions">
          <button type="button" class="color-picker__btn" @click="onCancel">
            取消
          </button>
          <button type="button" class="color-picker__btn color-picker__btn--primary" @click="onConfirm">
            确认
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.color-picker {
  display: inline-flex;
  align-items: center;
}

.color-picker__swatch {
  width: 28px;
  height: 22px;
  padding: 0;
  border: 1px solid #d4d4d8;
  border-radius: 3px;
  cursor: pointer;
  background: #fff;
}

.color-picker__swatch:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.color-picker__fill {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 2px;
}

.color-picker__popover {
  width: 220px;
  padding: 10px;
  background: #fafafa;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.color-picker__sv {
  width: 100%;
  height: 120px;
  border-radius: 4px;
  cursor: crosshair;
  touch-action: none;
}

.color-picker__bar {
  height: 14px;
  margin-top: 8px;
  border-radius: 4px;
  cursor: pointer;
  touch-action: none;
}

.color-picker__bar--hue {
  background: linear-gradient(
    to right,
    #f00,
    #ff0,
    #0f0,
    #0ff,
    #00f,
    #f0f,
    #f00
  );
}

.color-picker__bar--alpha {
  background-color: #e4e4e7;
  background-size: 8px 8px;
  background-image: linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
}

.color-picker__hex-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 0.75rem;
}

.color-picker__hex-label {
  color: #71717a;
}

.color-picker__hex {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 0.15rem 0.35rem;
  border: 1px solid #d4d4d8;
  border-radius: 3px;
}

.color-picker__hex--err {
  border-color: #dc2626;
  background: #fef2f2;
}

.color-picker__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}

.color-picker__btn {
  font: inherit;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border: 1px solid #d4d4d8;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
}

.color-picker__btn--primary {
  background: #18181b;
  color: #fff;
  border-color: #18181b;
}
</style>
