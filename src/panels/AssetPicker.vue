<script setup lang="ts">
import { readFile } from "@tauri-apps/plugin-fs";
import {
  computed,
  nextTick,
  onUnmounted,
  ref,
  watch,
  withDefaults,
} from "vue";
import { resolveAssetAbsolute } from "../core/assetPath";
import type { Project } from "../core/schema";

const props = withDefaults(
  defineProps<{
    open: boolean;
    project: Project;
    projectDir: string | null;
    currentAssetId: string | null;
    hideTrigger?: boolean;
    anchorTarget?: HTMLElement | null;
  }>(),
  { hideTrigger: false },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [assetId: string | null];
  cancel: [];
}>();

const anchorRef = ref<HTMLButtonElement | null>(null);
const popoverRef = ref<HTMLDivElement | null>(null);
const searchQuery = ref("");
/** assetId → blob: URL */
const thumbUrlById = ref<Map<string, string>>(new Map());

const filteredAssets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  let list = props.project.assets;
  if (q) {
    list = list.filter(
      (a) => a.id.toLowerCase().includes(q) || a.path.toLowerCase().includes(q),
    );
  }
  return list;
});

const popoverStyle = ref<Record<string, string>>({});

let snapshotAtOpen: string | null = null;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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
  const top = Math.min(r.bottom + 6, window.innerHeight - 280);
  const left = Math.min(r.left, window.innerWidth - 300);
  popoverStyle.value = {
    position: "fixed",
    top: `${Math.max(8, top)}px`,
    left: `${Math.max(8, left)}px`,
    zIndex: "10050",
  };
}

function revokeAllThumbs(): void {
  for (const u of thumbUrlById.value.values()) {
    URL.revokeObjectURL(u);
  }
  thumbUrlById.value = new Map();
}

async function loadThumbnails(): Promise<void> {
  revokeAllThumbs();
  if (!props.projectDir || !isTauri()) {
    return;
  }
  const map = new Map<string, string>();
  for (const a of props.project.assets) {
    const abs = resolveAssetAbsolute(props.project, props.projectDir, a.id);
    if (!abs) {
      continue;
    }
    try {
      const buf = await readFile(abs);
      const blob = new Blob([buf as BlobPart]);
      const url = URL.createObjectURL(blob);
      map.set(a.id, url);
    } catch {
      /* 略过无法读取的项 */
    }
  }
  thumbUrlById.value = map;
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
  emit("update:open", false);
  teardownListeners();
  emit("confirm", snapshotAtOpen);
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
      snapshotAtOpen = props.currentAssetId;
      searchQuery.value = "";
      await nextTick();
      updatePopoverPosition();
      await loadThumbnails();
      document.addEventListener("pointerdown", onDocumentPointerDown, true);
      offOutside = () =>
        document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      document.addEventListener("keydown", onDocumentKeyDown, true);
      offEsc = () => document.removeEventListener("keydown", onDocumentKeyDown, true);
      window.addEventListener("resize", onWindowResize);
      offResize = () => window.removeEventListener("resize", onWindowResize);
    } else {
      teardownListeners();
      revokeAllThumbs();
    }
  },
);

function toggleOpen(): void {
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

function pickAsset(id: string): void {
  emit("update:open", false);
  teardownListeners();
  emit("confirm", id);
}

function onClear(): void {
  emit("update:open", false);
  teardownListeners();
  emit("confirm", null);
}

onUnmounted(() => {
  teardownListeners();
  revokeAllThumbs();
});

const labelPreview = computed(() => {
  const id = props.currentAssetId;
  if (!id) {
    return "无";
  }
  const hit = props.project.assets.find((a) => a.id === id);
  return hit ? hit.id : id;
});
</script>

<template>
  <div class="asset-picker">
    <button
      v-if="!hideTrigger"
      ref="anchorRef"
      type="button"
      class="asset-picker__trigger"
      :title="'选择资源'"
      @click="toggleOpen"
    >
      <span class="asset-picker__trigger-text">{{ labelPreview }}</span>
    </button>
    <Teleport to="body">
      <div
        v-show="open"
        ref="popoverRef"
        class="asset-picker__popover"
        :style="popoverStyle"
        @pointerdown.stop
      >
        <input
          v-model="searchQuery"
          class="asset-picker__search"
          type="search"
          placeholder="搜索 id 或路径…"
          spellcheck="false"
          autocomplete="off"
        />
        <div class="asset-picker__grid">
          <button
            v-for="a in filteredAssets"
            :key="a.id"
            type="button"
            class="asset-picker__cell"
            :class="{ 'asset-picker__cell--current': a.id === currentAssetId }"
            @click="pickAsset(a.id)"
          >
            <img
              v-if="thumbUrlById.get(a.id)"
              class="asset-picker__thumb"
              :src="thumbUrlById.get(a.id)"
              :alt="a.id"
            />
            <div v-else class="asset-picker__thumb asset-picker__thumb--empty">
              ?
            </div>
            <span class="asset-picker__id">{{ a.id }}</span>
          </button>
          <p v-if="filteredAssets.length === 0" class="asset-picker__empty">
            无匹配资源
          </p>
        </div>
        <div class="asset-picker__footer">
          <button type="button" class="asset-picker__btn" @click="onClear">
            清除
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.asset-picker {
  display: inline-flex;
  align-items: center;
}

.asset-picker__trigger {
  max-width: 160px;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.15rem 0.35rem;
  border: 1px solid #d4d4d8;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}

.asset-picker__trigger-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-picker__popover {
  width: 280px;
  max-height: min(360px, 70vh);
  padding: 8px;
  background: #fafafa;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.asset-picker__search {
  width: 100%;
  font: inherit;
  font-size: 0.75rem;
  padding: 0.2rem 0.35rem;
  border: 1px solid #d4d4d8;
  border-radius: 3px;
}

.asset-picker__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  overflow: auto;
  max-height: 240px;
}

.asset-picker__cell {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  padding: 4px;
  border: 1px solid #e4e4e7;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 0.65rem;
}

.asset-picker__cell--current {
  border-color: #18181b;
  box-shadow: 0 0 0 1px #18181b;
}

.asset-picker__thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 2px;
  background: #f4f4f5;
}

.asset-picker__thumb--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a1a1aa;
  font-size: 1rem;
}

.asset-picker__id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #52525b;
}

.asset-picker__empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: 0.5rem;
  text-align: center;
  color: #a1a1aa;
  font-size: 0.75rem;
}

.asset-picker__footer {
  display: flex;
  justify-content: flex-end;
}

.asset-picker__btn {
  font: inherit;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border: 1px solid #d4d4d8;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
}
</style>
