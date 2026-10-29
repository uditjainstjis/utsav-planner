import { describe, expect, it } from 'vitest';
import { harden, headersFile } from '../src/lib/headers';

/**
 * The response policy, as the Worker applies it and as public/_headers states
 * it for the static assets the Worker never sees.
 */

/** headersFile() read back as path → header name → value. */
function rules(): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const block of headersFile().trim().split('\n\n')) {
    const [path = '', ...lines] = block.split('\n');
    const pairs = lines.map((line) => /^ {2}([a-z-]+): (.+)$/.exec(line));
    out.set(path, new Map(pairs.map((m) => [m?.[1] ?? '', m?.[2] ?? ''])));
  }
  return out;
}

const policy = (): Map<string, string> => new Map(harden(new Response()).headers);

describe('the response policy', () => {
  it('reaches static assets as exactly the headers the Worker sets', () => {
    expect(rules().get('/*')).toEqual(policy());
    expect(policy().size).toBe(11);
  });

  it('adds caching rules for fonts and security.txt only', () => {
    expect([...rules().keys()]).toEqual(['/*', '/fonts/*', '/.well-known/*']);
    expect(rules().get('/fonts/*')?.get('cache-control')).toContain('immutable');
    expect(rules().get('/.well-known/*')?.get('content-type')).toMatch(/^text\/plain/);
  });

  it('ships a content security policy with no unsafe escape hatches', () => {
    const csp = policy().get('content-security-policy') ?? '';
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("require-trusted-types-for 'script'");
  });

  it('keeps the status and body of the response it hardens', async () => {
    const res = harden(new Response('kept', { status: 418 }));
    expect(res.status).toBe(418);
    await expect(res.text()).resolves.toBe('kept');
  });
});
