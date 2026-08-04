#!/usr/bin/env node
// K8s CronJob one-shot for the 24h database vacuum (k8s/cronjobs.yaml →
// db-vacuum). runNow() vacuums unconditionally and does NOT self-gate on the
// scheduledVacuum setting — the "never" gate only lives in the timer path
// (vacuumScheduler.ts applySchedule → armTimer) — so this entrypoint mirrors
// the setting itself before calling it.

import "../../open-sse/utils/setupPolyfill.ts";

try {
  const { getDatabaseSettings } = await import("../../src/lib/db/databaseSettings.ts");
  if (getDatabaseSettings().optimization.scheduledVacuum === "never") {
    console.log("[db-vacuum] skipped (scheduledVacuum=never) — exiting 0");
    process.exit(0);
  }

  const { runNow } = await import("../../src/lib/db/vacuumScheduler.ts");
  const result = await runNow();
  if (result.error === "already_running") {
    // The web pod holds the DB in use — not a failure of this job.
    console.log("[db-vacuum] already running (web pod) — exiting 0");
    process.exit(0);
  }
  console.log(
    `[db-vacuum] done ${JSON.stringify({ success: result.success, durationMs: result.durationMs })}`
  );
  process.exit(result.success ? 0 : 1);
} catch (error) {
  console.error("[db-vacuum] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
