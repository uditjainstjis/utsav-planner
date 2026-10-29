import { describe, expect, it, vi } from 'vitest';
import worker from '../../src/index';
import { harden } from '../../src/lib/headers';
import { GOOD, stubEnv, post, get } from './helpers';

describe('GET /api/health', () => {
  it('reports service identity and public limits', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: 'ok',
      service: 'utsav-planner',
      limits: { guests: { max: 5000 } },
    });
  });

  it('never discloses configuration', async () => {
    const body = JSON.stringify(await (await get('/api/health')).json());
    expect(body).not.toMatch(/model|binding|account|token|key/i);
  });
});

describe('security headers', () => {
  /** The policy, as `harden` sets it. */
  const POLICY = [...harden(new Response()).headers];

  it('applies every hardening header to API responses', async () => {
    const res = await get('/api/health');
    for (const [name, value] of POLICY) expect(res.headers.get(name)).toBe(value);
  });

  it('answers an unexpected fault with a hardened 500 that discloses nothing', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const env = stubEnv({
      ASSETS: {
        fetch: async () => {
          throw new Error('secret internals');
        },
      } as unknown as Fetcher,
    });
    const res = await get('/index.html', env);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Internal Server Error');
    for (const [name, value] of POLICY) expect(res.headers.get(name)).toBe(value);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it('marks API responses as not cacheable', async () => {
    const res = await post('/api/plan', GOOD);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('serves the front end for non-API paths with the same headers', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    for (const [name, value] of POLICY) expect(res.headers.get(name)).toBe(value);
  });
});

describe('request gate', () => {
  it('rejects a body without a JSON content type (CSRF simple request)', async () => {
    const res = await worker.fetch(
      new Request('https://utsav.test/api/plan', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify(GOOD),
      }),
      stubEnv(),
      {} as ExecutionContext,
    );
    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toMatchObject({ code: 'unsupported_media_type' });
  });

  it('rejects a browser cross-site request', async () => {
    const res = await post('/api/plan', GOOD, stubEnv(), { 'sec-fetch-site': 'cross-site' });
    expect(res.status).toBe(403);
  });

  it('allows same-origin and direct (non-browser) requests', async () => {
    expect(
      (await post('/api/plan', GOOD, stubEnv(), { 'sec-fetch-site': 'same-origin' })).status,
    ).toBe(200);
    expect((await post('/api/plan', GOOD)).status).toBe(200);
  });

  it('enforces the rate limit by client IP and reports it as 429', async () => {
    const limit = vi.fn(async ({ key }: { key: string }) => ({ success: key !== '203.0.113.9' }));
    const env = stubEnv({ RATE_LIMITER: { limit } });
    const res = await post('/api/plan', GOOD, env);
    expect(res.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.9' });
  });

  it('never spends the rate budget on a rejected cross-site request', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    await post('/api/plan', GOOD, stubEnv({ RATE_LIMITER: { limit } }), {
      'sec-fetch-site': 'cross-site',
    });
    expect(limit).not.toHaveBeenCalled();
  });
});
