import { describe, it, expect } from "vitest";
import {
  createDefaultButton,
  createDefaultImage,
  createDefaultInputField,
  createDefaultPanel,
  createDefaultSlider,
  createDefaultText,
  createDefaultToggle,
  CURRENT_SCHEMA_VERSION,
} from "./schema";

describe("T1.1 schema 默认值", () => {
  it("createDefaultImage 符合 tasks.md 用例 1", () => {
    const n = createDefaultImage();
    expect(n.width).toBe(100);
    expect(n.height).toBe(100);
    expect(n.pivot).toBe("topLeft");
    expect(n.visible).toBe(true);
    expect(n.opacity).toBe(1.0);
    expect(n.tint).toBe("#FFFFFF");
    expect(n.assetId).toBeNull();
  });

  it("7 种节点工厂均有 type 且数值符合 requirements §2.6.2", () => {
    expect(createDefaultImage().type).toBe("image");
    expect(createDefaultText().type).toBe("text");
    expect(createDefaultButton().type).toBe("button");
    expect(createDefaultPanel().type).toBe("panel");
    expect(createDefaultSlider().type).toBe("slider");
    expect(createDefaultToggle().type).toBe("toggle");
    expect(createDefaultInputField().type).toBe("inputField");

    expect(createDefaultText().width).toBe(200);
    expect(createDefaultText().height).toBe(40);
    expect(createDefaultText().content).toBe("Text");
    expect(createDefaultText().fontSize).toBe(24);

    expect(createDefaultButton().width).toBe(200);
    expect(createDefaultButton().height).toBe(60);
    expect(createDefaultButton().background).toBeNull();
    expect(createDefaultButton().label.content).toBe("Button");
    expect(createDefaultButton().children).toEqual([]);

    expect(createDefaultPanel().width).toBe(300);
    expect(createDefaultPanel().height).toBe(200);
    expect(createDefaultPanel().background).toBeNull();

    expect(createDefaultSlider().direction).toBe("horizontal");
    expect(createDefaultSlider().defaultValue).toBe(0.5);
    expect(createDefaultSlider().trackImage).toBeNull();
    expect(createDefaultSlider().fillImage).toBeNull();
    expect(createDefaultSlider().thumbImage).toBeNull();

    expect(createDefaultToggle().defaultOn).toBe(false);
    expect(createDefaultToggle().label.content).toBe("Toggle");

    expect(createDefaultInputField().placeholder.content).toBe("Enter text...");
    expect(createDefaultInputField().text.content).toBe("");
  });

  it("CURRENT_SCHEMA_VERSION", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it("ImageNode 不应有 content 字段（运行时形状）", () => {
    const img = createDefaultImage();
    expect("content" in img).toBe(false);
  });
});
