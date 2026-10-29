import { vi, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPlan } from '../../src/lib/plan';
import { todayIso } from '../../src/shared/constants';
import { fallbackPersonalisation } from '../../src/lib/fallback';
import type { Personalisation, Plan, PlanRequest } from '../../src/lib/types';

/**
 * The page under test for test/app/: the real index.html and public/js
 * modules in jsdom, a brief to fill it with, and fetch stubs to answer it.
 */

const APP = resolve(process.cwd(), 'public', 'js', 'main.js');
const html = readFileSync(resolve(process.cwd(), 'public', 'index.html'), 'utf8');

export const TODAY = todayIso();
export const inDays = (n: number): string =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const REQUEST: PlanRequest = {
  eventType: 'birthday',
  eventDate: inDays(40),
  guests: 20,
  budget: 25_000,
  city: null,
  occasion: null,
  preferences: null,
};
export const PLAN = buildPlan(REQUEST, TODAY);

export type Reply = { status: number; body: unknown };
export const ok = (body: unknown): Reply => ({ status: 200, body });

/** Answer each fetch with the next reply in order, and record what was asked. */
export function stubFetch(...replies: Reply[]): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async () => {
    const next = replies.shift();
    if (!next) throw new Error('unexpected fetch');
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/**
 * A fetch that answers only when told to, so a test chooses the order replies
 * land in. Calls are numbered from 0 in the order the page makes them.
 */
export function deferredFetch(): {
  requested: (call: number) => Promise<void>;
  answer: (call: number, reply: Reply) => Promise<void>;
} {
  const pending: Array<(res: Response) => void> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
  );
  const requested = async (call: number): Promise<void> => {
    await vi.waitFor(() => {
      expect(pending[call]).toBeDefined();
    });
  };
  const answer = async (call: number, reply: Reply): Promise<void> => {
    await requested(call);
    pending[call]!(
      new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { requested, answer };
}

export const ALL_MODEL: Personalisation['sources'] = {
  ideas: 'model',
  vendorQuestions: 'model',
  budgetNotes: 'model',
};

/** A personalisation a model wrote, its summary naming that model. */
export const byModel = (plan: Plan, model: string): Personalisation => ({
  ...fallbackPersonalisation(plan),
  summary: `Summary from ${model}`,
  sources: ALL_MODEL,
  model,
  cached: true,
});

export function $<T extends HTMLElement>(id: string, type: new () => T): T;
export function $(id: string): HTMLElement;
export function $(id: string, type: new () => HTMLElement = HTMLElement): HTMLElement {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} is missing`);
  return el;
}

export function fill(eventDate: string): void {
  $('event-date', HTMLInputElement).value = eventDate;
  $('guests', HTMLInputElement).value = String(REQUEST.guests);
  $('budget', HTMLInputElement).value = String(REQUEST.budget);
}

export function submit(): void {
  $('plan-form', HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
}

/** Wait until the build button is no longer busy, i.e. the handler has finished. */
export async function settled(): Promise<void> {
  await vi.waitFor(() => {
    expect($('plan-btn').getAttribute('aria-disabled')).toBe('false');
  });
}

/**
 * A fresh page, fresh copies of the modules and empty storage, so no listener,
 * module state or stored tick carries over between tests. The script tag is
 * dropped: the entry module is imported instead of being fetched by jsdom.
 */
export async function loadApp(): Promise<void> {
  document.documentElement.innerHTML = html
    .replace(/^[\s\S]*?<html[^>]*>/, '')
    .replace(/<script\b[^>]*><\/script>/g, '');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  // Node 25 and later define a localStorage of their own, undefined without
  // --localstorage-file, and vitest's jsdom globals leave it in place. The page
  // gets the jsdom window's (vitest's `jsdom` global), emptied like the rest of
  // a fresh page.
  const { jsdom } = globalThis as unknown as { jsdom: { window: Window } };
  const storage = jsdom.window.localStorage;
  storage.clear();
  vi.stubGlobal('localStorage', storage);
  vi.resetModules();
  await import(/* @vite-ignore */ APP);
}
