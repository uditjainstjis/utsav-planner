/**
 * Content-addressed cache for personalisations.
 *
 * A personalisation is a function of (occasion, guests, budget, city, name,
 * wishes, lead-time bucket, prompt version, model). Sample briefs and repeat
 * visits recur exactly, so caching on a content hash removes a large share of
 * inference work. Cache hits are reported to the user and asserted in tests.
 *
 * Uses the Workers Cache API rather than KV: it needs no binding, costs
 * nothing, and expires on its own. The trade-off is that it is per-colocation,
 * so the hit rate is lower than a global store would give. That is the right
 * trade for this workload — a miss costs one round of model calls, never
 * correctness.
 */

const CACHE_ORIGIN = 'https://cache.utsav-planner.internal';
/** Ideas are stable for a given brief; a week keeps popular briefs warm. */
const TTL_SECONDS = 604_800;
/** Field separator for hash inputs, chosen so it cannot occur in the inputs. */
const SEP = String.fromCharCode(0);

/** SHA-256 of the inputs that fully determine a personalisation, as lowercase hex. */
export async function contentKey(parts: readonly string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join(SEP));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function keyToRequest(key: string): Request {
  return new Request(`${CACHE_ORIGIN}/${key}`, { method: 'GET' });
}

/**
 * Read a cached value.
 *
 * @returns the parsed value, unchecked, or null on miss or on any cache error —
 *   the caller checks its shape, and always has a working path that recomputes.
 */
export async function cacheGet(key: string): Promise<unknown> {
  try {
    const hit = await caches.default.match(keyToRequest(key));
    return hit ? await hit.json() : null;
  } catch {
    return null;
  }
}

/**
 * Store a value. Failures are swallowed: the cache is an optimisation, and a
 * caching problem must never surface as a failed personalisation.
 */
export async function cachePut(key: string, value: unknown): Promise<void> {
  try {
    await caches.default.put(
      keyToRequest(key),
      new Response(JSON.stringify(value), {
        headers: {
          'content-type': 'application/json',
          'cache-control': `max-age=${TTL_SECONDS}`,
        },
      }),
    );
  } catch {
    /* optimisation only */
  }
}
