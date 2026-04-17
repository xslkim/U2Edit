/** RGB 0–255，alpha 0–1 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface HSV {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** 解析 `#RGB` / `#RRGGBB` / `#RRGGBBAA`，失败返回 null */
export function parseHexColor(input: string): RGBA | null {
  const s = input.trim();
  const m = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (!m) {
    return null;
  }
  const raw = m[1];
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    return { r, g, b, a: 1 };
  }
  if (raw.length === 6) {
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return { r, g, b, a: 1 };
  }
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const a = parseInt(raw.slice(6, 8), 16) / 255;
  return { r, g, b, a };
}

function byte2(n: number): string {
  return Math.min(255, Math.max(0, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
}

/** 输出 `#RRGGBB` 或 `#RRGGBBAA`（alpha<1 时带 AA） */
export function rgbaToHex(c: RGBA): string {
  const r = c.r;
  const g = c.g;
  const b = c.b;
  const a = clamp01(c.a);
  const base = `#${byte2(r)}${byte2(g)}${byte2(b)}`.toUpperCase();
  if (a >= 1 - 1e-6) {
    return base;
  }
  return `${base}${byte2(a * 255)}`.toUpperCase();
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 1e-8) {
    if (max === rn) {
      h = 60 * (((gn - bn) / d) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / d + 2);
    } else {
      h = 60 * ((rn - gn) / d + 4);
    }
  }
  if (h < 0) {
    h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

export function rgbaFromHsv(h: number, s: number, v: number, a: number): RGBA {
  const { r, g, b } = hsvToRgb(h, s, v);
  return { r, g, b, a: clamp01(a) };
}
