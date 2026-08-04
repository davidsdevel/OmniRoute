#!/usr/bin/env node
// K8s CronJob one-shot for the hourly scheduled backup (k8s/cronjobs.yaml →
// backup). runBackupScheduleTick() evaluates backup-schedule.json and runs the
// backup when due; a not-due tick is success (exit 0), not failure. Known
// limitation: runBackupScheduleTick swallows backup errors internally, so a
// failed backup is not exit-signaled to K8s (see the task report).

import "../../open-sse/utils/setupPolyfill.ts";

try {
  const { runBackupScheduleTick } = await import("../../src/lib/jobs/backupScheduleJob.ts");
  const ran = await runBackupScheduleTick();
  console.log(`[backup] ${ran ? "backup ran" : "no backup due this tick"} — exiting 0`);
  process.exit(0);
} catch (error) {
  console.error("[backup] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
