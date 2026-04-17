import { describe, it, expect } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import T07KonvaImePoc from "./T07KonvaImePoc.vue";

describe("T0.7 中文 IME POC", () => {
  it("组合输入期间按 Delete 不增加画布删除计数（对齐 tasks 用例 1）", async () => {
    const host = document.createElement("div");
    host.style.width = "900px";
    host.style.height = "800px";
    document.body.appendChild(host);
    const wrapper = mount(T07KonvaImePoc, { attachTo: host });
    await flushPromises();
    await nextTick();
    const input = wrapper.find(".t07-input");
    await input.trigger("focus");
    await input.trigger("compositionstart");
    input.element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
    );
    expect(wrapper.find('[data-testid="t07-delete-count"]').text()).toBe("0");
    wrapper.unmount();
    host.remove();
  });

  it("焦点在普通 input 且非组合时，Delete 仍不增加画布删除计数", async () => {
    const host = document.createElement("div");
    host.style.width = "900px";
    host.style.height = "800px";
    document.body.appendChild(host);
    const wrapper = mount(T07KonvaImePoc, { attachTo: host });
    await flushPromises();
    await nextTick();
    const input = wrapper.find(".t07-input");
    await input.trigger("focus");
    input.element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }),
    );
    expect(wrapper.find('[data-testid="t07-delete-count"]').text()).toBe("0");
    wrapper.unmount();
    host.remove();
  });

  it("Konva Text 内联编辑 Enter 确认后文案包含输入（对齐 tasks 用例 2）", async () => {
    const host = document.createElement("div");
    host.style.width = "900px";
    host.style.height = "800px";
    document.body.appendChild(host);
    const wrapper = mount(T07KonvaImePoc, { attachTo: host });
    await flushPromises();
    await nextTick();
    await new Promise<void>((r) => setTimeout(r, 40));
    const vm = wrapper.vm as {
      openEditorForTest?: () => void;
      getKonvaTextForTest?: () => string;
    };
    vm.openEditorForTest?.();
    await flushPromises();
    await nextTick();
    const ta = wrapper.find("textarea.t07-inline");
    expect(ta.exists()).toBe(true);
    const te = ta.element as HTMLTextAreaElement;
    te.value = "你好";
    await ta.trigger("input");
    await ta.trigger("keydown", { key: "Enter" });
    await nextTick();
    expect(vm.getKonvaTextForTest?.()).toBe("你好");
    wrapper.unmount();
    host.remove();
  });
});
