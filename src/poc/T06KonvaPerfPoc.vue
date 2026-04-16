<script setup lang="ts">
import Konva from "konva";
import { onMounted, onUnmounted, ref, shallowRef } from "vue";

const hostRef = ref<HTMLDivElement | null>(null);
const fps = ref(0);
const initialRenderMs = ref<number | null>(null);

const stageRef = shallowRef<Konva.Stage | null>(null);
let removeResize: (() => void) | undefined;
let rafId = 0;
let fpsFrames = 0;
let fpsLast = performance.now();

function measureFps(now: number): void {
  fpsFrames += 1;
  const elapsed = now - fpsLast;
  if (elapsed >= 1000) {
    fps.value = Math.round((fpsFrames * 1000) / elapsed);
    fpsFrames = 0;
    fpsLast = now;
  }
  rafId = requestAnimationFrame(measureFps);
}

function attachWheelZoom(stage: Konva.Stage): void {
  stage.on("wheel", (e) => {
    e.evt.preventDefault();
    const scaleBy = 1.05;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clamped = Math.max(0.05, Math.min(8, newScale));

    stage.scale({ x: clamped, y: clamped });

    const newPos = {
      x: pointer.x - mousePointTo.x * clamped,
      y: pointer.y - mousePointTo.y * clamped,
    };
    stage.position(newPos);
  });
}

function randomRects(
  layer: Konva.Layer,
  width: number,
  height: number,
  count: number,
): void {
  const rand = (max: number): number => Math.random() * max;
  for (let i = 0; i < count; i += 1) {
    const w = 20 + rand(80);
    const h = 20 + rand(60);
    const rect = new Konva.Rect({
      x: rand(Math.max(8, width - w - 8)),
      y: rand(Math.max(8, height - h - 8)),
      width: w,
      height: h,
      fill: `hsl(${Math.floor(rand(360))}, 78%, 58%)`,
      stroke: "#27272a",
      strokeWidth: 1,
      draggable: true,
    });
    layer.add(rect);
  }
}

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

  const t0 = performance.now();
  randomRects(layer, width, height, 300);
  layer.batchDraw();
  initialRenderMs.value = Math.round(performance.now() - t0);

  attachWheelZoom(stage);
  stageRef.value = stage;

  const onResize = (): void => {
    if (!hostRef.value) {
      return;
    }
    stage.width(hostRef.value.clientWidth);
    stage.height(hostRef.value.clientHeight);
    layer.batchDraw();
  };
  window.addEventListener("resize", onResize);
  removeResize = (): void => {
    window.removeEventListener("resize", onResize);
  };
}

onMounted(() => {
  mountStage();
  rafId = requestAnimationFrame(measureFps);
});

onUnmounted(() => {
  cancelAnimationFrame(rafId);
  removeResize?.();
  removeResize = undefined;
  stageRef.value?.destroy();
  stageRef.value = null;
});
</script>

<template>
  <div class="t06-root">
    <div ref="hostRef" class="t06-stage-host" />
    <div class="t06-hud">
      <div class="t06-fps" data-testid="t06-fps">FPS {{ fps }}</div>
      <div
        v-if="initialRenderMs !== null"
        class="t06-meta"
        data-testid="t06-initial-ms"
        :data-ms="initialRenderMs"
      >
        首帧 300 节点耗时 {{ initialRenderMs }} ms（目标 &lt; 500ms）
      </div>
    </div>
  </div>
</template>

<style scoped>
.t06-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1;
  background: #e4e4e7;
}

.t06-stage-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.t06-hud {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  text-align: right;
  pointer-events: none;
  font-family: system-ui, sans-serif;
  z-index: 2;
}

.t06-fps {
  font-weight: 600;
  font-size: 0.95rem;
  color: #18181b;
  text-shadow: 0 0 4px #fafafa;
}

.t06-meta {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #3f3f46;
  max-width: 16rem;
}
</style>
