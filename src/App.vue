<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import T06KonvaPerfPoc from "./poc/T06KonvaPerfPoc.vue";
import * as fileService from "./core/fileService";
import * as fileWatcher from "./core/fileWatcher";
import { initWindowGuard, setWindowDirty } from "./core/windowGuard";

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

const view = ref<"main" | "t06">("main");

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

onMounted(() => {
  void initWindowGuard().then((un) => {
    unlistenGuard = un;
  });
});

onUnmounted(() => {
  unlistenGuard?.();
});
</script>

<template>
  <main class="app-root" :class="{ 'app-root--poc': view !== 'main' }">
    <div v-if="view === 't06'" class="poc-shell">
      <header class="poc-bar">
        <button type="button" class="linkish" @click="view = 'main'">← 返回主 POC</button>
        <span class="poc-title">T0.6 Konva 性能 POC</span>
      </header>
      <T06KonvaPerfPoc class="poc-canvas" />
    </div>

    <div v-else class="panel">
      <h1 class="title">LWB UI Editor</h1>
      <p class="hint">T0.2 / T0.3 POC：文件、关闭拦截、监听</p>

      <div class="row">
        <button type="button" @click="view = 't06'">打开 T0.6 Konva 性能 POC</button>
      </div>

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
        <button type="button" @click="toggleDirty">切换 dirty（模拟未保存）</button>
        <button type="button" @click="toggleWatch">{{ watching ? "停止监听" : "监听" }} test.yaml</button>
      </div>

      <pre class="log">{{ logLines.join("\n") || "日志…" }}</pre>
    </div>
  </main>
</template>

<style scoped>
.app-root {
  margin: 0;
  min-height: 100vh;
  padding: 1rem;
  box-sizing: border-box;
  font-family: system-ui, sans-serif;
  background: #f4f4f5;
}

.app-root--poc {
  padding: 0;
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

.panel {
  max-width: 720px;
  margin: 0 auto;
  background: #fff;
  border-radius: 8px;
  padding: 1rem 1.25rem;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}

.title {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}

.hint {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: #52525b;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

button {
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.path {
  font-size: 0.8rem;
  color: #3f3f46;
  word-break: break-all;
}

.log {
  margin: 0.5rem 0 0;
  padding: 0.75rem;
  background: #18181b;
  color: #e4e4e7;
  font-size: 0.75rem;
  border-radius: 6px;
  min-height: 120px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
