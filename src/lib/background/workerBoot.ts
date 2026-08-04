import { Worker } from "bullmq";
import type { Job, Processor } from "bullmq";
import { jobRunner } from "./registry";
import {
  BACKGROUND_QUEUE_NAMES,
  QUEUE_PREFIX,
  queueNameFor,
  createRedisConnection,
} from "./queues";
import type { BackgroundJobName } from "./types";

/**
 * One BullMQ Worker per frequent queue, each with `concurrency: 1`.
 *
 * concurrency 1 guarantees a queue never runs two jobs in parallel (single
 * SQLite writer per table family). This is the same overlap profile the old
 * in-process timers already had across different jobs — BullMQ keeps each
 * queue's cadence independent while serializing within a queue.
 */

export interface WorkerHandle {
  workers: Worker[];
  close(): Promise<void>;
}

function createProcessor(): Processor<unknown, void, string> {
  return async (job: Job<unknown, void, string>): Promise<void> => {
    const name = resolveJobName(job);
    const runner = await jobRunner(name);
    await runner();
  };
}

function resolveJobName(job: Job<unknown, void, string>): BackgroundJobName {
  const name = job.name;
  if (name && name !== "__default__") {
    return name as BackgroundJobName;
  }
  const prefix = `${QUEUE_PREFIX}-`;
  if (job.queueName.startsWith(prefix)) {
    return job.queueName.slice(prefix.length) as BackgroundJobName;
  }
  return name as BackgroundJobName;
}

/** Message-gated throttle so a reconnecting Redis does not flood stderr. */
function createThrottledLogger(prefix: string): (err: unknown) => void {
  let last: string | null = null;
  return (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (message === last) return;
    last = message;
    console.warn(prefix, message);
  };
}

/**
 * Start one BullMQ Worker per frequent queue (concurrency 1 each).
 *
 * Throws a descriptive error when `redisUrl` is empty — the caller
 * (bin/worker.mjs) decides how to degrade. A failed job is logged and marked
 * failed by BullMQ itself; we never rethrow from the processor.
 */
export async function startWorker(redisUrl: string): Promise<WorkerHandle> {
  const url = (redisUrl ?? "").trim();
  if (!url) {
    throw new Error("[background] startWorker requires a non-empty REDIS_URL");
  }

  const connection = createRedisConnection(url);
  const processor = createProcessor();
  const workers: Worker[] = [];

  for (const name of BACKGROUND_QUEUE_NAMES) {
    const worker = new Worker(queueNameFor(name), processor, {
      connection,
      concurrency: 1,
      skipVersionCheck: true,
      name: `${name}-worker`,
    });
    worker.on("error", createThrottledLogger(`[background] worker ${name} error:`));
    worker.on("failed", (job, err) => {
      console.error(`[background] job ${job?.name ?? name} failed:`, err?.message ?? err);
    });
    workers.push(worker);
  }

  return {
    workers,
    close: async () => {
      await Promise.all(workers.map((w) => w.close()));
      await connection.quit().catch(() => {});
    },
  };
}
