import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrast, inScheme, parseBlock, type Tokens } from './oklch';

// Read off disk: a `?raw` import of a .css file is intercepted by Vite's
// stylesheet pipeline and arrives empty (see test/axe.dom.test.ts).
const css = readFileSync(resolve(process.cwd(), 'public', 'styles.css'), 'utf8');

/**
 * Colour contrast, enforced.
 *
 * axe cannot decide `color-contrast` without layout, so the shipped tokens are
 * checked here directly: every text colour is converted from OKLCH to sRGB and
 * its WCAG 2.x contrast ratio against every surface is asserted, in both
 * themes. docs/ACCESSIBILITY.md quotes these numbers; this file is what keeps
 * them true after the next palette change.
 */

const root = parseBlock(/:root \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '');
const themed = (scheme: 'light' | 'dark'): Tokens =>
  Object.fromEntries(Object.entries(root).map(([name, value]) => [name, inScheme(value, scheme)]));

const LIGHT = themed('light');
const DARK = themed('dark');

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
  ['dark', DARK],
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
    const differ = Object.keys(LIGHT).filter((name) => LIGHT[name] !== DARK[name]);
    expect(differ.length).toBeGreaterThan(15);
  });

  it('reads each argument of light-dark() for its own scheme', () => {
    const value = 'light-dark(oklch(1% 0 0), var(--x)), 0 1px light-dark(red, blue)';
    expect(inScheme(value, 'light')).toBe('oklch(1% 0 0), 0 1px red');
    expect(inScheme(value, 'dark')).toBe('var(--x), 0 1px blue');
  });
});
