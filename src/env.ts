/** Bindings this Worker requires. `AI` is the only external dependency. */
export interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  RATE_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}
