import { describe, expect, it } from "vitest";
import {
  parseHexColor,
  rgbToHsv,
  rgbaFromHsv,
  rgbaToHex,
  hsvToRgb,
} from "./colorFormat";

describe("parseHexColor", () => {
  it("parses #RGB", () => {
    expect(parseHexColor("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });
  it("parses #RRGGBB", () => {
    expect(parseHexColor("#FF8040")).toEqual({ r: 255, g: 128, b: 64, a: 1 });
  });
  it("parses #RRGGBBAA", () => {
    const c = parseHexColor("#FF000080");
    expect(c?.r).toBe(255);
    expect(c?.g).toBe(0);
    expect(c?.b).toBe(0);
    expect(c?.a).toBeCloseTo(128 / 255, 5);
  });
  it("rejects invalid", () => {
    expect(parseHexColor("#xyz")).toBeNull();
    expect(parseHexColor("ff0000")).toBeNull();
  });
});

describe("rgbaToHex", () => {
  it("round-trips opaque", () => {
    const h = rgbaToHex({ r: 10, g: 20, b: 30, a: 1 });
    expect(h).toBe("#0A141E");
    expect(parseHexColor(h)).toEqual({ r: 10, g: 20, b: 30, a: 1 });
  });
});

describe("hsv round-trip", () => {
  it("rgb → hsv → rgb approx", () => {
    const { r, g, b } = hsvToRgb(120, 0.5, 0.8);
    const hsv = rgbToHsv(r, g, b);
    const { r: r2, g: g2, b: b2 } = hsvToRgb(hsv.h, hsv.s, hsv.v);
    expect(r2).toBe(r);
    expect(g2).toBe(g);
    expect(b2).toBe(b);
  });
  it("rgbaFromHsv includes alpha", () => {
    const c = rgbaFromHsv(0, 1, 1, 0.5);
    expect(rgbaToHex(c).length).toBe(9);
  });
});
