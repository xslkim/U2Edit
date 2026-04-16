import { describe, expect, it } from "vitest";
import { SelectionStore } from "./selection";

describe("SelectionStore", () => {
  it("toggle add/remove", () => {
    const s = new SelectionStore();
    s.toggle("a");
    expect(s.has("a")).toBe(true);
    s.toggle("a");
    expect(s.has("a")).toBe(false);
  });

  it("setAll replaces", () => {
    const s = new SelectionStore();
    s.selectOnly("x");
    s.setAll(new Set(["a", "b"]));
    expect(s.size).toBe(2);
    expect(s.has("a")).toBe(true);
  });
});
