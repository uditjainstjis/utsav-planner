import { describe, expect, it } from 'vitest';
import { buildBudget } from '../src/lib/budget';
import { buildTimeline } from '../src/lib/timeline';
import { EVENT_TYPES } from '../src/shared/constants';
import { buildVendors } from '../src/lib/vendors';

const TODAY = '2026-10-23';

describe('buildVendors', () => {
  it.each(EVENT_TYPES)('%s: every vendor is paid from a budget line that exists', (type) => {
    const lines = new Set(buildBudget(type, 100_000, 50).lines.map((l) => l.id));
    for (const v of buildVendors(type, buildTimeline(type, '2027-04-01', TODAY))) {
      expect(lines.has(v.budgetLineId), `${v.id} → ${v.budgetLineId}`).toBe(true);
    }
  });

  it.each(EVENT_TYPES)('%s: book-by dates come from the timeline, so the two agree', (type) => {
    const t = buildTimeline(type, '2027-04-01', TODAY);
    const byVendor = new Map(t.milestones.filter((m) => m.vendorId).map((m) => [m.vendorId, m]));
    for (const v of buildVendors(type, t)) {
      const m = byVendor.get(v.id);
      expect(m, `no milestone books ${v.id}`).toBeDefined();
      expect(v.bookBy).toBe(m!.dueDate);
      expect(v.daysBefore).toBe(m!.daysBefore);
    }
  });

  it.each(EVENT_TYPES)('%s: ids are unique and every vendor has baseline questions', (type) => {
    const vendors = buildVendors(type, buildTimeline(type, '2027-04-01', TODAY));
    const ids = vendors.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of vendors) {
      expect(v.questions.length).toBeGreaterThan(0);
      for (const q of v.questions) expect(q).toMatch(/\?$/);
    }
  });

  it('shifts book-by dates with the timeline when the runway is short', () => {
    const calm = buildVendors('wedding', buildTimeline('wedding', '2027-10-23', TODAY));
    const rush = buildVendors('wedding', buildTimeline('wedding', '2026-12-22', TODAY));
    const c = calm.find((v) => v.id === 'caterer')!;
    const r = rush.find((v) => v.id === 'caterer')!;
    expect(c.daysBefore).toBe(135);
    expect(r.daysBefore).toBe(45);
  });

  it('returns fresh arrays, so a caller editing questions cannot corrupt the template', () => {
    const t = buildTimeline('birthday', '2027-04-01', TODAY);
    const first = buildVendors('birthday', t);
    first[0]!.questions.push('mutated?');
    const second = buildVendors('birthday', t);
    expect(second[0]!.questions).not.toContain('mutated?');
  });

  it('refuses to build a checklist from a timeline that cannot book a vendor', () => {
    const t = buildTimeline('wedding', '2027-04-01', TODAY);
    const broken = { ...t, milestones: t.milestones.filter((m) => m.vendorId !== 'caterer') };
    expect(() => buildVendors('wedding', broken)).toThrow(/no milestone books vendor "caterer"/);
  });
});
