<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { Command } from "../core/history";
import type { Node, Project } from "../core/schema";
import type { SelectionStore } from "../canvas/selection";
import { planTreeDrop, type TreeDropZone } from "../core/treeMove";

const props = defineProps<{
  project: Project;
  root: Node | undefined;
  selection: SelectionStore;
  lockedIds: Set<string>;
}>();

const emit = defineEmits<{
  dirty: [];
  commit: [cmd: Command];
  "move-blocked": [message: string];
  "toggle-lock": [nodeId: string];
  "row-contextmenu": [payload: { nodeId: string; clientX: number; clientY: number }];
}>();

const expandedIds = ref<Set<string>>(new Set());
const editingId = ref<string | null>(null);
const editDraft = ref("");
const listRef = ref<HTMLElement | null>(null);
const searchQuery = ref("");

const dragSourceId = ref<string | null>(null);
const dropHover = ref<{ nodeId: string; zone: TreeDropZone } | null>(null);

function hasChildren(n: Node): n is Extract<Node, { children: Node[] }> {
  return n.type === "panel" || n.type === "button";
}

function collectAllExpandableIds(n: Node, into: Set<string>): void {
  if (hasChildren(n)) {
    into.add(n.id);
    for (const c of n.children) {
      collectAllExpandableIds(c, into);
    }
  }
}

function defaultExpandedSet(root: Node | undefined): Set<string> {
  const s = new Set<string>();
  if (root) {
    s.add(root.id);
    collectAllExpandableIds(root, s);
  }
  return s;
}

watch(
  () => props.root?.id,
  () => {
    expandedIds.value = defaultExpandedSet(props.root);
  },
  { immediate: true },
);

type Row = { node: Node; depth: number };

/** 搜索：保留匹配节点及其路径上的祖先 */
const keepIds = computed((): Set<string> | null => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q || !props.root) {
    return null;
  }
  const keep = new Set<string>();
  function visit(n: Node): boolean {
    const self = n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q);
    let anyChild = false;
    if (hasChildren(n)) {
      for (const c of n.children) {
        if (visit(c)) {
          anyChild = true;
        }
      }
    }
    if (self || anyChild) {
      keep.add(n.id);
      return true;
    }
    return false;
  }
  visit(props.root);
  return keep;
});

function rowMatchesSearch(node: Node): boolean {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) {
    return false;
  }
  return node.name.toLowerCase().includes(q) || node.id.toLowerCase().includes(q);
}

const rows = computed((): Row[] => {
  const out: Row[] = [];
  const root = props.root;
  if (!root) {
    return out;
  }
  const filter = keepIds.value;

  function walk(n: Node, depth: number): void {
    if (filter && !filter.has(n.id)) {
      return;
    }
    out.push({ node: n, depth });
    const expand = filter ? true : expandedIds.value.has(n.id);
    if (hasChildren(n) && expand) {
      for (const c of n.children) {
        walk(c, depth + 1);
      }
    }
  }
  walk(root, 0);
  return out;
});

function toggleExpand(id: string, e: Event): void {
  e.stopPropagation();
  const s = new Set(expandedIds.value);
  if (s.has(id)) {
    s.delete(id);
  } else {
    s.add(id);
  }
  expandedIds.value = s;
}

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id);
}

function typeLabel(t: Node["type"]): string {
  const m: Record<Node["type"], string> = {
    panel: "Panel",
    image: "Image",
    text: "Text",
    button: "Button",
    slider: "Slider",
    toggle: "Toggle",
    inputField: "Input",
  };
  return m[t] ?? t;
}

function onRowClick(node: Node, e: MouseEvent): void {
  if (editingId.value === node.id) {
    return;
  }
  if (e.ctrlKey || e.metaKey) {
    props.selection.toggle(node.id);
  } else {
    props.selection.selectOnly(node.id);
  }
}

function onToggleVisible(node: Node, e: Event): void {
  e.stopPropagation();
  node.visible = !node.visible;
  emit("dirty");
}

function onToggleLock(nodeId: string, e: Event): void {
  e.stopPropagation();
  emit("toggle-lock", nodeId);
}

function isLocked(id: string): boolean {
  return props.lockedIds.has(id);
}

function startRename(node: Node, e: Event): void {
  e.stopPropagation();
  editingId.value = node.id;
  editDraft.value = node.name;
  void nextTick(() => {
    const el = listRef.value?.querySelector<HTMLInputElement>(`input[data-edit="${node.id}"]`);
    el?.focus();
    el?.select();
  });
}

function commitRename(node: Node): void {
  if (editingId.value !== node.id) {
    return;
  }
  const t = editDraft.value.trim();
  if (t && t !== node.name) {
    node.name = t;
    emit("dirty");
  }
  editingId.value = null;
}

function cancelRename(): void {
  editingId.value = null;
}

function onEditKeydown(node: Node, e: KeyboardEvent): void {
  if (e.key === "Enter") {
    e.preventDefault();
    commitRename(node);
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelRename();
  }
}

function rowClass(node: Node): Record<string, boolean> {
  const dh = dropHover.value;
  const z = dh?.nodeId === node.id ? dh.zone : null;
  return {
    "node-tree__row--selected": props.selection.selectedIds.value.has(node.id),
    "node-tree__row--search-hit": rowMatchesSearch(node),
    "node-tree__row--drop-before": z === "before",
    "node-tree__row--drop-into": z === "into",
    "node-tree__row--drop-after": z === "after",
  };
}

watch(
  () => [...props.selection.selectedIds.value].join(","),
  async () => {
    const id = [...props.selection.selectedIds.value][0];
    if (!id) {
      return;
    }
    await nextTick();
    const el = listRef.value?.querySelector(`[data-node-id="${id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  },
);

function zoneFromPointer(el: HTMLElement, clientY: number, node: Node): TreeDropZone {
  const r = el.getBoundingClientRect();
  const y = clientY - r.top;
  const t = y / Math.max(r.height, 1);
  const canInto = node.type === "panel" || node.type === "button";
  if (t < 0.28) {
    return "before";
  }
  if (t > 0.72) {
    return "after";
  }
  if (canInto) {
    return "into";
  }
  return t < 0.5 ? "before" : "after";
}

function onDragStart(node: Node, e: DragEvent): void {
  if (!props.root || node.id === props.root.id) {
    e.preventDefault();
    return;
  }
  if (props.lockedIds.has(node.id)) {
    e.preventDefault();
    emit("move-blocked", "已锁定节点不可拖拽");
    return;
  }
  dragSourceId.value = node.id;
  e.dataTransfer?.setData("text/plain", node.id);
  e.dataTransfer!.effectAllowed = "move";
}

function onDragEnd(): void {
  dragSourceId.value = null;
  dropHover.value = null;
}

function onDragOverRow(node: Node, e: DragEvent): void {
  if (!dragSourceId.value) {
    return;
  }
  e.preventDefault();
  e.dataTransfer!.dropEffect = "move";
  dropHover.value = { nodeId: node.id, zone: zoneFromPointer(e.currentTarget as HTMLElement, e.clientY, node) };
}

function onDragLeaveRow(): void {
  dropHover.value = null;
}

function onDropRow(node: Node, e: DragEvent): void {
  e.preventDefault();
  const dragged = dragSourceId.value ?? e.dataTransfer?.getData("text/plain");
  dropHover.value = null;
  dragSourceId.value = null;
  if (!dragged || !props.root) {
    return;
  }
  const zone = zoneFromPointer(e.currentTarget as HTMLElement, e.clientY, node);
  if (props.lockedIds.has(node.id)) {
    emit("move-blocked", "目标已锁定");
    return;
  }
  const plan = planTreeDrop(props.project, dragged, node.id, zone, props.root.id);
  if (!plan.ok) {
    emit("move-blocked", plan.message);
    return;
  }
  emit("commit", plan.cmd);
}

defineExpose({
  focusNodeId(id: string): void {
    const el = listRef.value?.querySelector(`[data-node-id="${id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  },
});
</script>

<template>
  <div class="node-tree">
    <div v-if="root" class="node-tree__toolbar">
      <input
        v-model="searchQuery"
        class="node-tree__search"
        type="search"
        placeholder="搜索 name / id"
        aria-label="节点树搜索"
        @keydown.stop
      />
    </div>
    <div ref="listRef" class="node-tree__scroll">
      <div v-if="!root" class="node-tree__empty">无根节点</div>
      <template v-else>
        <div
          v-for="{ node, depth } in rows"
          :key="node.id"
          class="node-tree__row"
          :class="rowClass(node)"
          :data-node-id="node.id"
          :style="{ paddingLeft: `${8 + depth * 14}px` }"
          @click="onRowClick(node, $event)"
          @dblclick="startRename(node, $event)"
          @contextmenu.prevent="
            emit('row-contextmenu', { nodeId: node.id, clientX: $event.clientX, clientY: $event.clientY })
          "
          @dragover="onDragOverRow(node, $event)"
          @dragleave="onDragLeaveRow"
          @drop="onDropRow(node, $event)"
        >
          <span
            class="node-tree__grip"
            :class="{ 'node-tree__grip--disabled': node.id === root?.id || isLocked(node.id) }"
            draggable="true"
            title="拖拽调整层级或顺序"
            @dragstart="onDragStart(node, $event)"
            @dragend="onDragEnd"
            @click.stop
          >
            ⠿
          </span>

          <span
            v-if="hasChildren(node)"
            class="node-tree__chev"
            :class="{ 'node-tree__chev--open': isExpanded(node.id) }"
            @click="toggleExpand(node.id, $event)"
          >
            ▸
          </span>
          <span v-else class="node-tree__chev node-tree__chev--spacer" />

          <span class="node-tree__type">{{ typeLabel(node.type) }}</span>

          <span v-if="editingId !== node.id" class="node-tree__name">{{ node.name }}</span>
          <input
            v-else
            class="node-tree__input"
            :data-edit="node.id"
            v-model="editDraft"
            @keydown="onEditKeydown(node, $event)"
            @blur="commitRename(node)"
            @click.stop
          />

          <span class="node-tree__actions">
            <button
              type="button"
              class="node-tree__icon"
              :title="node.visible ? '隐藏' : '显示'"
              :class="{ 'node-tree__icon--off': !node.visible }"
              @click="onToggleVisible(node, $event)"
            >
              👁
            </button>
            <button
              type="button"
              class="node-tree__icon"
              :class="{ 'node-tree__icon--active': isLocked(node.id) }"
              :title="isLocked(node.id) ? '解锁（仅会话）' : '锁定（仅会话）'"
              @click="onToggleLock(node.id, $event)"
            >
              {{ isLocked(node.id) ? "🔒" : "🔓" }}
            </button>
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.node-tree {
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
  color: #18181b;
  user-select: none;
  min-height: 0;
  flex: 1;
}

.node-tree__toolbar {
  flex: none;
  padding: 0.25rem 0.35rem 0.35rem;
  border-bottom: 1px solid #e4e4e7;
}

.node-tree__search {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  padding: 0.2rem 0.35rem;
  border: 1px solid #d4d4d8;
  border-radius: 4px;
}

.node-tree__search:focus {
  outline: none;
  border-color: #93c5fd;
}

.node-tree__scroll {
  overflow: auto;
  flex: 1;
  min-height: 0;
  padding: 0.25rem 0;
}

.node-tree__empty {
  padding: 0.5rem;
  color: #71717a;
}

.node-tree__row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 22px;
  padding: 2px 0.35rem 2px 0;
  cursor: default;
  border-radius: 3px;
}

.node-tree__row:hover {
  background: #e4e4e7;
}

.node-tree__row--selected {
  background: #dbeafe;
}

.node-tree__row--search-hit .node-tree__name {
  color: #1d4ed8;
  font-weight: 600;
}

.node-tree__row--drop-before {
  box-shadow: inset 0 2px 0 0 #2563eb;
}

.node-tree__row--drop-after {
  box-shadow: inset 0 -2px 0 0 #2563eb;
}

.node-tree__row--drop-into {
  background: #dbeafe;
  outline: 1px dashed #2563eb;
}

.node-tree__grip {
  flex: none;
  width: 14px;
  cursor: grab;
  color: #a1a1aa;
  font-size: 0.65rem;
  line-height: 1;
  text-align: center;
}

.node-tree__grip:active {
  cursor: grabbing;
}

.node-tree__grip--disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.node-tree__chev {
  flex: none;
  width: 14px;
  text-align: center;
  cursor: pointer;
  color: #52525b;
  font-size: 0.65rem;
  transform: rotate(-90deg);
  line-height: 1;
}

.node-tree__chev--open {
  transform: rotate(0deg);
}

.node-tree__chev--spacer {
  visibility: hidden;
  cursor: default;
}

.node-tree__type {
  flex: none;
  font-size: 0.65rem;
  color: #71717a;
  width: 44px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-tree__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-tree__input {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 0 0.2rem;
  border: 1px solid #93c5fd;
  border-radius: 2px;
}

.node-tree__actions {
  flex: none;
  display: flex;
  gap: 0.1rem;
}

.node-tree__icon {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
  opacity: 0.75;
}

.node-tree__icon:hover {
  opacity: 1;
}

.node-tree__icon--off {
  opacity: 0.35;
}

.node-tree__icon--active {
  opacity: 1;
}
</style>
