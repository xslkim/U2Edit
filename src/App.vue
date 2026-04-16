<script setup lang="ts">
import { message } from "@tauri-apps/plugin-dialog";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import T06KonvaPerfPoc from "./poc/T06KonvaPerfPoc.vue";
import T07KonvaImePoc from "./poc/T07KonvaImePoc.vue";
import * as fileService from "./core/fileService";
import * as fileWatcher from "./core/fileWatcher";
import {
  createBlankProject,
  joinProjectPath,
  loadProject,
  saveProject,
} from "./core/project";
import type { Project } from "./core/schema";
import {
  initWindowGuard,
  setCloseSaveHandler,
  setWindowDirty,
} from "./core/windowGuard";
import { applyWindowTitle } from "./core/windowTitle";
import EditorCanvas from "./canvas/EditorCanvas.vue";
import type { CanvasViewState } from "./canvas/renderer";

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

function directoryBasename(path: string): string {
  const s = path.replace(/[/\\]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return (i >= 0 ? s.slice(i + 1) : s) || "Project";
}

// —— T1.6 项目 ——

const loadedProject = ref<Project | null>(null);
const projectDir = ref<string | null>(null);
const isDirty = ref(false);

/** T1.8 画布视口（来自 Konva）；无项目时为 null */
const canvasZoomPercent = ref<number | null>(null);
/** T1.9 将接入真实选中；当前供状态栏与调试 */
const selectedNodeCount = ref(0);

function onCanvasViewChange(s: CanvasViewState): void {
  canvasZoomPercent.value = s.zoomPercent;
}

const statusSelectionLabel = computed(() =>
  selectedNodeCount.value > 0 ? `已选中 ${selectedNodeCount.value}` : `选中 ${selectedNodeCount.value}`,
);

function bumpSelectedCount(delta: number): void {
  selectedNodeCount.value = Math.min(99, Math.max(0, selectedNodeCount.value + delta));
}

watch(loadedProject, (p) => {
  if (!p) {
    canvasZoomPercent.value = null;
    selectedNodeCount.value = 0;
  }
});

const showNewDialog = ref(false);
const newWizard = ref({
  dir: null as string | null,
  name: "",
  nameTouched: false,
  w: 1920,
  h: 1080,
});

function syncWindowTitleFromState(): void {
  void applyWindowTitle(loadedProject.value?.meta.name ?? null, isDirty.value);
}

function setDirty(v: boolean): void {
  isDirty.value = v;
  setWindowDirty(v);
  syncWindowTitleFromState();
}

async function performSave(): Promise<void> {
  const dir = projectDir.value;
  const p = loadedProject.value;
  if (!dir || !p) {
    await message("没有可保存的项目或目录。", { title: "LWB UI Editor", kind: "warning" });
    throw new Error("nothing to save");
  }
  await saveProject(dir, p);
  setDirty(false);
}

/** 关闭窗口时选「保存」：有项目则写盘；仅 POC dirty 则只清标记 */
async function saveForCloseGuard(): Promise<void> {
  if (loadedProject.value && projectDir.value) {
    await saveProject(projectDir.value, loadedProject.value);
    setDirty(false);
    return;
  }
  useDirtyFlag.value = false;
  setWindowDirty(false);
  void applyWindowTitle(null, false);
}

async function onSaveProject(): Promise<void> {
  try {
    await performSave();
  } catch {
    /* message 已提示 */
  }
}

async function onOpenProject(): Promise<void> {
  const dir = await fileService.pickDirectory();
  if (!dir) {
    return;
  }
  const yaml = joinProjectPath(dir, "project.yaml");
  if (!(await fileService.existsPath(yaml))) {
    await message("所选目录不包含 project.yaml。", { title: "LWB UI Editor", kind: "error" });
    return;
  }
  try {
    const { project } = await loadProject(dir);
    loadedProject.value = project;
    projectDir.value = dir;
    setDirty(false);
    log(`已打开: ${dir}`);
  } catch (e) {
    await message(String(e instanceof Error ? e.message : e), { title: "打开失败", kind: "error" });
  }
}

function openNewProjectDialog(): void {
  newWizard.value = {
    dir: null,
    name: "",
    nameTouched: false,
    w: 1920,
    h: 1080,
  };
  showNewDialog.value = true;
}

async function pickNewProjectDirectory(): Promise<void> {
  const d = await fileService.pickDirectory();
  if (!d) {
    return;
  }
  newWizard.value.dir = d;
  if (!newWizard.value.nameTouched) {
    newWizard.value.name = directoryBasename(d);
  }
}

function onNewProjectNameInput(): void {
  newWizard.value.nameTouched = true;
}

async function confirmNewProject(): Promise<void> {
  const w = newWizard.value;
  if (!w.dir) {
    await message("请选择项目目录。", { title: "新建项目", kind: "warning" });
    return;
  }
  if (!w.name.trim()) {
    await message("项目名称不能为空。", { title: "新建项目", kind: "warning" });
    return;
  }
  const yaml = joinProjectPath(w.dir, "project.yaml");
  if (await fileService.existsPath(yaml)) {
    await message("该目录下已存在 project.yaml。", { title: "新建项目", kind: "error" });
    return;
  }
  try {
    await fileService.ensureDir(joinProjectPath(w.dir, "assets"));
    const proj = createBlankProject({
      name: w.name.trim(),
      canvasWidth: w.w,
      canvasHeight: w.h,
    });
    await saveProject(w.dir, proj);
    loadedProject.value = proj;
    projectDir.value = w.dir;
    setDirty(false);
    showNewDialog.value = false;
    log(`已新建: ${w.dir}`);
  } catch (e) {
    await message(String(e instanceof Error ? e.message : e), { title: "新建失败", kind: "error" });
  }
}

function cancelNewProject(): void {
  showNewDialog.value = false;
}

function touchProjectDirtyDemo(): void {
  const p = loadedProject.value;
  if (!p) {
    void message("请先新建或打开项目。", { title: "提示", kind: "info" });
    return;
  }
  p.meta.canvasWidth += 1;
  setDirty(true);
}

function onGlobalKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    void onSaveProject();
  }
}

const statusSaveLabel = computed(() => (isDirty.value ? "● 未保存" : "已保存"));

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

/** T0.2 POC：无项目时仍可模拟窗口 dirty（仅测关闭拦截） */
function toggleDirty(): void {
  if (loadedProject.value) {
    setDirty(!isDirty.value);
    log(`项目 dirty = ${isDirty.value}`);
    return;
  }
  const next = !useDirtyFlag.value;
  useDirtyFlag.value = next;
  setWindowDirty(next);
  void applyWindowTitle(null, next);
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
  setCloseSaveHandler(saveForCloseGuard);
  window.addEventListener("keydown", onGlobalKeydown);
  void applyWindowTitle(null, false);
  void initWindowGuard().then((un) => {
    unlistenGuard = un;
  });
});

onUnmounted(() => {
  setCloseSaveHandler(null);
  window.removeEventListener("keydown", onGlobalKeydown);
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
          <span class="toolbar__hint">T1.6 项目</span>
        </div>

        <div class="toolbar__file">
          <button type="button" class="btn-sm" @click="openNewProjectDialog">新建</button>
          <button type="button" class="btn-sm" @click="onOpenProject">打开</button>
          <button type="button" class="btn-sm" :disabled="!loadedProject" @click="onSaveProject">
            保存
          </button>
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

        <main
          class="canvas"
          :class="{ 'canvas--empty': !loadedProject || !projectDir }"
          aria-label="Canvas"
        >
          <template v-if="loadedProject && projectDir">
            <div class="canvas__chrome">
              <div class="canvas__meta">
                <span class="canvas__label">{{ loadedProject.meta.name }}</span>
                <span class="canvas__hint">
                  {{ loadedProject.meta.canvasWidth }}×{{ loadedProject.meta.canvasHeight }}
                </span>
              </div>
              <p class="canvas__path">{{ projectDir }}</p>
              <button type="button" class="btn-sm canvas__demo" @click="touchProjectDirtyDemo">
                试改画布宽 +1（测未保存 *）
              </button>
            </div>
            <EditorCanvas
              class="canvas__stage"
              :project="loadedProject"
              :project-dir="projectDir!"
              @view-change="onCanvasViewChange"
            />
          </template>
          <template v-else>
            <div class="canvas__label">Canvas 画布</div>
            <p class="canvas__hint">请先使用工具栏「新建」或「打开」加载项目</p>
          </template>
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
        <span>缩放 {{ canvasZoomPercent != null ? `${canvasZoomPercent}%` : "—" }}</span>
        <span class="sep">|</span>
        <span>{{
          loadedProject
            ? `画布 ${loadedProject.meta.canvasWidth}×${loadedProject.meta.canvasHeight}`
            : "画布 —"
        }}</span>
        <span class="sep">|</span>
        <span>{{ statusSelectionLabel }}</span>
        <span class="sep">|</span>
        <span>{{ statusSaveLabel }}</span>
      </footer>

      <div v-if="showNewDialog" class="modal-overlay" role="presentation" @click.self="cancelNewProject">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="new-proj-title">
          <h2 id="new-proj-title" class="modal__title">新建项目</h2>
          <div class="modal__row">
            <span class="modal__label">目录</span>
            <div class="modal__field">
              <button type="button" class="btn-sm" @click="pickNewProjectDirectory">选择目录…</button>
              <span class="modal__path">{{ newWizard.dir ?? "未选择" }}</span>
            </div>
          </div>
          <div class="modal__row">
            <label class="modal__label" for="np-name">项目名称</label>
            <input
              id="np-name"
              v-model="newWizard.name"
              class="modal__input"
              type="text"
              autocomplete="off"
              placeholder="与目录名一致或自定义"
              @input="onNewProjectNameInput"
            />
          </div>
          <div class="modal__row modal__row--grid">
            <label class="modal__label" for="np-w">宽</label>
            <input id="np-w" v-model.number="newWizard.w" class="modal__input" type="number" min="1" />
            <label class="modal__label" for="np-h">高</label>
            <input id="np-h" v-model.number="newWizard.h" class="modal__input" type="number" min="1" />
          </div>
          <div class="modal__actions">
            <button type="button" class="btn-sm" @click="cancelNewProject">取消</button>
            <button type="button" class="btn-sm btn-sm--primary" @click="confirmNewProject">创建</button>
          </div>
        </div>
      </div>

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
          <div class="row">
            <span class="toolbar__hint">T1.8 状态栏「选中数」调试</span>
            <button type="button" @click="bumpSelectedCount(1)">+1</button>
            <button type="button" @click="bumpSelectedCount(-1)">−1</button>
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

.toolbar__file {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
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

.btn-sm:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-sm--primary {
  background: #2563eb;
  border-color: #1d4ed8;
  color: #fff;
}

.btn-sm--primary:hover {
  background: #1d4ed8;
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
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: #52525b;
  color: #e4e4e7;
  padding: 0;
}

.canvas__chrome {
  flex: none;
  padding: 0.35rem 0.5rem;
  background: #3f3f46;
  border-bottom: 1px solid #52525b;
  text-align: left;
}

.canvas__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}

.canvas__stage {
  flex: 1;
  min-height: 0;
}

.canvas__label {
  font-size: 0.95rem;
  font-weight: 600;
}

.canvas__hint {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.85;
}

.canvas__path {
  margin: 0.2rem 0 0;
  font-size: 0.7rem;
  opacity: 0.75;
  word-break: break-all;
  max-width: 100%;
}

.canvas__demo {
  margin-top: 0.35rem;
}

.canvas--empty {
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1rem;
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

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal {
  width: 100%;
  max-width: 420px;
  background: #fafafa;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  padding: 1rem 1.1rem;
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.2);
}

.modal__title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 700;
  color: #18181b;
}

.modal__row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.65rem;
}

.modal__row--grid {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr;
  align-items: center;
  gap: 0.35rem 0.5rem;
}

.modal__label {
  font-size: 0.8rem;
  color: #52525b;
}

.modal__field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.modal__path {
  font-size: 0.75rem;
  color: #3f3f46;
  word-break: break-all;
}

.modal__input {
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  border: 1px solid #d4d4d8;
  border-radius: 4px;
  width: 100%;
  box-sizing: border-box;
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.75rem;
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
