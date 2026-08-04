import test from "node:test";
import assert from "node:assert/strict";
import type { Queue } from "bullmq";
import { BACKGROUND_QUEUE_NAMES } from "@/lib/background/queues";
import type { Queues } from "@/lib/background/queues";
import type { BackgroundQueueName } from "@/lib/background/queues";

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

test("local mode: empty REDIS_URL starts local timers and the double-call guard caches", async () => {
  const { registerBackgroundJobs } = await import("@/lib/background/registerBackgroundJobs");
  await withEnvVar("REDIS_URL", "", async () => {
    const reg = await registerBackgroundJobs();
    assert.equal(reg.mode, "local", "empty REDIS_URL must select local mode");
    assert.equal(reg.queues.enabled, false, "queues handle must be the disabled one");

    const again = await registerBackgroundJobs();
    assert.equal(again, reg, "second call must return the cached registration");

    await reg.dispose();
    const fresh = await registerBackgroundJobs();
    assert.notEqual(fresh, reg, "a disposed registration can be replaced");
    assert.equal(fresh.mode, "local");
    await fresh.dispose();
  });
});

test("queue mode: injected enabled queues registers the repeatables and dispose closes", async () => {
  const { registerBackgroundJobs } = await import("@/lib/background/registerBackgroundJobs");

  const scheduled: string[] = [];
  let closed = false;
  const fakeQueue = {
    upsertJobScheduler: async (name: string) => {
      scheduled.push(name);
    },
  } as unknown as Queue;
  const queues: Record<BackgroundQueueName, Queue> = {} as Record<BackgroundQueueName, Queue>;
  for (const name of BACKGROUND_QUEUE_NAMES) {
    queues[name] = fakeQueue;
  }
  const fakeQueues: Queues = {
    enabled: true,
    queues,
    async enqueue() {},
    async getJobCounts() {
      return {};
    },
    async close() {
      closed = true;
    },
  };

  const reg = await registerBackgroundJobs({ queues: fakeQueues, scheduleTimeoutMs: 1000 });
  assert.equal(reg.mode, "queue", "an enabled queues handle must select queue mode");
  assert.equal(
    scheduled.length,
    BACKGROUND_QUEUE_NAMES.length,
    "all 9 repeatables must be scheduled"
  );
  for (const name of BACKGROUND_QUEUE_NAMES) {
    assert.ok(scheduled.includes(name), `${name} must be scheduled`);
  }

  await reg.dispose();
  assert.equal(closed, true, "dispose must close the queues handle");
});
