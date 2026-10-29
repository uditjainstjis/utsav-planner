/**
 * The Worker's bindings, as `wrangler types` generates them from wrangler.jsonc
 * into worker-configuration.d.ts (run before every typecheck and lint), so the
 * type cannot drift from the deployed configuration.
 */
export type Env = Cloudflare.Env;
