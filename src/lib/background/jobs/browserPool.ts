// No per-tick maintenance function exists: evictStaleContexts() is not exported
// (browserPool.ts:148) and only runs when the pool is started (web process); the
// pool owns its lifecycle via its own evict/idle timers (browserPool.ts:140-171).
// In a worker process the pool is never started, so this tick is a silent no-op.
export default async function browserPool(): Promise<void> {
  return;
}
