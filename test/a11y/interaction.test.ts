import { beforeAll, describe, expect, it } from 'vitest';
import { readPage, type Page } from './markup';

let page: Page;
beforeAll(async () => {
  page = await readPage();
});

describe('focus and interaction', () => {
  it('uses no positive tabindex, which would break document focus order', () => {
    for (const el of page.elements) {
      const t = el.attrs.tabindex;
      if (t !== undefined) expect(Number(t)).toBeLessThanOrEqual(0);
    }
  });

  it('gives every button a name, from text or an aria attribute', () => {
    for (const button of page.byTag('button')) {
      const named =
        button.text.trim().length > 0 ||
        Boolean(button.attrs['aria-label']) ||
        Boolean(button.attrs['aria-labelledby']);
      expect(named, `<button> with no accessible name: ${JSON.stringify(button.attrs)}`).toBe(true);
    }
  });

  it('gives every button an explicit type so none submits a form by accident', () => {
    for (const button of page.byTag('button')) {
      expect(['button', 'submit', 'reset']).toContain(button.attrs.type);
    }
  });

  it('gives every link an href and discernible text', () => {
    for (const link of page.byTag('a')) {
      expect(link.attrs.href).toBeTruthy();
      expect(link.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('gives every image alternative text', () => {
    for (const img of page.byTag('img')) {
      expect(img.attrs.alt).toBeDefined();
    }
  });

  it('lets a keyboard user scroll the budget table, which scrolls sideways on a narrow screen', () => {
    const wrap = page.elements.find((e) => e.attrs.class === 'table-wrap');
    expect(wrap?.attrs).toMatchObject({
      role: 'region',
      tabindex: '0',
      'aria-labelledby': 'budget-caption',
    });
    expect(page.byTag('caption').map((c) => c.attrs.id)).toEqual(['budget-caption']);
  });

  it('hides decorative graphics from assistive technology', () => {
    const mark = page.elements.find((e) => e.attrs.class === 'brand__mark');
    expect(mark?.attrs['aria-hidden']).toBe('true');
  });
});

describe('live regions', () => {
  it('has exactly four polite status regions: request progress, ideas, vendor count, copy', () => {
    // docs/ACCESSIBILITY.md names each of these and what it reports. A fifth
    // would be one more voice talking over the others, so adding one should
    // be a decision recorded there, not a side effect.
    const live = page.elements.filter((e) => e.attrs['aria-live'] === 'polite');
    expect(live.map((e) => e.attrs.id).sort()).toEqual([
      'copy-status',
      'ideas-status',
      'progress',
      'vendor-progress',
    ]);
    for (const region of live) expect(region.attrs.role).toBe('status');
  });

  it('does not mark the ideas list itself as live, which would flood a screen reader', () => {
    const list = page.elements.find((e) => e.attrs.id === 'ideas-list');
    expect(list).toBeDefined();
    expect(list!.attrs['aria-live']).toBeUndefined();
  });

  it('announces errors assertively', () => {
    const alerts = page.elements.filter((e) => e.attrs.role === 'alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('content security', () => {
  it('has no inline event handler attributes', () => {
    for (const el of page.elements) {
      for (const name of Object.keys(el.attrs)) {
        expect(name.startsWith('on'), `inline handler ${name}`).toBe(false);
      }
    }
  });

  it('loads all script from external files, so the CSP needs no unsafe-inline', () => {
    for (const script of page.byTag('script')) {
      expect(script.attrs.src, 'inline <script> would require unsafe-inline').toBeTruthy();
    }
  });

  it('has no inline style element', () => {
    expect(page.byTag('style')).toHaveLength(0);
  });

  it('loads no resource from a third-party origin', () => {
    for (const el of page.elements) {
      for (const value of [el.attrs.src, el.attrs.href]) {
        if (value && /^https?:\/\//.test(value)) {
          // Only the source-code link in the footer may point off-origin.
          expect(el.tag).toBe('a');
        }
      }
    }
  });
});

describe('the standing note', () => {
  it('appears in the markup, outside any conditional region', () => {
    const notice = page.elements.find((e) => e.attrs.class?.includes('notice--standing'));
    expect(notice).toBeDefined();
    expect(notice!.text).toMatch(/estimates, not quotes/i);
  });

  it('is exposed to assistive technology as a note', () => {
    const notice = page.elements.find((e) => e.attrs.class?.includes('notice--standing'));
    expect(notice!.attrs.role).toBe('note');
  });
});
