<script setup lang="ts">
import { nextTick, onUnmounted, watch } from "vue";
import type { NodeType } from "../core/schema";

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  variant: "blank" | "node-canvas" | "node-tree";
  pasteDisabled: boolean;
  copyDisabled?: boolean;
  deleteDisabled?: boolean;
  moveUpDisabled?: boolean;
  moveDownDisabled?: boolean;
  frontDisabled?: boolean;
  backDisabled?: boolean;
  lockDisabled?: boolean;
  lockLabel?: "锁定" | "解锁";
}>();

const emit = defineEmits<{
  close: [];
  paste: [];
  copy: [];
  delete: [];
  "move-up": [];
  "move-down": [];
  front: [];
  back: [];
  lock: [];
  "add-control": [type: NodeType];
}>();

const ADD_ITEMS: Array<{ type: NodeType; label: string }> = [
  { type: "image", label: "Image" },
  { type: "text", label: "Text" },
  { type: "button", label: "Button" },
  { type: "panel", label: "Panel" },
  { type: "slider", label: "Slider" },
  { type: "toggle", label: "Toggle" },
  { type: "inputField", label: "InputField" },
];

function onDocPointerDown(ev: Event): void {
  const t = ev.target as HTMLElement | null;
  if (t?.closest?.("[data-context-menu-root]")) {
    return;
  }
  emit("close");
}

watch(
  () => props.open,
  (o) => {
    if (o) {
      void nextTick(() => {
        document.addEventListener("pointerdown", onDocPointerDown, true);
      });
    } else {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, true);
});

function itemClass(disabled: boolean): Record<string, boolean> {
  return {
    "ctx-menu__item": true,
    "ctx-menu__item--disabled": disabled,
  };
}
</script>

<template>
  <Teleport to="body">
    <div
      v-show="open"
      data-context-menu-root
      class="ctx-menu"
      :style="{ left: `${x}px`, top: `${y}px` }"
      role="menu"
      @contextmenu.prevent
      @pointerdown.stop
    >
      <template v-if="variant === 'blank'">
        <div class="ctx-menu__subwrap">
          <button type="button" class="ctx-menu__item ctx-menu__subhead" aria-haspopup="true">
            添加控件 ▸
          </button>
          <div class="ctx-menu__sub" role="menu">
            <button
              v-for="it in ADD_ITEMS"
              :key="it.type"
              type="button"
              class="ctx-menu__item"
              role="menuitem"
              @click="emit('add-control', it.type); emit('close')"
            >
              {{ it.label }}
            </button>
          </div>
        </div>
        <button
          type="button"
          :class="itemClass(pasteDisabled)"
          :disabled="pasteDisabled"
          role="menuitem"
          @click="!pasteDisabled && (emit('paste'), emit('close'))"
        >
          粘贴
        </button>
      </template>

      <template v-else>
        <button
          type="button"
          :class="itemClass(!!copyDisabled)"
          :disabled="!!copyDisabled"
          role="menuitem"
          @click="!copyDisabled && (emit('copy'), emit('close'))"
        >
          复制
        </button>
        <button
          type="button"
          :class="itemClass(pasteDisabled)"
          :disabled="pasteDisabled"
          role="menuitem"
          @click="!pasteDisabled && (emit('paste'), emit('close'))"
        >
          粘贴
        </button>
        <button
          type="button"
          :class="itemClass(!!deleteDisabled)"
          :disabled="!!deleteDisabled"
          role="menuitem"
          @click="!deleteDisabled && (emit('delete'), emit('close'))"
        >
          删除
        </button>
        <div class="ctx-menu__sep" />
        <button
          type="button"
          :class="itemClass(!!moveUpDisabled)"
          :disabled="!!moveUpDisabled"
          role="menuitem"
          @click="!moveUpDisabled && (emit('move-up'), emit('close'))"
        >
          上移
        </button>
        <button
          type="button"
          :class="itemClass(!!moveDownDisabled)"
          :disabled="!!moveDownDisabled"
          role="menuitem"
          @click="!moveDownDisabled && (emit('move-down'), emit('close'))"
        >
          下移
        </button>
        <button
          type="button"
          :class="itemClass(!!frontDisabled)"
          :disabled="!!frontDisabled"
          role="menuitem"
          @click="!frontDisabled && (emit('front'), emit('close'))"
        >
          置顶
        </button>
        <button
          type="button"
          :class="itemClass(!!backDisabled)"
          :disabled="!!backDisabled"
          role="menuitem"
          @click="!backDisabled && (emit('back'), emit('close'))"
        >
          置底
        </button>
        <template v-if="variant === 'node-canvas'">
          <div class="ctx-menu__sep" />
          <button
            type="button"
            :class="itemClass(!!lockDisabled)"
            :disabled="!!lockDisabled"
            role="menuitem"
            @click="!lockDisabled && (emit('lock'), emit('close'))"
          >
            {{ lockLabel ?? "锁定" }}
          </button>
        </template>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.ctx-menu {
  position: fixed;
  z-index: 100000;
  min-width: 9rem;
  padding: 0.2rem 0;
  font-size: 0.75rem;
  color: #18181b;
  background: #fff;
  border: 1px solid #d4d4d8;
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.ctx-menu__item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.28rem 0.65rem;
  border: none;
  background: transparent;
  font: inherit;
  cursor: pointer;
  color: inherit;
}

.ctx-menu__item:hover:not(:disabled):not(.ctx-menu__item--disabled) {
  background: #f4f4f5;
}

.ctx-menu__item--disabled,
.ctx-menu__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ctx-menu__subhead {
  position: relative;
}

.ctx-menu__sep {
  height: 1px;
  margin: 0.2rem 0;
  background: #e4e4e7;
}

.ctx-menu__subwrap {
  position: relative;
}

.ctx-menu__subwrap:hover .ctx-menu__sub {
  display: block;
}

.ctx-menu__sub {
  display: none;
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 2px;
  min-width: 7rem;
  padding: 0.2rem 0;
  background: #fff;
  border: 1px solid #d4d4d8;
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
</style>
