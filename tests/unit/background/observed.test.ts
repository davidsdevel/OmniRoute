import test from "node:test";
import assert from "node:assert/strict";
import type { Queue } from "bullmq";
import { BACKGROUND_QUEUE_NAMES } from "@/lib/background/queues";
import type { Queues } from "@/lib/background/queues";
import type { BackgroundQueueName } from "@/lib/background/queues";
import type { BackgroundRegistration } from "@/lib/background/registerBackgroundJobs";

async function register(queues: Queues): Promise<BackgroundRegistration> {
  const { registerBackgroundJobs } = await import("@/lib/background/registerBackgroundJobs");
  return registerBackgroundJobs({ queues, scheduleTimeoutMs: 1000 });
}

function enabledHandle(getJobCounts: () => Promise<Record<string, unknown>>): Queues {
  const fakeQueue = { upsertJobScheduler: async () => {} } as unknown as Queue;
  const queues = {} as Record<BackgroundQueueName, Queue>;
  for (const name of BACKGROUND_QUEUE_NAMES) queues[name] = fakeQueue;
  return {
    enabled: true,
    queues,
    async enqueue() {},
    getJobCounts,
    async close() {},
  };
}

// The first test asserts the pre-registration state, so it must run before any
// handle is registered (top-level tests run sequentially in declaration order).
test("returns a disabled empty payload before any registration", async () => {
  const { getBackgroundQueueDepth } = await import("@/lib/background/observed");
  assert.deepEqual(await getBackgroundQueueDepth(), { enabled: false, queues: {} });
});

test("reads live queue depth from a disabled handle registered in local mode", async () => {
  const { getBackgroundQueueDepth } = await import("@/lib/background/observed");
  const { initQueues } = await import("@/lib/background/queues");
  const reg = await register(initQueues(""));
  assert.equal(reg.mode, "local", "a disabled handle must select local mode");

  const depth = await getBackgroundQueueDepth();
  assert.equal(depth.enabled, false, "depth must report the disabled handle");
  for (const name of BACKGROUND_QUEUE_NAMES) {
    assert.ok(depth.queues[name], `counts for ${name} must be present`);
    assert.equal(depth.queues[name].waiting, 0, `${name}.waiting`);
    assert.equal(depth.queues[name].active, 0, `${name}.active`);
  }

  await reg.dispose();
});

test("reports enabled handle queue counts keyed by name", async () => {
  const { getBackgroundQueueDepth } = await import("@/lib/background/observed");
  const counts: Record<string, unknown> = {};
  for (const name of BACKGROUND_QUEUE_NAMES) {
    counts[name] = { waiting: 1, active: 0, delayed: 0, completed: 5, failed: 0 };
  }
  const reg = await register(
    enabledHandle(async () => {
      return counts;
    })
  );
  assert.equal(reg.mode, "queue", "an enabled handle must select queue mode");

  const depth = await getBackgroundQueueDepth();
  assert.equal(depth.enabled, true);
  assert.equal(depth.queues.tokenHealth.waiting, 1);
  assert.equal(depth.queues.tokenHealth.completed, 5);
  assert.equal(depth.queues.healthMonitor.completed, 5);

  await reg.dispose();
});

test("never throws when the handle getJobCounts rejects", async () => {
  const { getBackgroundQueueDepth } = await import("@/lib/background/observed");
  const reg = await register(
    enabledHandle(async () => {
      throw new Error("redis down");
    })
  );

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const depth = await getBackgroundQueueDepth();
    assert.deepEqual(depth, { enabled: false, queues: {} }, "must degrade to an empty payload");
  } finally {
    console.warn = originalWarn;
  }

  await reg.dispose();
});
