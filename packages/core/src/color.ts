/**
 * Minimal color support for tracks: hex/rgb(a) parsing, OKLab interpolation
 * (DESIGN.md §2.2 — naive sRGB lerp rejected for its gray dead zones),
 * canonical lowercase-hex serialization.
 */

export interface Rgba {
  r: number; // 0..255
  g: number;
  b: number;
  a: number; // 0..1
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

export class ColorParseError extends Error {
  constructor(input: string) {
    super(`cannot parse color '${input}' (supported: #rgb[a], #rrggbb[aa], rgb()/rgba())`);
    this.name = 'ColorParseError';
  }
}

export function parseColor(input: string): Rgba {
  const hex = HEX_RE.exec(input);
  if (hex) {
    let h = hex[1]!;
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (h.length === 6) return { r: n >> 16, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
    return { r: (n >>> 24) & 0xff, g: (n >>> 16) & 0xff, b: (n >>> 8) & 0xff, a: (n & 0xff) / 255 };
  }
  const rgb = RGB_RE.exec(input);
  if (rgb) {
    const alphaRaw = rgb[4];
    const a =
      alphaRaw === undefined
        ? 1
        : alphaRaw.endsWith('%')
          ? parseFloat(alphaRaw) / 100
          : parseFloat(alphaRaw);
    return { r: parseFloat(rgb[1]!), g: parseFloat(rgb[2]!), b: parseFloat(rgb[3]!), a };
  }
  throw new ColorParseError(input);
}

export function formatColor(c: Rgba): string {
  const clampByte = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  const hex = (v: number) => clampByte(v).toString(16).padStart(2, '0');
  const base = `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
  const a = Math.min(1, Math.max(0, c.a));
  return a >= 1 ? base : `${base}${hex(a * 255)}`;
}

// --- sRGB <-> OKLab (Björn Ottosson's reference constants) ---

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return c * 255;
}

export interface OkLab {
  L: number;
  a: number;
  b: number;
  alpha: number;
}

export function rgbaToOklab(c: Rgba): OkLab {
  const r = srgbToLinear(c.r);
  const g = srgbToLinear(c.g);
  const b = srgbToLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha: c.a,
  };
}

export function oklabToRgba(c: OkLab): Rgba {
  const l = (c.L + 0.3963377774 * c.a + 0.2158037573 * c.b) ** 3;
  const m = (c.L - 0.1055613458 * c.a - 0.0638541728 * c.b) ** 3;
  const s = (c.L - 0.0894841775 * c.a - 1.291485548 * c.b) ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: c.alpha,
  };
}

/** Interpolate two CSS color strings in OKLab; t may extrapolate. */
export function lerpColor(from: string, to: string, t: number): string {
  const a = rgbaToOklab(parseColor(from));
  const b = rgbaToOklab(parseColor(to));
  const mix = (x: number, y: number) => x + (y - x) * t;
  return formatColor(
    oklabToRgba({
      L: mix(a.L, b.L),
      a: mix(a.a, b.a),
      b: mix(a.b, b.b),
      alpha: mix(a.alpha, b.alpha),
    }),
  );
}
