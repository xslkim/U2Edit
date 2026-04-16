import { open } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

/**
 * 打开目录选择对话框，返回绝对路径或取消时为 null。
 */
export async function pickDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择目录",
  });
  if (selected === null) return null;
  return Array.isArray(selected) ? (selected[0] ?? null) : selected;
}

export async function readText(path: string): Promise<string> {
  return readTextFile(path);
}

export async function writeText(path: string, content: string): Promise<void> {
  await writeTextFile(path, content);
}

export async function existsPath(path: string): Promise<boolean> {
  return exists(path);
}

/** 创建目录（已存在时不抛错，`recursive` 同 mkdir -p） */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/** 多选图片文件（png/jpg/jpeg/webp），取消返回 null */
export async function pickImageFiles(): Promise<string[] | null> {
  const selected = await open({
    multiple: true,
    filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }],
    title: "导入图片",
  });
  if (selected === null) {
    return null;
  }
  return Array.isArray(selected) ? selected : [selected];
}
