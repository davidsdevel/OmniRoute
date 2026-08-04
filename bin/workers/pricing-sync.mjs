#!/usr/bin/env node
// K8s CronJob one-shot for the opt-in external pricing sync (k8s/cronjobs.yaml
// → pricing-sync). Runs syncPricingFromSources() once and exits. The env gate
// mirrors the registry job (jobs/pricingSync.ts) and initPricingSync's own
// self-gate (src/lib/pricingSync.ts:505): disabled is success, not failure.

import "../../open-sse/utils/setupPolyfill.ts";

try {
  if (process.env.PRICING_SYNC_ENABLED !== "true") {
    console.log("[pricing-sync] disabled (PRICING_SYNC_ENABLED != true) — exiting 0");
    process.exit(0);
  }

  const { syncPricingFromSources } = await import("../../src/lib/pricingSync.ts");
  const result = await syncPricingFromSources();
  console.log(
    `[pricing-sync] synced ${result.modelCount} models across ${result.providerCount} providers ` +
      `from ${result.source} (success=${result.success})`
  );
  process.exit(result.success ? 0 : 1);
} catch (error) {
  console.error("[pricing-sync] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
