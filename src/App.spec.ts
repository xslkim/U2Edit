import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import App from "./App.vue";

describe("App", () => {
  it("shows LWB UI Editor placeholder", () => {
    const wrapper = mount(App);
    expect(wrapper.text()).toContain("LWB UI Editor");
  });
});
