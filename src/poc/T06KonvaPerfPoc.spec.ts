import { describe, it, expect } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import Konva from "konva";
import { nextTick } from "vue";
import T06KonvaPerfPoc from "./T06KonvaPerfPoc.vue";

/**
 * 与页面内 `randomRects` + `batchDraw` 等价的纯 Konva 耗时（不经过 Vue）。
 * tasks.md 目标 &lt; 500ms；单测环境（happy-dom）与实机差异大，用 2000ms 作回归上限。
 */
function measureThreeHundredRectsBatchDraw(width: number, height: number): number {
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  document.body.appendChild(container);
  const stage = new Konva.Stage({ container, width, height });
  const layer = new Konva.Layer();
  stage.add(layer);
  const rand = (max: number): number => Math.random() * max;
  const t0 = performance.now();
  for (let i = 0; i < 300; i += 1) {
    const w = 20 + rand(80);
    const h = 20 + rand(60);
    layer.add(
      new Konva.Rect({
        x: rand(Math.max(8, width - w - 8)),
        y: rand(Math.max(8, height - h - 8)),
        width: w,
        height: h,
        fill: "hsl(180, 78%, 58%)",
      }),
    );
  }
  layer.batchDraw();
  const ms = performance.now() - t0;
  stage.destroy();
  container.remove();
  return ms;
}

describe("T0.6 Konva 性能 POC", () => {
  it("300 个 Rect 的 batchDraw 在单测预算内（对齐 tasks 用例 1）", () => {
    const ms = measureThreeHundredRectsBatchDraw(800, 600);
    expect(ms).toBeLessThan(2000);
  });

  it("挂载 POC 后展示首帧耗时，且 data-ms 在单测预算内", async () => {
    const host = document.createElement("div");
    host.style.width = "800px";
    host.style.height = "600px";
    document.body.appendChild(host);
    const wrapper = mount(T06KonvaPerfPoc, { attachTo: host });
    await flushPromises();
    await nextTick();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 80);
    });
    const el = wrapper.find('[data-testid="t06-initial-ms"]');
    expect(el.exists()).toBe(true);
    const ms = Number(el.attributes("data-ms"));
    expect(Number.isFinite(ms)).toBe(true);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(2000);
    wrapper.unmount();
    host.remove();
  });

  it("滚轮缩放后 stage 缩放发生变化（对齐 tasks 用例 3 的交互路径）", () => {
    const container = document.createElement("div");
    container.style.width = "400px";
    container.style.height = "300px";
    document.body.appendChild(container);
    const stage = new Konva.Stage({ container, width: 400, height: 300 });
    const layer = new Konva.Layer();
    stage.add(layer);
    layer.add(new Konva.Rect({ x: 0, y: 0, width: 50, height: 50, fill: "red" }));
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
    const before = stage.scaleX();
    stage.getPointerPosition = (): { x: number; y: number } => ({ x: 120, y: 100 });
    stage.fire("wheel", {
      evt: { preventDefault: () => undefined, deltaY: -1 },
    } as Konva.KonvaEventObject<WheelEvent>);
    expect(stage.scaleX()).not.toBe(before);
    stage.destroy();
    container.remove();
  });
});
