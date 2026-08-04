#!/usr/bin/env node
// K8s CronJob one-shot for the 10-minute budget schedule sync (k8s/cronjobs.yaml
// → budget-reset). syncAllBudgetSchedules() persists any overdue resets; a run
// is success (exit 0) unless it throws.

import "../../open-sse/utils/setupPolyfill.ts";

try {
  const { syncAllBudgetSchedules } = await import("../../src/domain/costRules.ts");
  const result = await syncAllBudgetSchedules(Date.now());
  console.log(`[budget-reset] done ${JSON.stringify(result)}`);
  process.exit(0);
} catch (error) {
  console.error("[budget-reset] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
