import type { AssetRef, Node, PanelNode, Project } from "./schema";

/** 仅 button 与 panel 带子节点 */
export type ButtonNodeParent = Extract<Node, { type: "button" }>;

/** 单条可撤销操作 */
export interface Command {
  do(): void;
  undo(): void;
  label: string;
}

const DEFAULT_CAPACITY = 100;

export class HistoryStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private readonly cap: number;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    if (capacity < 1) {
      throw new Error("HistoryStack: capacity 须 ≥ 1");
    }
    this.cap = capacity;
  }

  /** 当前 undo 栈深度（与 tasks 中 stack.length 对齐） */
  get length(): number {
    return this.undoStack.length;
  }

  get capacity(): number {
    return this.cap;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  push(cmd: Command): void {
    cmd.do();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.cap) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) {
      return false;
    }
    cmd.undo();
    this.redoStack.push(cmd);
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) {
      return false;
    }
    cmd.do();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.cap) {
      this.undoStack.shift();
    }
    return true;
  }
}

// —— 树定位 ——

export interface FoundNode {
  node: Node;
  parent: PanelNode | ButtonNodeParent | null;
  list: Node[];
  index: number;
}

function isParentWithChildren(n: Node): n is PanelNode | ButtonNodeParent {
  return n.type === "panel" || n.type === "button";
}

export function findNode(project: Project, id: string): FoundNode | null {
  function walk(list: Node[], parent: PanelNode | ButtonNodeParent | null): FoundNode | null {
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (node.id === id) {
        return { node, parent, list, index: i };
      }
      if (isParentWithChildren(node)) {
        const hit = walk(node.children, node);
        if (hit) {
          return hit;
        }
      }
    }
    return null;
  }
  return walk(project.nodes, null);
}

export function getChildList(project: Project, parentId: string | null): Node[] {
  if (parentId === null) {
    return project.nodes;
  }
  const f = findNode(project, parentId);
  if (!f) {
    throw new Error(`getChildList: 找不到父节点 ${parentId}`);
  }
  if (!isParentWithChildren(f.node)) {
    throw new Error(`getChildList: 节点 ${parentId} 无 children`);
  }
  return f.node.children;
}

function moveIndex(list: Node[], from: number, to: number): void {
  if (from === to) {
    return;
  }
  if (from < 0 || from >= list.length || to < 0 || to > list.length) {
    throw new Error("moveIndex: 索引越界");
  }
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
}

function applyNodePatch(node: Node, patch: Record<string, unknown>): void {
  const rec = node as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    rec[k] = v;
  }
}

/**
 * 就地修改节点字段（不含跨类型替换）；`patch` 为顶层字段的浅合并。
 * `beforeSnapshot`：拖拽等场景下在变更前传入，用于一次撤销回到拖拽前（T1.11）。
 */
export class PatchNodeCommand implements Command {
  private readonly before: Node;

  constructor(
    private readonly project: Project,
    private readonly nodeId: string,
    private readonly patch: Record<string, unknown>,
    public label: string,
    beforeSnapshot?: Node,
  ) {
    const f = findNode(project, nodeId);
    if (!f) {
      throw new Error(`PatchNodeCommand: 找不到节点 ${nodeId}`);
    }
    this.before = beforeSnapshot ? structuredClone(beforeSnapshot) : structuredClone(f.node);
  }

  do(): void {
    const f = findNode(this.project, this.nodeId);
    if (!f) {
      throw new Error(`PatchNodeCommand.do: 找不到节点 ${this.nodeId}`);
    }
    applyNodePatch(f.node, this.patch);
  }

  undo(): void {
    const f = findNode(this.project, this.nodeId);
    if (!f) {
      throw new Error(`PatchNodeCommand.undo: 找不到节点 ${this.nodeId}`);
    }
    f.list[f.index] = structuredClone(this.before);
  }
}

/** 多条子命令一次入栈（如多选改同一属性），undo 按逆序 */
export class CompositeCommand implements Command {
  constructor(
    private readonly cmds: Command[],
    public label: string,
  ) {
    if (cmds.length === 0) {
      throw new Error("CompositeCommand: 至少 1 条子命令");
    }
  }

  do(): void {
    for (const c of this.cmds) {
      c.do();
    }
  }

  undo(): void {
    for (let i = this.cmds.length - 1; i >= 0; i--) {
      this.cmds[i].undo();
    }
  }
}

/** `parentId === null` 表示根 `project.nodes` */
export class AddNodeCommand implements Command {
  constructor(
    private readonly project: Project,
    private readonly parentId: string | null,
    private readonly index: number,
    private readonly node: Node,
    public label: string,
  ) {}

  do(): void {
    const list = getChildList(this.project, this.parentId);
    list.splice(this.index, 0, structuredClone(this.node));
  }

  undo(): void {
    const list = getChildList(this.project, this.parentId);
    const [removed] = list.splice(this.index, 1);
    if (!removed || removed.id !== this.node.id) {
      throw new Error("AddNodeCommand.undo: 与预期不一致");
    }
  }
}

export class RemoveNodeCommand implements Command {
  private readonly snapshot: Node;
  private readonly parentId: string | null;
  private readonly index: number;

  constructor(
    private readonly project: Project,
    private readonly nodeId: string,
    public label: string,
  ) {
    const f = findNode(project, nodeId);
    if (!f) {
      throw new Error(`RemoveNodeCommand: 找不到节点 ${nodeId}`);
    }
    this.snapshot = structuredClone(f.node);
    this.parentId = f.parent ? f.parent.id : null;
    this.index = f.index;
  }

  do(): void {
    const f = findNode(this.project, this.nodeId);
    if (!f) {
      return;
    }
    f.list.splice(f.index, 1);
  }

  undo(): void {
    const list = getChildList(this.project, this.parentId);
    list.splice(this.index, 0, structuredClone(this.snapshot));
  }
}

/** 在同一父节点的 `children` 内从 `fromIndex` 移到 `toIndex`（语义同 splice 插入位置） */
export class ReorderCommand implements Command {
  constructor(
    private readonly project: Project,
    private readonly parentId: string | null,
    private readonly fromIndex: number,
    private readonly toIndex: number,
    public label: string,
  ) {}

  do(): void {
    const list = getChildList(this.project, this.parentId);
    moveIndex(list, this.fromIndex, this.toIndex);
  }

  undo(): void {
    const list = getChildList(this.project, this.parentId);
    moveIndex(list, this.toIndex, this.fromIndex);
  }
}

export class AddAssetCommand implements Command {
  constructor(
    private readonly project: Project,
    private readonly index: number,
    private readonly asset: AssetRef,
    public label: string,
  ) {}

  do(): void {
    this.project.assets.splice(this.index, 0, structuredClone(this.asset));
  }

  undo(): void {
    const [removed] = this.project.assets.splice(this.index, 1);
    if (!removed || removed.id !== this.asset.id) {
      throw new Error("AddAssetCommand.undo: 与预期不一致");
    }
  }
}

export class RemoveAssetCommand implements Command {
  private readonly snapshot: AssetRef;
  private readonly index: number;

  constructor(
    private readonly project: Project,
    private readonly assetId: string,
    public label: string,
  ) {
    const i = project.assets.findIndex((a) => a.id === assetId);
    if (i < 0) {
      throw new Error(`RemoveAssetCommand: 找不到资源 ${assetId}`);
    }
    this.index = i;
    this.snapshot = structuredClone(project.assets[i]);
  }

  do(): void {
    const i = this.project.assets.findIndex((a) => a.id === this.assetId);
    if (i < 0) {
      return;
    }
    this.project.assets.splice(i, 1);
  }

  undo(): void {
    this.project.assets.splice(this.index, 0, structuredClone(this.snapshot));
  }
}
