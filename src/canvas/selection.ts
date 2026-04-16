import { shallowRef } from "vue";

/** 响应式选中集（tasks T1.9） */
export class SelectionStore {
  readonly selectedIds = shallowRef<Set<string>>(new Set());

  get size(): number {
    return this.selectedIds.value.size;
  }

  clear(): void {
    this.selectedIds.value = new Set();
  }

  setAll(ids: ReadonlySet<string>): void {
    this.selectedIds.value = new Set(ids);
  }

  selectOnly(id: string): void {
    this.selectedIds.value = new Set([id]);
  }

  toggle(id: string): void {
    const n = new Set(this.selectedIds.value);
    if (n.has(id)) {
      n.delete(id);
    } else {
      n.add(id);
    }
    this.selectedIds.value = n;
  }

  add(id: string): void {
    const n = new Set(this.selectedIds.value);
    n.add(id);
    this.selectedIds.value = n;
  }

  has(id: string): boolean {
    return this.selectedIds.value.has(id);
  }
}
