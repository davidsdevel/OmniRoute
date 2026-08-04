// No per-tick maintenance export exists: TTL cleanup is a module-level 5-min
// unref'd timer (open-sse/services/comboMetrics.ts:214-231), so this tick is a
// silent no-op.
export default async function comboMetrics(): Promise<void> {
  return;
}
