<script setup lang="ts">
import { readFile } from "@tauri-apps/plugin-fs";
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { Project } from "../core/schema";
import { mountProjectCanvas, type CanvasViewState } from "./renderer";
import type { SelectionStore } from "./selection";

const props = withDefaults(
  defineProps<{
    project: Project;
    projectDir: string;
    selection: SelectionStore;
    isNodeLocked?: (id: string) => boolean;
  }>(),
  {
    isNodeLocked: () => false,
  },
);

const emit = defineEmits<{
  viewChange: [state: CanvasViewState];
}>();

let api: ReturnType<typeof mountProjectCanvas> | null = null;
const hostRef = ref<HTMLDivElement | null>(null);

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function loadImageFromDisk(absolutePath: string): Promise<HTMLImageElement | null> {
  if (!isTauri()) {
    return null;
  }
  try {
    const buf = await readFile(absolutePath);
    const blob = new Blob([buf as BlobPart]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load"));
      img.src = url;
    });
    URL.revokeObjectURL(url);
    return img;
  } catch {
    return null;
  }
}

function mount(): void {
  api?.destroy();
  api = null;
  const el = hostRef.value;
  if (!el) {
    return;
  }
  api = mountProjectCanvas({
    container: el,
    project: props.project,
    projectDir: props.projectDir,
    loadImage: loadImageFromDisk,
    onViewChange: (state) => emit("viewChange", state),
    selection: props.selection,
    isNodeLocked: props.isNodeLocked,
  });
  void api.redraw();
}

function ensureNodeVisible(nodeId: string): void {
  api?.ensureNodeVisible(nodeId);
}

function rebuildScene(): void {
  api?.rebuildScene();
}

defineExpose({
  ensureNodeVisible,
  rebuildScene,
});

onMounted(async () => {
  await nextTick();
  mount();
});

watch(
  () => [props.project, props.projectDir] as const,
  () => {
    mount();
  },
);

watch(
  () => props.selection.selectedIds.value,
  () => {
    api?.refreshSelection();
  },
);

onUnmounted(() => {
  api?.destroy();
  api = null;
});

</script>

<template>
  <div ref="hostRef" class="editor-canvas-host" />
</template>

<style scoped>
.editor-canvas-host {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  position: relative;
  flex: 1;
}
</style>
