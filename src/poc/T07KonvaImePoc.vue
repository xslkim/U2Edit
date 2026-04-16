<script setup lang="ts">
import Konva from "konva";
import { nextTick, onMounted, onUnmounted, ref, shallowRef } from "vue";
import { shouldIgnoreCanvasShortcut } from "./imeShortcutGuards";

const hostRef = ref<HTMLDivElement | null>(null);
const inlineEditorRef = ref<HTMLTextAreaElement | null>(null);

const stageRef = shallowRef<Konva.Stage | null>(null);
const textNodeRef = shallowRef<Konva.Text | null>(null);

const deleteCount = ref(0);
const undoCount = ref(0);

const editing = ref(false);
const editText = ref("");
const editorStyle = ref<Record<string, string>>({});

let composing = false;
let removeResize: (() => void) | undefined;
let removeKeydown: (() => void) | undefined;

function setComposingStart(): void {
  composing = true;
}

function setComposingEnd(): void {
  composing = false;
}

/**
 * T0.7：全局 Delete / Ctrl+Z —— IME 组合输入期间不触发「画布节点」逻辑。
 */
function onGlobalKeydown(e: KeyboardEvent): void {
  if (shouldIgnoreCanvasShortcut(e, composing)) {
    return;
  }

  if (e.key === "Delete" || e.key === "Backspace") {
    deleteCount.value += 1;
    e.preventDefault();
    return;
  }

  if (e.ctrlKey && e.key.toLowerCase() === "z") {
    undoCount.value += 1;
    e.preventDefault();
  }
}

function updateEditorPosition(): void {
  const stage = stageRef.value;
  const textNode = textNodeRef.value;
  const host = hostRef.value;
  if (!stage || !textNode || !host) {
    return;
  }
  const cont = stage.container().getBoundingClientRect();
  const scale = stage.scaleX();
  const x = cont.left + stage.x() + textNode.x() * scale;
  const y = cont.top + stage.y() + textNode.y() * scale;
  editorStyle.value = {
    position: "fixed",
    left: `${Math.round(x)}px`,
    top: `${Math.round(y)}px`,
    width: "min(90vw, 280px)",
    minHeight: "2.25rem",
    zIndex: "10",
    font: "16px system-ui, sans-serif",
    padding: "4px 6px",
    boxSizing: "border-box",
  };
}

function openEditor(): void {
  const textNode = textNodeRef.value;
  if (!textNode) {
    return;
  }
  editing.value = true;
  editText.value = textNode.text();
  void nextTick(() => {
    updateEditorPosition();
    inlineEditorRef.value?.focus();
    inlineEditorRef.value?.select();
  });
}

function commitEditor(): void {
  const textNode = textNodeRef.value;
  if (!textNode) {
    return;
  }
  textNode.text(editText.value);
  editing.value = false;
  textNode.getLayer()?.batchDraw();
}

function getKonvaTextForTest(): string {
  return textNodeRef.value?.text() ?? "";
}

defineExpose({
  /** 仅 Vitest：避免 happy-dom 双击命中偏差 */
  openEditorForTest: openEditor,
  getKonvaTextForTest,
});

function mountStage(): void {
  const el = hostRef.value;
  if (!el) {
    return;
  }
  const width = el.clientWidth;
  const height = el.clientHeight;
  const stage = new Konva.Stage({
    container: el,
    width,
    height,
  });
  const layer = new Konva.Layer();
  stage.add(layer);

  const textNode = new Konva.Text({
    x: 48,
    y: 72,
    text: "双击编辑（中文）",
    fontSize: 20,
    fontFamily: "system-ui, sans-serif",
    fill: "#18181b",
    padding: 8,
  });
  textNode.on("dblclick", () => {
    openEditor();
  });
  layer.add(textNode);
  layer.batchDraw();

  stageRef.value = stage;
  textNodeRef.value = textNode;

  const onResize = (): void => {
    if (!hostRef.value) {
      return;
    }
    stage.width(hostRef.value.clientWidth);
    stage.height(hostRef.value.clientHeight);
    layer.batchDraw();
    if (editing.value) {
      updateEditorPosition();
    }
  };
  window.addEventListener("resize", onResize);
  removeResize = (): void => {
    window.removeEventListener("resize", onResize);
  };
}

onMounted(() => {
  mountStage();
  const keyOpts = { capture: true };
  const kd = (ev: Event): void => {
    onGlobalKeydown(ev as KeyboardEvent);
  };
  window.addEventListener("keydown", kd, keyOpts);
  removeKeydown = (): void => {
    window.removeEventListener("keydown", kd, keyOpts);
  };
});

onUnmounted(() => {
  removeResize?.();
  removeResize = undefined;
  removeKeydown?.();
  removeKeydown = undefined;
  stageRef.value?.destroy();
  stageRef.value = null;
  textNodeRef.value = null;
});
</script>

<template>
  <div class="t07-root">
    <section class="t07-block">
      <h2 class="t07-h">用例 1：普通 &lt;input&gt; + 微软拼音</h2>
      <p class="t07-p">
        在下方输入框聚焦时输入中文；组合输入（候选条）出现时按 Delete / Backspace 应只影响拼音，不应增加「画布删除计数」。
      </p>
      <input
        class="t07-input"
        type="text"
        placeholder="在此用微软拼音输入「你好」"
        @compositionstart="setComposingStart"
        @compositionend="setComposingEnd"
      />
    </section>

    <section class="t07-block">
      <h2 class="t07-h">用例 2：Konva Text + 双击内联编辑</h2>
      <p class="t07-p">双击画布文字，用输入法输入中文，Enter 确认。</p>
      <div ref="hostRef" class="t07-stage-host" />
      <textarea
        v-show="editing"
        ref="inlineEditorRef"
        v-model="editText"
        class="t07-inline"
        :style="editorStyle"
        @compositionstart="setComposingStart"
        @compositionend="setComposingEnd"
        @keydown.enter.prevent="commitEditor"
        @blur="commitEditor"
      />
    </section>

    <section class="t07-block t07-metrics">
      <p>
        <strong>画布删除计数</strong>（仅当焦点不在输入框且非 IME 组合时按 Delete/Backspace）：
        <code data-testid="t07-delete-count">{{ deleteCount }}</code>
      </p>
      <p>
        <strong>撤销计数</strong>（同上条件下 Ctrl+Z）：
        <code data-testid="t07-undo-count">{{ undoCount }}</code>
      </p>
      <p class="t07-note">
        用例 3：本 POC <strong>未将空格绑定画布平移</strong>，选字空格不会与「空格+左键平移」冲突。
      </p>
    </section>
  </div>
</template>

<style scoped>
.t07-root {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.75rem 1rem 1.25rem;
  overflow: auto;
  font-family: system-ui, sans-serif;
  color: #18181b;
}

.t07-block {
  background: #fafafa;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}

.t07-h {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}

.t07-p {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: #52525b;
  line-height: 1.4;
}

.t07-input {
  width: min(100%, 420px);
  font: inherit;
  padding: 0.4rem 0.5rem;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
}

.t07-stage-host {
  width: 100%;
  height: min(52vh, 420px);
  min-height: 240px;
  background: #e4e4e7;
  border-radius: 6px;
  margin-top: 0.5rem;
}

.t07-inline {
  margin: 0;
  resize: vertical;
}

.t07-metrics {
  font-size: 0.85rem;
}

.t07-metrics code {
  background: #f4f4f5;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}

.t07-note {
  margin: 0.5rem 0 0;
  color: #3f3f46;
}
</style>
