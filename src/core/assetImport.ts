import { copyFile, readFile } from "@tauri-apps/plugin-fs";
import { joinProjectPath } from "./project";
import type { Project } from "./schema";
import { existsPath } from "./fileService";

/** 与 YAML 中 path 比较用（统一正斜杠、去前导斜杠） */
export function normalizeAssetRelPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function fileBasename(path: string): string {
  const s = path.replace(/[/\\]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i >= 0 ? s.slice(i + 1) : s;
}

function splitStemExt(filename: string): { stem: string; ext: string } {
  const i = filename.lastIndexOf(".");
  if (i <= 0) {
    return { stem: filename, ext: "" };
  }
  return { stem: filename.slice(0, i), ext: filename.slice(i) };
}

/** 在磁盘与 YAML 中均未占用时返回该文件名，否则 `stem_n.ext` 递增 */
export async function nextFreeAssetFilename(
  project: Project,
  projectDir: string,
  desiredFilename: string,
): Promise<string> {
  let candidate = desiredFilename;
  let n = 0;
  const { stem, ext } = splitStemExt(desiredFilename);
  for (;;) {
    const rel = normalizeAssetRelPath(`assets/${candidate}`);
    const abs = joinProjectPath(projectDir, rel);
    const inYaml = project.assets.some((a) => normalizeAssetRelPath(a.path) === rel);
    const onDisk = await existsPath(abs);
    if (!inYaml && !onDisk) {
      return candidate;
    }
    n++;
    candidate = `${stem}_${n}${ext}`;
  }
}

/** 由文件名生成合法 id，再保证项目内唯一 */
export function uniqueAssetIdFromFilename(project: Project, filename: string): string {
  const base = fileBasename(filename).replace(/\.[^.]+$/, "");
  let s = base.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s) {
    s = "asset";
  }
  if (!/^[a-zA-Z_]/.test(s)) {
    s = `a_${s}`;
  }
  let id = s;
  let n = 0;
  while (project.assets.some((a) => a.id === id)) {
    n++;
    id = `${s}_${n}`;
  }
  return id;
}

export async function getImageDimensions(absPath: string): Promise<{ width: number; height: number }> {
  const buf = await readFile(absPath);
  const blob = new Blob([buf as BlobPart]);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = (): void => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = (): void => {
        reject(new Error("无法解码图片"));
      };
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function copyImageIntoAssets(
  sourceAbsolute: string,
  destAbsolute: string,
): Promise<void> {
  await copyFile(sourceAbsolute, destAbsolute);
}
