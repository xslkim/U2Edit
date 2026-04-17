<script setup lang="ts">
import { confirm, message } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { computed, ref, watch } from "vue";
import * as fileService from "../core/fileService";
import {
  formatValidationErrors,
  joinProjectPath,
  saveProject,
  validate,
} from "../core/project";
import type { Project } from "../core/schema";
import { generateUnityScript } from "../export/unity";

const props = defineProps<{
  open: boolean;
  project: Project;
  projectDir: string;
}>();

const emit = defineEmits<{
  "update:open": [boolean];
  /** YAML 已因导出而保存，父组件可将脏标记清零 */
  persisted: [];
}>();

const step = ref<"edit" | "success">("edit");

const assetRootPath = ref("");
const defaultFont = ref("");
const fontSizeScale = ref(1);
const refW = ref(1920);
const refH = ref(1080);
const screenMatchMode = ref(0.5);

const exportTargetPath = ref<string | null>(null);
const successPath = ref("");

function safeFileStem(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "LWB_UI";
}

function syncFormFromProject(): void {
  const u = props.project.export.unity;
  assetRootPath.value = u.assetRootPath;
  defaultFont.value = u.defaultFont;
  fontSizeScale.value = u.fontSizeScale;
  refW.value = u.referenceResolution[0];
  refH.value = u.referenceResolution[1];
  screenMatchMode.value = u.screenMatchMode;
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      step.value = "edit";
      successPath.value = "";
      syncFormFromProject();
    }
  },
);

const defaultCsName = computed(() => `${safeFileStem(props.project.meta.name)}_LwbUiImport.cs`);

const pathHint = computed(() => exportTargetPath.value ?? "未选择");

function close(): void {
  emit("update:open", false);
}

async function pickLocation(): Promise<void> {
  const stem = safeFileStem(props.project.meta.name);
  const suggested = joinProjectPath(props.projectDir, `${stem}_LwbUiImport.cs`);
  const p = await fileService.pickSaveCsFile(suggested);
  exportTargetPath.value = p;
}

async function runExport(): Promise<void> {
  if (!exportTargetPath.value) {
    await message("请先点击「选择导出位置」指定 .cs 文件路径。", {
      title: "Unity 导出",
      kind: "warning",
    });
    return;
  }

  const w = Math.round(Number(refW.value));
  const h = Math.round(Number(refH.value));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    await message("参考分辨率宽高须为 ≥1 的整数。", { title: "Unity 导出", kind: "warning" });
    return;
  }

  const fs = Number(fontSizeScale.value);
  const sm = Number(screenMatchMode.value);
  if (!Number.isFinite(fs) || !Number.isFinite(sm)) {
    await message("字号缩放与 Match 须为有效数字。", { title: "Unity 导出", kind: "warning" });
    return;
  }

  props.project.export.unity = {
    ...props.project.export.unity,
    assetRootPath: assetRootPath.value.trim(),
    defaultFont: defaultFont.value.trim(),
    fontSizeScale: fs,
    referenceResolution: [w, h],
    screenMatchMode: sm,
  };

  const errs = validate(props.project);
  if (errs.length > 0) {
    await message(formatValidationErrors(errs), { title: "校验未通过", kind: "error" });
    return;
  }

  const target = exportTargetPath.value;
  if (await fileService.existsPath(target)) {
    const ok = await confirm("目标文件已存在，是否覆盖？", {
      title: "确认覆盖",
      kind: "warning",
    });
    if (!ok) {
      return;
    }
  }

  await saveProject(props.projectDir, props.project);
  emit("persisted");

  const cs = generateUnityScript(props.project, props.project.export, props.projectDir);
  await fileService.writeText(target, cs);

  successPath.value = target;
  step.value = "success";
}

async function onRevealFolder(): Promise<void> {
  try {
    await revealItemInDir(successPath.value);
  } catch (e) {
    await message(e instanceof Error ? e.message : String(e), {
      title: "无法打开资源管理器",
      kind: "error",
    });
  }
}

function finishSuccess(): void {
  close();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="unity-exp-overlay"
      role="presentation"
      @click.self="step === 'edit' ? close() : undefined"
    >
      <div
        class="unity-exp-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="step === 'edit' ? 'unity-exp-title' : 'unity-exp-ok-title'"
        @click.stop
      >
        <template v-if="step === 'edit'">
          <h2 id="unity-exp-title" class="unity-exp-modal__title">Unity 导出</h2>
          <p class="unity-exp-modal__hint">
            配置将写入 <code>project.yaml</code> 的 <code>export.unity</code>（不含
            <code>sourceAssetPath</code>，导出时由编辑器注入项目 <code>assets</code> 绝对路径）。
          </p>

          <label class="unity-exp-row">
            <span class="unity-exp-label">Unity 资源根路径 assetRootPath</span>
            <input v-model="assetRootPath" class="unity-exp-input" type="text" autocomplete="off" />
          </label>
          <label class="unity-exp-row">
            <span class="unity-exp-label">TMP 字体资源 defaultFont</span>
            <input v-model="defaultFont" class="unity-exp-input" type="text" autocomplete="off" />
          </label>
          <label class="unity-exp-row">
            <span class="unity-exp-label">字号缩放 fontSizeScale</span>
            <input
              v-model.number="fontSizeScale"
              class="unity-exp-input unity-exp-input--narrow"
              type="number"
              step="0.05"
              min="0.1"
            />
          </label>
          <div class="unity-exp-row unity-exp-row--grid">
            <span class="unity-exp-label">参考分辨率 referenceResolution</span>
            <input v-model.number="refW" class="unity-exp-input" type="number" min="1" />
            <span class="unity-exp-cross">×</span>
            <input v-model.number="refH" class="unity-exp-input" type="number" min="1" />
          </div>
          <label class="unity-exp-row">
            <span class="unity-exp-label">Canvas Scaler Match (0–1)</span>
            <input
              v-model.number="screenMatchMode"
              class="unity-exp-input unity-exp-input--narrow"
              type="number"
              step="0.05"
              min="0"
              max="1"
            />
          </label>

          <div class="unity-exp-row">
            <span class="unity-exp-label">导出文件</span>
            <div class="unity-exp-pathline">
              <button type="button" class="unity-exp-btn" @click="pickLocation">选择导出位置</button>
              <span class="unity-exp-path" :title="pathHint">{{ pathHint }}</span>
            </div>
            <span class="unity-exp-sub">建议文件名：{{ defaultCsName }}</span>
          </div>

          <div class="unity-exp-actions">
            <button type="button" class="unity-exp-btn" @click="close">取消</button>
            <button type="button" class="unity-exp-btn unity-exp-btn--primary" @click="runExport">
              导出
            </button>
          </div>
        </template>

        <template v-else>
          <h2 id="unity-exp-ok-title" class="unity-exp-modal__title">导出成功</h2>
          <p class="unity-exp-modal__hint">已写入 C# Editor 脚本：</p>
          <pre class="unity-exp-pre">{{ successPath }}</pre>
          <p class="unity-exp-modal__hint">
            使用说明：将本脚本放入 Unity 工程中的 <code>Editor</code> 文件夹（例如
            <code>Assets/Editor/</code>），在 Unity 菜单栏选择对应「LWB UI/导入…」菜单项运行，即可生成
            Prefab。
          </p>
          <div class="unity-exp-actions">
            <button type="button" class="unity-exp-btn" @click="onRevealFolder">打开所在文件夹</button>
            <button type="button" class="unity-exp-btn unity-exp-btn--primary" @click="finishSuccess">
              确定
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.unity-exp-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 1rem;
}

.unity-exp-modal {
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow: auto;
  background: #fafafa;
  border: 1px solid #d4d4d8;
  border-radius: 8px;
  padding: 1rem 1.1rem;
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.2);
}

.unity-exp-modal__title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  color: #18181b;
}

.unity-exp-modal__hint {
  margin: 0 0 0.75rem;
  font-size: 0.78rem;
  color: #52525b;
  line-height: 1.45;
}

.unity-exp-modal__hint code {
  font-size: 0.72rem;
  background: #e4e4e7;
  padding: 0.05rem 0.25rem;
  border-radius: 3px;
}

.unity-exp-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.6rem;
}

.unity-exp-row--grid {
  display: grid;
  grid-template-columns: 1fr 1fr auto 1fr;
  align-items: center;
  gap: 0.35rem;
}

.unity-exp-label {
  font-size: 0.78rem;
  color: #52525b;
}

.unity-exp-input {
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  border: 1px solid #d4d4d8;
  border-radius: 4px;
  width: 100%;
  box-sizing: border-box;
}

.unity-exp-input--narrow {
  max-width: 8rem;
}

.unity-exp-cross {
  text-align: center;
  color: #71717a;
  font-size: 0.85rem;
}

.unity-exp-pathline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.unity-exp-path {
  font-size: 0.72rem;
  color: #3f3f46;
  word-break: break-all;
  flex: 1;
  min-width: 0;
}

.unity-exp-sub {
  font-size: 0.7rem;
  color: #a1a1aa;
}

.unity-exp-pre {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.55rem;
  font-size: 0.72rem;
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
}

.unity-exp-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.unity-exp-btn {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid #d4d4d8;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #18181b;
}

.unity-exp-btn:hover {
  background: #f4f4f5;
  border-color: #a1a1aa;
}

.unity-exp-btn--primary {
  background: #2563eb;
  border-color: #1d4ed8;
  color: #fff;
}

.unity-exp-btn--primary:hover {
  background: #1d4ed8;
  border-color: #1e40af;
}
</style>
