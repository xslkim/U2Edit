import {
  CompositeCommand,
  findNode,
  PatchNodeCommand,
  RemoveAssetCommand,
  type Command,
} from "./history";
import type { Node, Project } from "./schema";

/** 列出引用某 assetId 的节点（用于删除前提示） */
export function listNodesReferencingAsset(
  project: Project,
  assetId: string,
): { nodeId: string; label: string }[] {
  const out: { nodeId: string; label: string }[] = [];
  const seen = new Set<string>();

  function push(id: string, name: string): void {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    out.push({ nodeId: id, label: `${name} (${id})` });
  }

  function checkTintRef(
    id: string,
    name: string,
    ref: { assetId: string | null } | null | undefined,
  ): void {
    if (ref?.assetId === assetId) {
      push(id, name);
    }
  }

  function walk(n: Node): void {
    switch (n.type) {
      case "image":
        if (n.assetId === assetId) {
          push(n.id, n.name);
        }
        break;
      case "panel":
      case "button":
        checkTintRef(n.id, n.name, n.background);
        break;
      case "slider":
        checkTintRef(n.id, n.name, n.trackImage);
        checkTintRef(n.id, n.name, n.fillImage);
        checkTintRef(n.id, n.name, n.thumbImage);
        break;
      case "toggle":
        checkTintRef(n.id, n.name, n.background);
        checkTintRef(n.id, n.name, n.checkmark);
        break;
      case "inputField":
        checkTintRef(n.id, n.name, n.background);
        break;
      default:
        break;
    }
    if ("children" in n && n.children.length) {
      for (const c of n.children) {
        walk(c);
      }
    }
  }

  const root = project.nodes[0];
  if (root) {
    walk(root);
  }
  return out;
}

/**
 * 生成清除某资源引用的浅层 patch（与 PatchNodeCommand 兼容）。
 * 仅当节点确实引用该 assetId 时返回非 null。
 */
export function patchClearAssetRefFromNode(node: Node, assetId: string): Record<string, unknown> | null {
  switch (node.type) {
    case "image":
      if (node.assetId === assetId) {
        return { assetId: null };
      }
      return null;
    case "panel":
    case "button": {
      const bg = node.background;
      if (bg?.assetId === assetId) {
        return { background: { ...bg, assetId: null } };
      }
      return null;
    }
    case "slider": {
      const patch: Record<string, unknown> = {};
      if (node.trackImage?.assetId === assetId) {
        patch.trackImage = { ...node.trackImage, assetId: null };
      }
      if (node.fillImage?.assetId === assetId) {
        patch.fillImage = { ...node.fillImage, assetId: null };
      }
      if (node.thumbImage?.assetId === assetId) {
        patch.thumbImage = { ...node.thumbImage, assetId: null };
      }
      return Object.keys(patch).length ? patch : null;
    }
    case "toggle": {
      const patch: Record<string, unknown> = {};
      if (node.background?.assetId === assetId) {
        patch.background = { ...node.background, assetId: null };
      }
      if (node.checkmark?.assetId === assetId) {
        patch.checkmark = { ...node.checkmark, assetId: null };
      }
      return Object.keys(patch).length ? patch : null;
    }
    case "inputField": {
      const bg = node.background;
      if (bg?.assetId === assetId) {
        return { background: { ...bg, assetId: null } };
      }
      return null;
    }
    default:
      return null;
  }
}

/** 遍历节点树，收集需清除某 assetId 的 PatchNodeCommand 数据 */
export function collectAssetRefPatches(
  project: Project,
  assetId: string,
): { nodeId: string; patch: Record<string, unknown> }[] {
  const acc: { nodeId: string; patch: Record<string, unknown> }[] = [];

  function walk(n: Node): void {
    const p = patchClearAssetRefFromNode(n, assetId);
    if (p) {
      acc.push({ nodeId: n.id, patch: p });
    }
    if ("children" in n && n.children.length) {
      for (const c of n.children) {
        walk(c);
      }
    }
  }

  const root = project.nodes[0];
  if (root) {
    walk(root);
  }
  return acc;
}

/**
 * 删除资源：先清除节点引用，再 RemoveAsset；单条 Composite 入栈。
 */
export function makeRemoveAssetWithRefClearsCommand(project: Project, assetId: string): Command {
  const patches = collectAssetRefPatches(project, assetId);
  const cmds: Command[] = [];
  for (const { nodeId, patch } of patches) {
    const f = findNode(project, nodeId);
    if (!f) {
      continue;
    }
    cmds.push(new PatchNodeCommand(project, nodeId, patch, "清除资源引用", structuredClone(f.node)));
  }
  cmds.push(new RemoveAssetCommand(project, assetId, "删除资源"));
  if (cmds.length === 1) {
    return cmds[0];
  }
  return new CompositeCommand(cmds, "删除资源");
}
