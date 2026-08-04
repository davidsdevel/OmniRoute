// No safe per-tick function exists: DB health is already self-scheduled in
// src/lib/db/core.ts:939-961 (6h default), and versionManager's
// open-sse/services/healthMonitor.ts is per-tool URL monitoring, not a global
// tick — calling runManagedDbHealthCheck every 10-30s would be far too
// aggressive. Silent no-op.
export default async function healthMonitor(): Promise<void> {
  return;
}
