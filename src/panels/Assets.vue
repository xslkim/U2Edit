<script setup lang="ts">
import { ask, message } from "@tauri-apps/plugin-dialog";
import { readFile, remove } from "@tauri-apps/plugin-fs";
import { computed, onUnmounted, ref, toRaw, watch } from "vue";
import {
  copyImageIntoAssets,
  fileBasename,
  getImageDimensions,
  nextFreeAssetFilename,
  normalizeAssetRelPath,
  uniqueAssetIdFromFilename,
} from "../core/assetImport";
import { ASSET_DRAG_MIME } from "../canvas/assetDrag";
import { resolveAssetAbsolute } from "../core/assetPath";
import * as fileService from "../core/fileService";
import {
  AddAssetCommand,
  PatchAssetCommand,
  type Command,
} from "../core/history";
import { joinProjectPath } from "../core/project";
import {
  listNodesReferencingAsset,
  makeRemoveAssetWithRefClearsCommand,
} from "../core/assetRefs";
import type { AssetRef, Project } from "../core/schema";

const props = defineProps<{
  project: Project;
  projectDir: string;
  commitCommand: (cmd: Command) => void;
}>();

const emit = defineEmits<{
  dirty: [];
}>();

const searchQuery = ref("");
const thumbUrlById = ref<Map<string, string>>(new Map());
const importing = ref(false);

const filteredAssets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  let list = props.project.assets;
  if (q) {
    list = list.filter((a) => a.id.toLowerCase().includes(q) || a.path.toLowerCase().includes(q));
  }
  return list;
});

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function revokeAllThumbs(): void {
  for (const u of thumbUrlById.value.values()) {
    URL.revokeObjectURL(u);
  }
  thumbUrlById.value = new Map();
}

async function loadThumbnails(): Promise<void> {
  revokeAllThumbs();
  if (!isTauri()) {
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
      /* 跳过 */
    }
  }
  thumbUrlById.value = map;
}

watch(
  () => props.project.assets.map((a) => `${a.id}:${a.path}:${a.width}x${a.height}`).join("|"),
  () => {
    void loadThumbnails();
  },
  { immediate: true },
);

onUnmounted(() => {
  revokeAllThumbs();
});

function tooltipFor(asset: AssetRef): string {
  const name = fileBasename(asset.path);
  return `${name}\n${asset.width}×${asset.height}`;
}

function onDragStartAsset(a: AssetRef, e: DragEvent): void {
  e.dataTransfer?.setData(ASSET_DRAG_MIME, a.id);
  e.dataTransfer?.setData("text/plain", a.id);
  e.dataTransfer!.effectAllowed = "copy";
}

async function onImport(): Promise<void> {
  if (importing.value) {
    return;
  }
  const paths = await fileService.pickImageFiles();
  if (!paths || paths.length === 0) {
    return;
  }
  importing.value = true;
  try {
    await fileService.ensureDir(joinProjectPath(props.projectDir, "assets"));
    for (const srcAbs of paths) {
      await importOneFile(srcAbs);
    }
  } catch (e) {
    await message(String(e instanceof Error ? e.message : e), { title: "导入失败", kind: "error" });
  } finally {
    importing.value = false;
  }
}

async function importOneFile(srcAbs: string): Promise<void> {
  const dir = props.projectDir;
  const base = fileBasename(srcAbs);
  const desiredRel = normalizeAssetRelPath(`assets/${base}`);
  const destAbs = joinProjectPath(dir, desiredRel);
  const existsDisk = await fileService.existsPath(destAbs);
  const yamlEntry = props.project.assets.find(
    (a) => normalizeAssetRelPath(a.path) === desiredRel,
  );
  const conflict = existsDisk || !!yamlEntry;

  let targetBase = base;
  let targetRel = desiredRel;
  let targetAbs = destAbs;

  if (conflict) {
    const overwrite = await ask(
      `已存在与「${base}」同名的资源或文件。\n是否覆盖？\n（选「否」可自动重命名导入）`,
      { title: "导入资源", kind: "warning" },
    );
    if (overwrite) {
      await copyImageIntoAssets(srcAbs, targetAbs);
      const dim = await getImageDimensions(targetAbs);
      if (yamlEntry) {
        const before = structuredClone(toRaw(yamlEntry));
        props.commitCommand(
          new PatchAssetCommand(
            props.project,
            yamlEntry.id,
            { width: dim.width, height: dim.height },
            before,
          ),
        );
      } else {
        const id = uniqueAssetIdFromFilename(props.project, base);
        props.commitCommand(
          new AddAssetCommand(props.project, props.project.assets.length, {
            id,
            path: targetRel,
            width: dim.width,
            height: dim.height,
          }, "导入"),
        );
      }
      emit("dirty");
      return;
    }
    const rename = await ask("是否自动重命名（添加 _1、_2 等后缀）导入？", {
      title: "导入资源",
      okLabel: "重命名",
      cancelLabel: "跳过",
    });
    if (!rename) {
      return;
    }
    targetBase = await nextFreeAssetFilename(props.project, dir, base);
    targetRel = normalizeAssetRelPath(`assets/${targetBase}`);
    targetAbs = joinProjectPath(dir, targetRel);
  }

  await copyImageIntoAssets(srcAbs, targetAbs);
  const dim = await getImageDimensions(targetAbs);
  const id = uniqueAssetIdFromFilename(props.project, targetBase);
  props.commitCommand(
    new AddAssetCommand(
      props.project,
      props.project.assets.length,
      {
        id,
        path: targetRel,
        width: dim.width,
        height: dim.height,
      },
      "导入",
    ),
  );
  emit("dirty");
}

async function onContextMenu(asset: AssetRef, e: MouseEvent): Promise<void> {
  e.preventDefault();
  const refs = listNodesReferencingAsset(props.project, asset.id);
  if (refs.length > 0) {
    const lines = refs.map((r) => r.label).join("\n");
    const ok = await ask(
      `以下节点正在引用该资源：\n${lines}\n\n删除将清除这些引用，并删除磁盘文件。是否继续？`,
      { title: "删除资源", kind: "warning" },
    );
    if (!ok) {
      return;
    }
  } else {
    const ok = await ask(`确定删除资源「${asset.id}」？`, { title: "删除资源", kind: "warning" });
    if (!ok) {
      return;
    }
  }

  const abs = resolveAssetAbsolute(props.project, props.projectDir, asset.id);
  const cmd = makeRemoveAssetWithRefClearsCommand(props.project, asset.id);
  props.commitCommand(cmd);
  emit("dirty");
  if (abs) {
    try {
      await remove(abs);
    } catch {
      await message("已从项目中移除资源，但删除磁盘文件失败（可能已被移动）。", {
        title: "删除资源",
        kind: "warning",
      });
    }
  }
}
</script>

<template>
  <div class="assets">
    <div class="assets__toolbar">
      <button type="button" class="btn-sm" :disabled="importing" @click="onImport">导入</button>
      <input
        v-model="searchQuery"
        class="assets__search"
        type="search"
        placeholder="搜索 id / 路径…"
        autocomplete="off"
      />
    </div>
    <div class="assets__grid-wrap">
      <div v-if="filteredAssets.length === 0" class="assets__empty">暂无资源</div>
      <ul v-else class="assets__grid" aria-label="资源缩略图">
        <li
          v-for="a in filteredAssets"
          :key="a.id"
          draggable="true"
          class="assets__cell"
          :title="tooltipFor(a)"
          @dragstart="onDragStartAsset(a, $event)"
          @contextmenu="onContextMenu(a, $event)"
        >
          <div class="assets__thumb">
            <img
              v-if="thumbUrlById.get(a.id)"
              class="assets__img"
              :src="thumbUrlById.get(a.id)!"
              :alt="a.id"
            />
            <span v-else class="assets__ph">?</span>
          </div>
          <div class="assets__id">{{ a.id }}</div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.assets {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: 8px;
}

.assets__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.assets__search {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid #d4d4d8;
  border-radius: 4px;
}

.assets__grid-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.assets__empty {
  padding: 12px;
  font-size: 12px;
  color: #71717a;
}

.assets__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.assets__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: context-menu;
}

.assets__thumb {
  width: 64px;
  height: 64px;
  border: 1px solid #e4e4e7;
  border-radius: 4px;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.assets__img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.assets__ph {
  font-size: 18px;
  color: #a1a1aa;
}

.assets__id {
  font-size: 10px;
  color: #52525b;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.btn-sm {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
}
.btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
