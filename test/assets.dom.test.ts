import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPlan, planIcs } from '../src/lib/plan';
import * as source from '../src/shared/constants';

const { LIMITS, OCCASION_LABEL } = source;

/**
 * Invariants about the files actually served from public/.
 *
 * These run in the Node-backed project because they read the directory from
 * disk, which is the only way to check a promise made about a *file* rather
 * than about markup.
 */

const publicDir = resolve(process.cwd(), 'public');
const read = (name: string): string => readFileSync(resolve(publicDir, name), 'utf8');

const indexHtml = read('index.html');
const stylesCss = read('styles.css');
const headers = read('_headers');

const fontsIn = (text: string): string[] =>
  [...new Set([...text.matchAll(/\/fonts\/([^"')\s]+)/g)].map((m) => m[1] ?? ''))].sort();

describe('the shipped fonts', () => {
  it('are content-addressed, so the immutable cache header is honest', () => {
    // _headers promises `public, max-age=31536000, immutable` for /fonts/*.
    // That is only safe if the URL changes whenever the bytes do.
    expect(headers).toMatch(/\/fonts\/\*/);
    expect(headers).toMatch(/immutable/);
    const fonts = fontsIn(stylesCss);
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) expect(font).toMatch(/^[a-z]+\.[0-9a-f]{8}\.woff2$/);
  });

  it('preloads exactly the files the stylesheet asks for', () => {
    // A preload naming a stale filename downloads a font nothing goes on to
    // use, and costs the render it was added to save.
    expect(fontsIn(indexHtml)).toEqual(fontsIn(stylesCss));
  });

  it('every referenced font file actually exists in public/fonts', () => {
    for (const font of fontsIn(stylesCss)) {
      expect(() => readFileSync(resolve(publicDir, 'fonts', font))).not.toThrow();
    }
  });

  it('the hash in each filename matches the bytes of that file', async () => {
    const { createHash } = await import('node:crypto');
    for (const font of fontsIn(stylesCss)) {
      const bytes = readFileSync(resolve(publicDir, 'fonts', font));
      const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
      // If this fails, a font was edited without renaming it, and caches will
      // serve the old bytes for a year.
      expect(font).toContain(digest);
    }
  });
});

describe('the limits the page and the Worker share', () => {
  const page = new DOMParser().parseFromString(indexHtml, 'text/html');

  it('reach the page as src/shared/constants.ts compiled: same values, same wording', async () => {
    const compiled = await import('../public/js/constants.js');
    expect(Object.keys(compiled).sort()).toEqual(Object.keys(source).sort());
    expect(compiled.LIMITS).toEqual(LIMITS);
    expect(compiled.OCCASION_LABEL).toEqual(OCCASION_LABEL);
    expect(compiled.rupees(1_200_000)).toBe(source.rupees(1_200_000));
    expect(compiled.rangeMessage('Guests', LIMITS.guests)).toBe(
      source.rangeMessage('Guests', LIMITS.guests),
    );
    const day = new Date('2026-03-01T23:30:00Z');
    expect(compiled.todayIso(day)).toBe(source.todayIso(day));
  });

  it('are stated nowhere in the markup, which gets them from constants.js at startup', () => {
    for (const el of page.querySelectorAll('input, textarea')) {
      for (const name of ['min', 'max', 'maxlength']) {
        expect(el.hasAttribute(name), `#${el.id} carries ${name}`).toBe(false);
      }
    }
    for (const id of ['guests-help', 'budget-help', 'pref-count']) {
      expect(page.getElementById(id)?.textContent, `#${id}`).toBe('');
    }
  });

  it('name an unnamed occasion the same way in the calendar as on the page', () => {
    const plan = buildPlan(
      {
        eventType: 'community',
        eventDate: '2099-01-01',
        guests: 10,
        budget: 10_000,
        city: null,
        occasion: null,
        preferences: null,
      },
      '2098-06-01',
    );
    expect(planIcs(plan, '2098-06-01T00:00:00Z')).toContain(`SUMMARY:${OCCASION_LABEL.community}`);
  });
});
