/**
 * 仅给 `vue-tsc` 做编译期断言：ImageNode 不得含 `content`。
 * 若误为 ImageNode 增加 `content`，此处将报错且 @ts-expect-error 变为多余指令导致失败。
 */
import type { ImageNode } from "./schema";

const _probe: ImageNode = {} as ImageNode;

// @ts-expect-error — ImageNode 不应包含 content（tasks.md T1.1 用例 3）
void _probe.content;
