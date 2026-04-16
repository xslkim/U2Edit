<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import T06KonvaPerfPoc from "./poc/T06KonvaPerfPoc.vue";
import T07KonvaImePoc from "./poc/T07KonvaImePoc.vue";
import * as fileService from "./core/fileService";
import * as fileWatcher from "./core/fileWatcher";
import { initWindowGuard, setWindowDirty } from "./core/windowGuard";

const TREE_MIN = 150;
const TREE_MAX = 500;
const TREE_DEFAULT = 220;
const RIGHT_MIN = 150;
const RIGHT_MAX = 500;
const RIGHT_DEFAULT = 280;
const PROPS_H_MIN = 80;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const logLines = ref<string[]>([]);
const selectedDir = ref<string | null>(null);
const yamlPath = ref<string | null>(null);
let unlistenGuard: (() => void) | undefined;

function log(msg: string): void {
  logLines.value = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...logLines.value].slice(
    0,
    80,
  );
}

async function onPickDirectory(): Promise<void> {
  const dir = await fileService.pickDirectory();
  selectedDir.value = dir;
  if (dir) {
    const sep = dir.includes("\\") ? "\\" : "/";
    yamlPath.value = `${dir}${sep}test.yaml`;
    log(`目录: ${dir}`);
  } else {
    yamlPath.value = null;
    log("未选择目录");
  }
}

async function onReadYaml(): Promise<void> {
  if (!yamlPath.value) {
    log("请先选择目录");
    return;
  }
  try {
    const text = await fileService.readText(yamlPath.value);
    log(`读取成功，长度 ${text.length}：${text.slice(0, 40)}…`);
  } catch (e) {
    log(`读取失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function onWriteYaml(): Promise<void> {
  if (!yamlPath.value) {
    log("请先选择目录");
    return;
  }
  const content = "hello: 中文测试\n";
  try {
    await fileService.writeText(yamlPath.value, content);
    log("已写入 test.yaml（含 UTF-8 中文）");
  } catch (e) {
    log(`写入失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function onTestExists(): Promise<void> {
  if (!yamlPath.value) {
    log("请先选择目录");
    return;
  }
  const ex = await fileService.existsPath(yamlPath.value);
  log(`exists(test.yaml) = ${ex}`);
}

const view = ref<"main" | "t06" | "t07">("main");

const useDirtyFlag = ref(false);

function toggleDirty(): void {
  const next = !useDirtyFlag.value;
  useDirtyFlag.value = next;
  setWindowDirty(next);
  log(`dirty = ${next}（关闭窗口将${next ? "弹出" : "不弹出"}确认）`);
}

let watching = false;

async function toggleWatch(): Promise<void> {
  if (!yamlPath.value) {
    log("请先选择目录并确保 test.yaml 路径有效");
    return;
  }
  if (watching) {
    await fileWatcher.unwatch(yamlPath.value);
    watching = false;
    log("已停止监听 test.yaml");
    return;
  }
  await fileWatcher.watch(yamlPath.value, () => {
    log("检测到 test.yaml 变更");
  });
  watching = true;
  log("已开始监听 test.yaml");
}

// —— T1.5 布局 ——

const showTree = ref(true);
const showProps = ref(true);
const showAssets = ref(true);
const showStatus = ref(true);

const showRightColumn = computed(() => showProps.value || showAssets.value);

const treeW = ref(TREE_DEFAULT);
const rightW = ref(RIGHT_DEFAULT);
const propsH = ref(220);

const rightColRef = ref<HTMLElement | null>(null);

const roRight = new ResizeObserver(() => {
  clampPropsH();
});

function clampPropsH(): void {
  const el = rightColRef.value;
  if (!el || !showProps.value || !showAssets.value) {
    return;
  }
  const h = el.getBoundingClientRect().height;
  const max = Math.max(PROPS_H_MIN * 2, h - PROPS_H_MIN - 4);
  propsH.value = clamp(propsH.value, PROPS_H_MIN, max);
}

const propsSectionStyle = computed(() => {
  if (!showAssets.value) {
    return { flex: "1 1 auto", minHeight: "0" };
  }
  return { flex: `0 0 ${propsH.value}px`, minHeight: "0" };
});

const assetsSectionStyle = computed(() => {
  if (!showProps.value) {
    return { flex: "1 1 auto", minHeight: "0" };
  }
  return { flex: "1 1 auto", minHeight: "0" };
});

onMounted(() => {
  void initWindowGuard().then((un) => {
    unlistenGuard = un;
  });
});

onUnmounted(() => {
  unlistenGuard?.();
  roRight.disconnect();
});

function bindRightObserver(el: unknown): void {
  roRight.disconnect();
  const html = el instanceof HTMLElement ? el : null;
  rightColRef.value = html;
  if (html) {
    roRight.observe(html);
  }
}

function startDragTreeWidth(e: PointerEvent): void {
  e.preventDefault();
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startW = treeW.value;
  const onMove = (ev: PointerEvent): void => {
    const dx = ev.clientX - startX;
    treeW.value = clamp(startW + dx, TREE_MIN, TREE_MAX);
  };
  const onUp = (ev: PointerEvent): void => {
    (ev.target as HTMLElement).releasePointerCapture(ev.pointerId);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function startDragRightWidth(e: PointerEvent): void {
  e.preventDefault();
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startW = rightW.value;
  const onMove = (ev: PointerEvent): void => {
    const dx = ev.clientX - startX;
    rightW.value = clamp(startW - dx, RIGHT_MIN, RIGHT_MAX);
  };
  const onUp = (ev: PointerEvent): void => {
    (ev.target as HTMLElement).releasePointerCapture(ev.pointerId);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function startDragPropsSplit(e: PointerEvent): void {
  if (!showProps.value || !showAssets.value) {
    return;
  }
  e.preventDefault();
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  const el = rightColRef.value;
  if (!el) {
    return;
  }
  const startY = e.clientY;
  const startH = propsH.value;
  const onMove = (ev: PointerEvent): void => {
    const rect = el.getBoundingClientRect();
    const dy = ev.clientY - startY;
    const max = Math.max(PROPS_H_MIN * 2, rect.height - PROPS_H_MIN - 4);
    propsH.value = clamp(startH + dy, PROPS_H_MIN, max);
  };
  const onUp = (ev: PointerEvent): void => {
    (ev.target as HTMLElement).releasePointerCapture(ev.pointerId);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}
</script>

<template>
  <main class="app-root" :class="{ 'app-root--poc': view !== 'main' }">
    <div v-if="view === 't06'" class="poc-shell">
      <header class="poc-bar">
        <button type="button" class="linkish" @click="view = 'main'">← 返回主界面</button>
        <span class="poc-title">T0.6 Konva 性能 POC</span>
      </header>
      <T06KonvaPerfPoc class="poc-canvas" />
    </div>

    <div v-else-if="view === 't07'" class="poc-shell poc-shell--scroll">
      <header class="poc-bar">
        <button type="button" class="linkish" @click="view = 'main'">← 返回主界面</button>
        <span class="poc-title">T0.7 中文 IME 输入验证</span>
      </header>
      <T07KonvaImePoc class="poc-canvas poc-canvas--scroll" />
    </div>

    <div v-else class="editor-shell">
      <header class="toolbar" aria-label="Toolbar">
        <div class="toolbar__brand">
          <span class="toolbar__title">LWB UI Editor</span>
          <span class="toolbar__hint">T1.5 布局</span>
        </div>

        <div class="toolbar__toggles" role="toolbar" aria-label="面板显示">
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': showTree }"
            @click="showTree = !showTree"
          >
            节点树
          </button>
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': showProps }"
            @click="showProps = !showProps"
          >
            属性
          </button>
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': showAssets }"
            @click="showAssets = !showAssets"
          >
            资源
          </button>
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': showStatus }"
            @click="showStatus = !showStatus"
          >
            状态栏
          </button>
        </div>

        <div class="toolbar__poc">
          <button type="button" class="btn-sm" @click="view = 't06'">T0.6 Konva</button>
          <button type="button" class="btn-sm" @click="view = 't07'">T0.7 IME</button>
        </div>
      </header>

      <div class="workspace">
        <aside
          v-show="showTree"
          class="panel panel--tree"
          :style="{ width: `${treeW}px`, flex: 'none' }"
          aria-label="NodeTree"
        >
          <div class="panel__head">
            <span>节点树</span>
            <button type="button" class="icon-btn" title="隐藏" @click="showTree = false">×</button>
          </div>
          <div class="panel__body placeholder">（节点树 · T1.10）</div>
        </aside>

        <div
          v-show="showTree"
          class="gutter gutter--v"
          title="拖拽调整节点树宽度"
          @pointerdown="startDragTreeWidth"
        />

        <main class="canvas" aria-label="Canvas">
          <div class="canvas__label">Canvas 画布</div>
          <p class="canvas__hint">中央区域随窗口伸缩；Konva 集成见 T1.7</p>
        </main>

        <div
          v-show="showRightColumn"
          class="gutter gutter--v"
          title="拖拽调整右侧栏宽度"
          @pointerdown="startDragRightWidth"
        />

        <aside
          v-show="showRightColumn"
          :ref="bindRightObserver"
          class="panel panel--right"
          :style="{ width: `${rightW}px`, flex: 'none' }"
          aria-label="Properties 与 Assets"
        >
          <section
            v-show="showProps"
            class="panel__stack"
            :style="propsSectionStyle"
          >
            <div class="panel__head">
              <span>Properties</span>
              <button type="button" class="icon-btn" title="隐藏" @click="showProps = false">×</button>
            </div>
            <div class="panel__body placeholder">（属性 · T1.11）</div>
          </section>

          <div
            v-show="showProps && showAssets"
            class="gutter gutter--h"
            title="拖拽调整属性 / 资源高度"
            @pointerdown="startDragPropsSplit"
          />

          <section v-show="showAssets" class="panel__stack panel__stack--assets" :style="assetsSectionStyle">
            <div class="panel__head">
              <span>Assets</span>
              <button type="button" class="icon-btn" title="隐藏" @click="showAssets = false">×</button>
            </div>
            <div class="panel__body placeholder">（资源 · T2.7）</div>
          </section>
        </aside>
      </div>

      <footer v-show="showStatus" class="statusbar" aria-label="StatusBar">
        <span>缩放 100%</span>
        <span class="sep">|</span>
        <span>画布 1920×1080</span>
        <span class="sep">|</span>
        <span>选中 0</span>
        <span class="sep">|</span>
        <span>已保存</span>
      </footer>

      <details class="dev-drawer">
        <summary>T0.2 / T0.3 开发工具（文件与监听）</summary>
        <div class="dev-drawer__inner">
          <div class="row">
            <button type="button" @click="onPickDirectory">选择目录</button>
            <span v-if="selectedDir" class="path">{{ selectedDir }}</span>
          </div>
          <div class="row">
            <button type="button" @click="onReadYaml">读 YAML</button>
            <button type="button" @click="onWriteYaml">写 YAML</button>
            <button type="button" @click="onTestExists">测试 exists</button>
          </div>
          <div class="row">
            <button type="button" @click="toggleDirty">切换 dirty（关闭拦截）</button>
            <button type="button" @click="toggleWatch">{{ watching ? "停止监听" : "监听" }} test.yaml</button>
          </div>
          <pre class="log">{{ logLines.join("\n") || "日志…" }}</pre>
        </div>
      </details>
    </div>
  </main>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
</style>

<style scoped>
.app-root {
  box-sizing: border-box;
  margin: 0;
  min-height: 100%;
  height: 100%;
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    sans-serif;
  background: #e4e4e7;
}

.app-root--poc {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.poc-shell {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.poc-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #fafafa;
  border-bottom: 1px solid #e4e4e7;
}

.poc-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #18181b;
}

.linkish {
  background: none;
  border: none;
  padding: 0.25rem 0;
  color: #2563eb;
  cursor: pointer;
  font: inherit;
}

.poc-canvas {
  flex: 1;
  min-height: 0;
}

.poc-shell--scroll {
  overflow: hidden;
}

.poc-canvas--scroll {
  overflow: auto;
}

/* —— 主编辑器 —— */

.editor-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
}

.toolbar {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  padding: 0.5rem 0.75rem;
  background: #fafafa;
  border-bottom: 1px solid #d4d4d8;
  min-height: 40px;
}

.toolbar__brand {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.toolbar__title {
  font-weight: 700;
  font-size: 1rem;
  color: #18181b;
}

.toolbar__hint {
  font-size: 0.75rem;
  color: #71717a;
}

.toolbar__toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.toggle {
  padding: 0.25rem 0.6rem;
  font-size: 0.8rem;
  border: 1px solid #d4d4d8;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #52525b;
}

.toggle--on {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1e3a8a;
}

.toolbar__poc {
  margin-left: auto;
  display: flex;
  gap: 0.35rem;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
  border: 1px solid #d4d4d8;
  border-radius: 4px;
  background: #fff;
}

.workspace {
  flex: 1;
  display: flex;
  min-height: 0;
  min-width: 0;
}

.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #f4f4f5;
  border-right: 1px solid #d4d4d8;
}

.panel--tree {
  border-right: none;
}

.panel--right {
  border-right: none;
  border-left: 1px solid #d4d4d8;
  flex-direction: column;
  min-height: 0;
}

.panel__head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #3f3f46;
  background: #e4e4e7;
  border-bottom: 1px solid #d4d4d8;
}

.icon-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  color: #71717a;
  padding: 0 0.25rem;
}

.icon-btn:hover {
  color: #18181b;
}

.panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.5rem;
}

.panel__stack {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.panel__stack--assets {
  min-height: 0;
}

.placeholder {
  color: #71717a;
  font-size: 0.85rem;
}

.gutter {
  flex: none;
  background: #e4e4e7;
  z-index: 1;
}

.gutter--v {
  width: 5px;
  cursor: col-resize;
  border-left: 1px solid #d4d4d8;
  border-right: 1px solid #d4d4d8;
}

.gutter--v:hover {
  background: #bfdbfe;
}

.gutter--h {
  height: 5px;
  cursor: row-resize;
  border-top: 1px solid #d4d4d8;
  border-bottom: 1px solid #d4d4d8;
}

.gutter--h:hover {
  background: #bfdbfe;
}

.canvas {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #52525b;
  color: #e4e4e7;
  text-align: center;
  padding: 1rem;
}

.canvas__label {
  font-size: 1.1rem;
  font-weight: 600;
}

.canvas__hint {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  opacity: 0.85;
}

.statusbar {
  flex: none;
  height: 24px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.75rem;
  font-size: 0.75rem;
  color: #e4e4e7;
  background: #27272a;
  border-top: 1px solid #3f3f46;
}

.statusbar .sep {
  opacity: 0.5;
}

.dev-drawer {
  flex: none;
  border-top: 1px solid #d4d4d8;
  background: #fafafa;
  font-size: 0.8rem;
}

.dev-drawer summary {
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  user-select: none;
  color: #52525b;
}

.dev-drawer__inner {
  padding: 0 0.75rem 0.75rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
}

.row button {
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-size: 0.8rem;
}

.path {
  font-size: 0.75rem;
  color: #3f3f46;
  word-break: break-all;
}

.log {
  margin: 0;
  padding: 0.5rem;
  background: #18181b;
  color: #e4e4e7;
  font-size: 0.7rem;
  border-radius: 4px;
  min-height: 60px;
  max-height: 140px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
