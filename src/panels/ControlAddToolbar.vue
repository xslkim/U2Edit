<script setup lang="ts">
import type { NodeType } from "../core/schema";

defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  add: [type: NodeType];
}>();

const ITEMS: Array<{ type: NodeType; short: string; title: string }> = [
  { type: "image", short: "Img", title: "添加 Image（默认 100×100）" },
  { type: "text", short: "Txt", title: "添加 Text" },
  { type: "button", short: "Btn", title: "添加 Button" },
  { type: "panel", short: "Pan", title: "添加 Panel" },
  { type: "slider", short: "Sld", title: "添加 Slider" },
  { type: "toggle", short: "Tog", title: "添加 Toggle" },
  { type: "inputField", short: "Inp", title: "添加 InputField" },
];
</script>

<template>
  <div class="add-bar" role="toolbar" aria-label="添加控件">
    <span class="add-bar__label">控件</span>
    <button
      v-for="it in ITEMS"
      :key="it.type"
      type="button"
      class="add-bar__btn"
      :disabled="disabled"
      :title="it.title"
      @click="emit('add', it.type)"
    >
      {{ it.short }}
    </button>
  </div>
</template>

<style scoped>
.add-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
  padding: 0.2rem 0.5rem;
  border-bottom: 1px solid #e4e4e7;
  background: #fafafa;
}

.add-bar__label {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #71717a;
  margin-right: 0.25rem;
}

.add-bar__btn {
  font: inherit;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  min-width: 2rem;
  border: 1px solid #d4d4d8;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  color: #18181b;
}

.add-bar__btn:hover:not(:disabled) {
  background: #f4f4f5;
  border-color: #a1a1aa;
}

.add-bar__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
