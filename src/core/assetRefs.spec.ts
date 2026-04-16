import { describe, expect, it } from "vitest";
import { createBlankProject } from "./project";
import { createDefaultImage } from "./schema";
import {
  collectAssetRefPatches,
  listNodesReferencingAsset,
  patchClearAssetRefFromNode,
} from "./assetRefs";

describe("listNodesReferencingAsset", () => {
  it("finds image node by assetId", () => {
    const p = createBlankProject({ name: "t", canvasWidth: 100, canvasHeight: 100 });
    const img = createDefaultImage({ id: "i1", assetId: "tex" });
    p.nodes[0].children.push(img);
    const refs = listNodesReferencingAsset(p, "tex");
    expect(refs.map((r) => r.nodeId)).toEqual(["i1"]);
  });
});

describe("patchClearAssetRefFromNode", () => {
  it("clears image assetId", () => {
    const img = createDefaultImage({ id: "i1", assetId: "a" });
    const patch = patchClearAssetRefFromNode(img, "a");
    expect(patch).toEqual({ assetId: null });
  });
});

describe("collectAssetRefPatches", () => {
  it("returns patches for matching nodes", () => {
    const p = createBlankProject({ name: "t", canvasWidth: 100, canvasHeight: 100 });
    const img = createDefaultImage({ id: "i1", assetId: "x" });
    p.nodes[0].children.push(img);
    const patches = collectAssetRefPatches(p, "x");
    expect(patches.length).toBe(1);
    expect(patches[0].nodeId).toBe("i1");
  });
});
