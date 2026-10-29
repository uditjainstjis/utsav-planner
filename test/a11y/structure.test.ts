import { beforeAll, describe, expect, it } from 'vitest';
import { readPage, type Element, type Page } from './markup';

let page: Page;
beforeAll(async () => {
  page = await readPage();
});

describe('document structure', () => {
  it('declares a language', () => {
    expect(page.byTag('html')[0]?.attrs.lang).toBe('en');
  });

  it('has exactly one main landmark', () => {
    expect(page.byTag('main')).toHaveLength(1);
  });

  it('has banner and contentinfo landmarks', () => {
    expect(page.byTag('header').length).toBeGreaterThanOrEqual(1);
    expect(page.byTag('footer').length).toBeGreaterThanOrEqual(1);
  });

  it('has exactly one h1', () => {
    expect(page.byTag('h1')).toHaveLength(1);
  });

  it('gives template headings the level that is correct where they are cloned', () => {
    // Templates are excluded from the outline check above because they are
    // inert, so their level is asserted here instead. Milestones, vendors and
    // ideas are cloned under h3 section headings, so h4 is the only level
    // that does not skip.
    const templateHeadings = page.elements.filter((e) => e.inTemplate && /^h[1-6]$/.test(e.tag));
    expect(templateHeadings.length).toBeGreaterThan(0);
    for (const h of templateHeadings) expect(h.tag).toBe('h4');
  });

  it('does not skip a heading level', () => {
    // <template> content is inert: it is not in the accessibility tree until it
    // is cloned into place, and where it happens to sit in the source says
    // nothing about the outline a user navigates.
    const levels = page.elements
      .filter((e) => /^h[1-4]$/.test(e.tag) && !e.inTemplate)
      .map((e) => Number(e.tag.slice(1)));
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    }
  });

  it('opens with a skip link that targets the main landmark', () => {
    const skip = page.byTag('a').find((a) => a.attrs.class?.includes('skip-link'));
    expect(skip).toBeDefined();
    expect(skip!.attrs.href).toBe('#main');
    expect(page.byTag('main')[0]?.attrs.id).toBe('main');
  });
});

describe('form controls', () => {
  /**
   * Can this control acquire an accessible name?
   *
   * Four ways, and a checker that knows only the first three reports a false
   * failure on perfectly good markup: an explicit ARIA name, an `id` a
   * `<label for>` can point at, or being wrapped in a `<label>`, which names
   * the control from the label's own text with no `for` attribute at all.
   */
  const labelled = (el: Element): boolean =>
    Boolean(el.attrs['aria-label'] || el.attrs['aria-labelledby'] || el.attrs.id || el.inLabel);

  it('gives every interactive control an accessible name', () => {
    for (const el of [...page.byTag('input'), ...page.byTag('select'), ...page.byTag('textarea')]) {
      if (el.attrs.type === 'hidden') continue;
      expect(labelled(el), `<${el.tag}> has no way to be named`).toBe(true);
    }
  });

  it('points every label at a control that exists', () => {
    for (const label of page.byTag('label')) {
      const target = label.attrs.for;
      if (!target) continue; // wrapping label; the control is nested inside
      expect(page.ids.has(target), `<label for="${target}"> targets nothing`).toBe(true);
    }
  });

  it('resolves every aria-describedby reference', () => {
    for (const el of page.elements) {
      const ref = el.attrs['aria-describedby'];
      if (!ref) continue;
      for (const id of ref.split(/\s+/)) {
        expect(page.ids.has(id), `aria-describedby="${id}" targets nothing`).toBe(true);
      }
    }
  });

  it('resolves every aria-labelledby reference', () => {
    for (const el of page.elements) {
      const ref = el.attrs['aria-labelledby'];
      if (!ref) continue;
      for (const id of ref.split(/\s+/)) {
        expect(page.ids.has(id), `aria-labelledby="${id}" targets nothing`).toBe(true);
      }
    }
  });

  it('gives every fieldset a legend', () => {
    expect(page.byTag('fieldset').length).toBe(page.byTag('legend').length);
  });

  it('does not rely on placeholder text in place of a label', () => {
    for (const el of page.byTag('textarea')) {
      if (el.attrs.placeholder) expect(el.attrs.id).toBeTruthy();
    }
  });
});
