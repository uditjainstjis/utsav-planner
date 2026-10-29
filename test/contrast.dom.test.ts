import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

// Read off disk: a `?raw` import of a .css file is intercepted by Vite's
// stylesheet pipeline and arrives empty (see test/axe.dom.test.ts).
const css = readFileSync(resolvePath(process.cwd(), 'public', 'styles.css'), 'utf8');

/**
 * Colour contrast, enforced.
 *
 * axe cannot decide `color-contrast` without layout, so the shipped tokens are
 * checked here directly: every text colour is converted from OKLCH to sRGB and
 * its WCAG 2.x contrast ratio against every surface is asserted, in both
 * themes. docs/ACCESSIBILITY.md quotes these numbers; this file is what keeps
 * them true after the next palette change.
 */

type Tokens = Record<string, string>;

function parseBlock(block: string): Tokens {
  const out: Tokens = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const root = /:root \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
const darkMedia =
  /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{([\s\S]*?)\n {2}\}/.exec(
    css,
  )?.[1] ?? '';
const darkForced = /:root\[data-theme='dark'\] \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';

const LIGHT = parseBlock(root);
const DARK = { ...LIGHT, ...parseBlock(darkMedia) };
const DARK_FORCED = { ...LIGHT, ...parseBlock(darkForced) };

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

const TEXT = ['ink', 'ink-soft', 'ink-faint', 'accent', 'risk-high', 'risk-low'] as const;
const SURFACES = ['surface-0', 'surface-1', 'surface-2'] as const;

/** The body of the first rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`no rule for ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

/** The token a declaration in `body` sets, e.g. `color: var(--ink)` gives `ink`. */
function tokenIn(body: string, property: string): string {
  const m = new RegExp(`\\n\\s*${property}: var\\(--([a-z0-9-]+)\\);`).exec(body);
  if (!m?.[1]) throw new Error(`no ${property} token in ${body}`);
  return m[1];
}

// Read from the stylesheet, so changing the rule changes what is checked.
const LINK_HOVER = tokenIn(rule('a:hover'), 'color');
const HOVER_BORDER = tokenIn(rule('textarea:hover,\nselect:hover'), 'border-color');
const PLACEHOLDER = tokenIn(rule('::placeholder'), 'color');

describe('form fields and placeholders', () => {
  it('draw their borders with the field-border token', () => {
    expect(rule("input[type='text'],\ninput[type='number'],\ninput[type='date']")).toContain(
      'border: 1px solid var(--field-border);',
    );
    expect(rule('textarea,\nselect')).toContain('border: 1px solid var(--field-border);');
  });

  it('show placeholder text at full strength, so its measured contrast is its real contrast', () => {
    expect(rule('::placeholder')).not.toMatch(/opacity/);
  });
});

describe.each([
  ['light', LIGHT],
  ['dark (system)', DARK],
  ['dark (forced)', DARK_FORCED],
] as const)('contrast in the %s theme', (_name, tokens) => {
  it.each(TEXT)('%s reaches AA (4.5:1) on every surface', (fg) => {
    for (const bg of SURFACES) {
      expect(contrast(fg, bg, tokens), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('body text reaches AAA (7:1) on the page background', () => {
    expect(contrast('ink', 'surface-0', tokens)).toBeGreaterThanOrEqual(7);
  });

  it('the focus ring (accent-bright) reaches 3:1 against every surface (WCAG 1.4.11)', () => {
    for (const bg of SURFACES) {
      expect(
        contrast('accent-bright', bg, tokens),
        `accent-bright on ${bg}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('form field borders reach 3:1 against every surface (WCAG 1.4.11)', () => {
    for (const bg of SURFACES) {
      expect(contrast('field-border', bg, tokens), `field-border on ${bg}`).toBeGreaterThanOrEqual(
        3,
      );
      expect(contrast(HOVER_BORDER, bg, tokens), `hover border on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('link hover text reaches AA on every surface', () => {
    for (const bg of SURFACES) {
      expect(contrast(LINK_HOVER, bg, tokens), `${LINK_HOVER} on ${bg}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('placeholder text reaches AA on the field backgrounds', () => {
    for (const bg of ['surface-0', 'surface-1']) {
      expect(contrast(PLACEHOLDER, bg, tokens), `${PLACEHOLDER} on ${bg}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('the AI badge (page colour on accent) reaches AA', () => {
    expect(contrast('surface-0', 'accent', tokens)).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the warning tints reaches AA', () => {
    for (const bg of ['risk-high-bg', 'risk-low-bg', 'risk-info-bg']) {
      expect(contrast('ink', bg, tokens), `ink on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the converter itself', () => {
  it('agrees with known OKLCH values', () => {
    // oklch(100% 0 0) is white; oklch(0% 0 0) is black.
    expect(contrast('oklch(100% 0 0)', 'oklch(0% 0 0)', {})).toBeCloseTo(21, 0);
    expect(contrast('oklch(50% 0 0)', 'oklch(50% 0 0)', {})).toBeCloseTo(1, 5);
  });

  it('agrees with published ratios for mid-tones, which a gamma error would distort', () => {
    // White, black and identical pairs come out right even with the transfer
    // curve applied twice; mid-tones do not. #ff0000 on white is 4.00:1.
    expect(contrast('oklch(62.796% 0.25768 29.2339)', 'oklch(100% 0 0)', {})).toBeCloseTo(4, 2);
    // Grey at OKLab L = 0.6 has linear luminance 0.6³ = 0.216: (1 + 0.05) / (0.216 + 0.05).
    expect(contrast('oklch(60% 0 0)', 'oklch(100% 0 0)', {})).toBeCloseTo(1.05 / 0.266, 2);
  });

  it('found real tokens rather than an empty block', () => {
    expect(Object.keys(LIGHT).length).toBeGreaterThan(20);
    expect(Object.keys(parseBlock(darkMedia)).length).toBeGreaterThan(5);
    expect(Object.keys(parseBlock(darkForced)).length).toBeGreaterThan(5);
  });
});
