import test from "node:test";
import assert from "node:assert/strict";

const FREQUENT_JOB_NAMES = [
  "tokenHealth",
  "browserPool",
  "providerLimits",
  "accountFallback",
  "comboMetrics",
  "healthMonitor",
  "autoRefresh",
  "spendBatch",
  "reasoningCacheCleanup",
];

const SCHEDULED_JOB_NAMES = ["pricingSync", "backup", "dbVacuum", "budgetReset", "callLogRotation"];

const COUNT_KEYS = ["waiting", "active", "delayed", "completed", "failed"];

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

test("initQueues with empty REDIS_URL returns a non-throwing handle with zero counts", async () => {
  const { initQueues } = await import("@/lib/background/queues");
  const handle = initQueues("");
  assert.equal(handle.enabled, false, "empty URL must yield a disabled handle");

  const counts = await handle.getJobCounts();
  for (const name of FREQUENT_JOB_NAMES) {
    assert.ok(counts[name], `counts for ${name} must be present`);
    assert.equal(counts[name].waiting, 0, `${name}.waiting`);
    assert.equal(counts[name].active, 0, `${name}.active`);
    assert.equal(counts[name].delayed, 0, `${name}.delayed`);
    assert.equal(counts[name].completed, 0, `${name}.completed`);
    assert.equal(counts[name].failed, 0, `${name}.failed`);
  }

  await handle.close();
  await handle.enqueue("tokenHealth");
});

test("initQueues() defaults to the REDIS_URL env var when the arg is omitted", async () => {
  const { initQueues } = await import("@/lib/background/queues");
  await withEnvVar("REDIS_URL", "", async () => {
    const handle = initQueues();
    assert.equal(handle.enabled, false, "empty REDIS_URL default must yield a disabled handle");
    const counts = await handle.getJobCounts();
    for (const name of FREQUENT_JOB_NAMES) {
      assert.ok(counts[name], `counts for ${name} must be present via env default`);
    }
  });
});

test("getJobCounts shape exposes numeric waiting/active/delayed/completed/failed keys", async () => {
  const { initQueues, normalizeJobCounts } = await import("@/lib/background/queues");
  const handle = initQueues("");
  const counts = await handle.getJobCounts();
  const sample = counts.tokenHealth;
  for (const key of COUNT_KEYS) {
    assert.ok(key in sample, `${key} key must be present`);
    assert.equal(typeof sample[key], "number", `${key} must be numeric`);
  }

  assert.deepEqual(normalizeJobCounts({}), {
    waiting: 0,
    active: 0,
    delayed: 0,
    completed: 0,
    failed: 0,
  });
  assert.equal(normalizeJobCounts({ waiting: 7, completed: 2 }).waiting, 7);
  assert.equal(normalizeJobCounts(undefined).active, 0);
});

test("repeatable spec table matches the plan cadences", async () => {
  const { REPEATABLE_JOB_SPEC } = await import("@/lib/background/queues");
  assert.equal(REPEATABLE_JOB_SPEC.tokenHealth.every, 30_000);
  assert.equal(REPEATABLE_JOB_SPEC.browserPool.every, 60_000);
  assert.equal(REPEATABLE_JOB_SPEC.providerLimits.every, 300_000);
  assert.equal(REPEATABLE_JOB_SPEC.accountFallback.every, 60_000);
  assert.equal(REPEATABLE_JOB_SPEC.comboMetrics.every, 300_000);
  assert.equal(REPEATABLE_JOB_SPEC.healthMonitor.every, 10_000);
  assert.equal(REPEATABLE_JOB_SPEC.autoRefresh.every, 300_000);
  assert.equal(REPEATABLE_JOB_SPEC.spendBatch.every, 60_000);
  assert.equal(REPEATABLE_JOB_SPEC.reasoningCacheCleanup.every, 1_800_000);
});

test("scheduled jobs stay K8s CronJobs and are NOT repeatable BullMQ jobs", async () => {
  const { REPEATABLE_JOB_SPEC, BACKGROUND_QUEUE_NAMES } = await import("@/lib/background/queues");
  for (const name of SCHEDULED_JOB_NAMES) {
    assert.ok(!(name in REPEATABLE_JOB_SPEC), `${name} must not be in the repeatable spec`);
    assert.ok(
      !BACKGROUND_QUEUE_NAMES.includes(name as never),
      `${name} must not be in BACKGROUND_QUEUE_NAMES`
    );
  }
  assert.equal(BACKGROUND_QUEUE_NAMES.length, 9);
});
