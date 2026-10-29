/**
 * The colour arithmetic behind test/contrast/contrast.dom.test.ts: CSS custom
 * properties read from a stylesheet, OKLCH converted to linear sRGB, and the
 * WCAG 2.x contrast ratio.
 */

export type Tokens = Record<string, string>;

export function parseBlock(block: string): Tokens {
  const out: Tokens = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

/** Every `light-dark(light, dark)` in `value` replaced by the argument for `scheme`. */
export function inScheme(value: string, scheme: 'light' | 'dark'): string {
  const open = 'light-dark(';
  const at = value.indexOf(open);
  if (at === -1) return value;
  let depth = 0;
  let comma = -1;
  let end = at + open.length;
  for (; end < value.length; end++) {
    const ch = value[end];
    if (ch === '(') depth++;
    if (ch === ',' && depth === 0) comma = end;
    if (ch === ')' && depth-- === 0) break;
  }
  const chosen =
    scheme === 'light' ? value.slice(at + open.length, comma) : value.slice(comma + 1, end);
  return inScheme(value.slice(0, at) + chosen.trim() + value.slice(end + 1), scheme);
}

function resolve(value: string, tokens: Tokens): string {
  let v = value;
  for (let i = 0; i < 12 && v.includes('var('); i++) {
    v = v.replace(/var\(--([a-z0-9-]+)\)/g, (_, name: string) => tokens[name] ?? '0');
  }
  return v;
}

/** Evaluate the tiny arithmetic subset CSS `calc()` is used for here. */
function num(expr: string): number {
  let e = expr.trim();
  while (e.startsWith('calc(')) e = e.slice(5, -1);
  e = e.replace('%', '');
  const m = /^\s*(-?[\d.]+)\s*([-+])\s*(-?[\d.]+)\s*$/.exec(e);
  if (m) return m[2] === '-' ? Number(m[1]) - Number(m[3]) : Number(m[1]) + Number(m[3]);
  return Number(e);
}

function splitArgs(inner: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (buf) parts.push(buf);
      buf = '';
    } else buf += ch;
  }
  if (buf) parts.push(buf);
  return parts;
}

/** OKLCH → linear sRGB (Björn Ottosson's matrices), clamped to gamut. */
function oklchToRgb(token: string, tokens: Tokens): [number, number, number] {
  const s = resolve(token, tokens).trim();
  if (!s.startsWith('oklch(')) throw new Error(`not oklch: ${token}`);
  const [l, c, h] = splitArgs(s.slice(6, -1)).map(num) as [number, number, number];
  const L = l > 1 ? l / 100 : l;
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;
  const clamp = (x: number): number => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    clamp(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    clamp(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  ];
}

/**
 * WCAG relative luminance. The input is already *linear* sRGB — the OKLab
 * matrices above produce linear light — so the sRGB transfer curve, which
 * linearises gamma-encoded values, must not be applied again here.
 */
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrast(fg: string, bg: string, tokens: Tokens): number {
  // Accept a token name ("ink") or a literal colour ("oklch(...)").
  const value = (t: string): string => (t.includes('(') ? t : (tokens[t] ?? t));
  const a = luminance(oklchToRgb(value(fg), tokens));
  const b = luminance(oklchToRgb(value(bg), tokens));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
