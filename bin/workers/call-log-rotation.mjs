#!/usr/bin/env node
// K8s CronJob one-shot for the 24h request-artifact rotation (k8s/cronjobs.yaml
// → call-log-rotation). rotateCallLogs() is synchronous and idempotent. The
// module also schedules a throttled rotation at import time when persistence is
// on (callLogs.ts:765-767), so this process may rotate twice — both calls are
// idempotent and safe.

import "../../open-sse/utils/setupPolyfill.ts";

try {
  const { rotateCallLogs } = await import("../../src/lib/usage/callLogs.ts");
  rotateCallLogs();
  console.log("[call-log-rotation] rotation complete — exiting 0");
  process.exit(0);
} catch (error) {
  console.error("[call-log-rotation] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
