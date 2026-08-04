import test from "node:test";
import assert from "node:assert/strict";
import type { BackgroundJobName } from "@/lib/background/types";

const ALL_JOB_NAMES: BackgroundJobName[] = [
  "tokenHealth",
  "browserPool",
  "providerLimits",
  "accountFallback",
  "comboMetrics",
  "healthMonitor",
  "autoRefresh",
  "spendBatch",
  "reasoningCacheCleanup",
  "pricingSync",
  "backup",
  "dbVacuum",
  "budgetReset",
  "callLogRotation",
  "cleanup",
];

async function withEnvVar(
  name: string,
  value: string | undefined,
  fn: () => Promise<void> | void
): Promise<void> {
  const orig = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    await fn();
  } finally {
    if (orig === undefined) delete process.env[name];
    else process.env[name] = orig;
  }
}

test("getEnabledJobNames returns all 15 names by default", async () => {
  const { getEnabledJobNames } = await import("@/lib/background/registry");
  const enabled = getEnabledJobNames();
  assert.equal(enabled.length, ALL_JOB_NAMES.length, "all 15 jobs must be enabled by default");
  for (const name of ALL_JOB_NAMES) {
    assert.ok(enabled.includes(name), `${name} must be enabled by default`);
  }
});

test("getEnabledJobNames honors OMNIROUTE_DISABLED_BACKGROUND_JOBS", async () => {
  const { getEnabledJobNames } = await import("@/lib/background/registry");
  await withEnvVar("OMNIROUTE_DISABLED_BACKGROUND_JOBS", "tokenHealth, budgetReset", () => {
    const enabled = getEnabledJobNames();
    assert.ok(!enabled.includes("tokenHealth"), "tokenHealth must be disabled");
    assert.ok(!enabled.includes("budgetReset"), "budgetReset must be disabled");
    assert.ok(enabled.includes("cleanup"), "unlisted jobs stay enabled");
    assert.equal(enabled.length, ALL_JOB_NAMES.length - 2, "only the two disabled are dropped");
  });
});

test("jobRunner resolves a real runner function for every name (registry roundtrip)", async () => {
  const { jobRunner } = await import("@/lib/background/registry");
  for (const name of ALL_JOB_NAMES) {
    const runner = await jobRunner(name);
    assert.equal(typeof runner, "function", `${name} must resolve to a callable runner`);
    // Named default exports distinguish a real wrapper module from the anonymous
    // import fallback — a silent fallback here means a broken wrapper.
    assert.ok(runner.name, `${name} must resolve to a named wrapper function, not the fallback`);
  }
});

test("jobRunner caches resolved runners across calls", async () => {
  const { jobRunner } = await import("@/lib/background/registry");
  const first = await jobRunner("pricingSync");
  const second = await jobRunner("pricingSync");
  assert.equal(first, second, "repeat resolution must return the cached runner");
});

test("jobRunner degrades to a no-op fallback for an unresolvable name without throwing", async () => {
  const { jobRunner } = await import("@/lib/background/registry");
  const originalError = console.error;
  const originalLog = console.log;
  console.error = () => {};
  console.log = () => {};
  try {
    const runner = await jobRunner("doesNotExist" as BackgroundJobName);
    assert.equal(typeof runner, "function", "the fallback must still be callable");
    await runner();
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
});
