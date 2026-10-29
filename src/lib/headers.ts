/**
 * Response hardening, for API responses and static assets alike.
 *
 * The Worker applies {@link SECURITY_HEADERS} to what it answers through
 * {@link harden}. Static assets are served at the edge without invoking the
 * Worker, so scripts/build-assets.mjs writes {@link headersFile} to
 * public/_headers, and the same policy reaches them from this one definition.
 *
 * The policy is strict by construction rather than by exception: all scripts
 * and styles live in their own files, so `script-src 'self'` needs no
 * `unsafe-inline` or `unsafe-eval` escape hatch, and the app has no third-party
 * origins to allow.
 *
 * Three directives deserve a note.
 *
 * `require-trusted-types-for 'script'` with `trusted-types 'none'` makes the
 * browser refuse every assignment to a DOM sink that parses markup —
 * `innerHTML`, `outerHTML`, `document.write`, `insertAdjacentHTML`. The front
 * end writes every string as text, through `textContent` or `append()` of a
 * string (which makes a text node), so a model reply, or a visitor's wishes
 * echoed back in one, cannot smuggle markup into the page; the browser
 * enforces that, and code that reaches for `innerHTML` fails loudly.
 *
 * `cross-origin-embedder-policy: require-corp` completes the COOP/COEP/CORP
 * trio. It costs nothing, because the page loads no cross-origin subresources,
 * and it forecloses a class of side channel that would otherwise stay open.
 *
 * `permissions-policy` denies, by name, the 25 policy-controlled features
 * below. A planning form needs none of them. The header can only deny what it
 * names: a feature a browser adds later keeps its default until it is listed.
 */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
  'upgrade-insecure-requests',
].join('; ');

/** The features denied, each set to an empty allowlist. */
const PERMISSIONS_POLICY = [
  'accelerometer',
  'ambient-light-sensor',
  'autoplay',
  'battery',
  'bluetooth',
  'browsing-topics',
  'camera',
  'display-capture',
  'encrypted-media',
  'gamepad',
  'geolocation',
  'gyroscope',
  'hid',
  'idle-detection',
  'local-fonts',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'picture-in-picture',
  'publickey-credentials-get',
  'screen-wake-lock',
  'serial',
  'usb',
  'xr-spatial-tracking',
]
  .map((feature) => `${feature}=()`)
  .join(', ');

type HeaderMap = Readonly<Record<string, string>>;

const SECURITY_HEADERS: HeaderMap = {
  'content-security-policy': CSP,
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': PERMISSIONS_POLICY,
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'x-permitted-cross-domain-policies': 'none',
  'origin-agent-cluster': '?1',
};

/** Headers for static paths beyond the policy every path gets. */
const STATIC_RULES: Readonly<Record<string, HeaderMap>> = {
  // Font filenames carry a hash of their own bytes (test/assets.dom.test.ts
  // holds it), so a URL never changes meaning and `immutable` is safe.
  '/fonts/*': { 'cache-control': 'public, max-age=31536000, immutable' },
  // RFC 9116: plain text, so it is machine-readable, and cached for an hour
  // only, so the contact details a reporter reads are current.
  '/.well-known/*': {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'public, max-age=3600',
  },
};

/** Apply {@link SECURITY_HEADERS} to a response without altering its body. */
export function harden(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

/** The text of public/_headers: the policy on every path, then {@link STATIC_RULES}. */
export function headersFile(): string {
  const rules = { '/*': SECURITY_HEADERS, ...STATIC_RULES };
  const block = ([path, headers]: [string, HeaderMap]): string =>
    [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)].join('\n');
  return `${Object.entries(rules).map(block).join('\n\n')}\n`;
}
