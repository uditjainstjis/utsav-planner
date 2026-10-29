import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITS, OCCASION_LABEL } from '../public/js/shared.js';
import { buildPlan, planIcs } from '../src/lib/plan';
import { LIMITS as SERVER_LIMITS } from '../src/lib/validate';

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
  const form = new DOMParser().parseFromString(indexHtml, 'text/html');
  const attr = (id: string, name: string): number =>
    Number(form.getElementById(id)?.getAttribute(name) ?? Number.NaN);

  it('are the one object the Worker validates against', () => {
    expect(SERVER_LIMITS).toBe(LIMITS);
  });

  it('match the form controls, so the browser and the server refuse the same input', () => {
    expect(attr('guests', 'min')).toBe(LIMITS.guests.min);
    expect(attr('guests', 'max')).toBe(LIMITS.guests.max);
    expect(attr('budget', 'min')).toBe(LIMITS.budget.min);
    expect(attr('budget', 'max')).toBe(LIMITS.budget.max);
    expect(attr('city', 'maxlength')).toBe(LIMITS.city);
    expect(attr('occasion', 'maxlength')).toBe(LIMITS.occasion);
    expect(attr('preferences', 'maxlength')).toBe(LIMITS.preferences);
    expect(attr('refine', 'maxlength')).toBe(LIMITS.refine);
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
