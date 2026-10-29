// @ts-check
/** The three POST endpoints, with a timeout each and errors worded for a person. */

/** @typedef {import('../../src/lib/types').Personalisation} Personalisation */
/** @typedef {import('../../src/lib/types').Plan} Plan */
/** @typedef {import('../../src/lib/types').PlanRequest} PlanRequest */
/** @typedef {import('../../src/lib/refine').Change} Change */

/** @typedef {{ plan: Plan, ics: string }} PlanReply */
/** @typedef {PlanReply & { request: PlanRequest, changes: Change[] }} RefineReply */
/** @typedef {{ '/api/plan': PlanReply, '/api/refine': RefineReply, '/api/personalise': Personalisation }} Replies */

/**
 * Server-side the model is capped at 20 s per call; the client allows a little more.
 * @type {Record<keyof Replies, number>}
 */
const TIMEOUT_MS = { '/api/plan': 10_000, '/api/refine': 10_000, '/api/personalise': 45_000 };

/** A request the server refused, with the request field it named, if any. */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {string | undefined} field
   */
  constructor(message, field) {
    super(message);
    this.name = 'ApiError';
    this.field = field;
  }
}

/**
 * @param {unknown} err
 * @param {string} fallback
 */
export const messageOf = (err, fallback) => (err instanceof Error && err.message) || fallback;

/**
 * @template {keyof Replies} P
 * @param {P} path
 * @param {unknown} body
 * @returns {Promise<Replies[P]>}
 */
export async function postJson(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS[path]),
    });
  } catch (err) {
    const timedOut =
      typeof err === 'object' && err !== null && 'name' in err && err.name === 'TimeoutError';
    throw new Error(
      timedOut
        ? 'That took too long. Please try again.'
        : 'Could not reach the planner. Check your connection and try again.',
      { cause: err },
    );
  }
  /** @type {unknown} */
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body; handled below */
  }
  if (!res.ok) throw refusal(res.status, data);
  // A successful reply's shape is the server's contract (src/index.ts).
  return /** @type {Replies[P]} */ (data);
}

/**
 * @param {number} status
 * @param {unknown} data  the error body, `{ error, code, field }` when the server wrote it
 */
function refusal(status, data) {
  const body = typeof data === 'object' && data !== null ? data : {};
  const error = 'error' in body && typeof body.error === 'string' ? body.error : '';
  const field = 'field' in body && typeof body.field === 'string' ? body.field : undefined;
  return new ApiError(error || `Request failed (${status}).`, field);
}
