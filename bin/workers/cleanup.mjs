#!/usr/bin/env node
// K8s CronJob one-shot for the 6-hourly TTL cleanup (k8s/cronjobs.yaml →
// cleanup). Replicates the legacy startCleanupScheduler() behavior removed
// from server-init (Task 4): runAutoCleanup() purges stale rows across the
// retention families, then a best-effort VACUUM reclaims space when rows were
// deleted. The VACUUM is best-effort because the live web pod may hold the
// SQLite file open (WAL) — the dedicated db-vacuum CronJob owns authoritative
// vacuuming. runAutoCleanup() self-gates on autoCleanupEnabled.

import "../../open-sse/utils/setupPolyfill.ts";

try {
  const { runAutoCleanup } = await import("../../src/lib/db/cleanup.ts");
  const result = await runAutoCleanup();
  if (result.totalDeleted > 0) {
    try {
      const { getDbInstance } = await import("../../src/lib/db/core.ts");
      getDbInstance().exec("VACUUM");
      console.log(`[cleanup] freed ${result.totalDeleted} rows; VACUUM completed`);
    } catch (vacErr) {
      console.warn(
        "[cleanup] VACUUM after cleanup failed (non-fatal):",
        vacErr instanceof Error ? vacErr.message : vacErr
      );
    }
  }
  console.log(
    `[cleanup] done ${JSON.stringify({ totalDeleted: result.totalDeleted, totalErrors: result.totalErrors })}`
  );
  // runAutoCleanup() catches per-family failures internally; surface them so
  // K8s backoffLimit/restartPolicy can retry (mirrors the backup finding).
  if (result.totalErrors > 0) {
    console.error(`[cleanup] ${result.totalErrors} cleanup families failed`);
    process.exit(1);
  }
  process.exit(0);
} catch (error) {
  console.error("[cleanup] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
