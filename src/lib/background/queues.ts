import { Queue } from "bullmq";
import Redis from "ioredis";
import type { BackgroundJobName } from "./types";

/**
 * BullMQ queue layer for the 9 frequent background jobs.
 *
 * The 5 scheduled jobs (pricingSync, backup, dbVacuum, budgetReset,
 * callLogRotation) intentionally stay K8s CronJobs — they get NO BullMQ
 * queue or repeatable job here (Task 5 of the workers plan).
 */

export type BackgroundQueueName =
  | "tokenHealth"
  | "browserPool"
  | "providerLimits"
  | "accountFallback"
  | "comboMetrics"
  | "healthMonitor"
  | "autoRefresh"
  | "spendBatch"
  | "reasoningCacheCleanup";

export const BACKGROUND_QUEUE_NAMES: BackgroundQueueName[] = [
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

/**
 * Namespace for the background queues. BullMQ v6 forbids `:` in queue names
 * (the Redis key separator is `:`), so the namespace uses hyphens.
 */
export const QUEUE_PREFIX = "omniroute-bg";

export interface RepeatSpec {
  every: number;
}

/**
 * Repeatable-job cadences. Only the frequent jobs repeat inside BullMQ;
 * scheduled jobs are owned by K8s CronJobs (Task 5).
 */
export const REPEATABLE_JOB_SPEC: Record<BackgroundQueueName, RepeatSpec> = {
  tokenHealth: { every: 30_000 },
  browserPool: { every: 60_000 },
  providerLimits: { every: 300_000 },
  accountFallback: { every: 60_000 },
  comboMetrics: { every: 300_000 },
  healthMonitor: { every: 10_000 },
  autoRefresh: { every: 300_000 },
  spendBatch: { every: 60_000 },
  reasoningCacheCleanup: { every: 1_800_000 },
};

/** Map a background job name to its BullMQ queue name. */
export function queueNameFor(name: BackgroundQueueName): string {
  return `${QUEUE_PREFIX}-${name}`;
}

export interface JobCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
}

export function normalizeJobCounts(raw: Record<string, number> | undefined): JobCounts {
  return {
    waiting: raw?.waiting ?? 0,
    active: raw?.active ?? 0,
    delayed: raw?.delayed ?? 0,
    completed: raw?.completed ?? 0,
    failed: raw?.failed ?? 0,
  };
}

/**
 * Message-gated log throttle so a reconnecting Redis does not flood stderr
 * with identical lines (mirrors the pattern in shared/utils/rateLimiter.ts).
 */
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
 * Shared ioredis connection for the BullMQ layer.
 *
 * `maxRetriesPerRequest: null` is mandatory for BullMQ (it manages its own
 * retry policy on the blocking connections). `retryStrategy` mirrors the
 * repo's rateLimiter backoff but is bounded: after ~30 attempts ioredis gives
 * up and rejects pending commands, so `getJobCounts()` can never hang forever
 * on a dead Redis.
 */
export function createRedisConnection(redisUrl: string): Redis {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      if (times > 30) return null;
      return Math.min(times * 50, 2000);
    },
  });
  client.on("error", createThrottledLogger("[background] redis:"));
  return client;
}

export interface Queues {
  /** True only when REDIS_URL was present and real BullMQ queues were built. */
  enabled: boolean;
  /**
   * One BullMQ Queue per frequent job name. Undefined when `enabled` is false
   * (empty REDIS_URL) — check `enabled` before touching this.
   */
  queues?: Record<BackgroundQueueName, Queue>;
  /** Enqueue a one-off run of a frequent job. No-op on a disabled handle. */
  enqueue(name: BackgroundQueueName, data?: unknown): Promise<void>;
  /**
   * Non-throwing depth snapshot keyed by queue name. On a disabled handle it
   * resolves to zero counts for every frequent queue; on Redis failure it
   * resolves to whatever succeeded (possibly `{}`). Never rejects.
   */
  getJobCounts(): Promise<Record<string, JobCounts>>;
  close(): Promise<void>;
}

function resolveRedisUrl(redisUrl?: string): string {
  // Explicit argument wins; falling back to REDIS_URL only when the argument
  // is undefined (not when it is an explicit empty string).
  const explicit = redisUrl === undefined ? undefined : redisUrl.trim();
  if (explicit !== undefined) return explicit;
  return (process.env.REDIS_URL ?? "").trim();
}

function createNoopQueues(): Queues {
  return {
    enabled: false,
    queues: undefined,
    async enqueue() {
      // No Redis configured — deliberately a no-op.
    },
    async getJobCounts() {
      const out: Record<string, JobCounts> = {};
      for (const name of BACKGROUND_QUEUE_NAMES) {
        out[name] = normalizeJobCounts({});
      }
      return out;
    },
    async close() {
      // No Redis configured — deliberately a no-op.
    },
  };
}

/**
 * Build the BullMQ queue layer.
 *
 * Empty/undefined REDIS_URL does NOT throw: it returns a disabled handle whose
 * `getJobCounts()` resolves to zero counts and whose `enqueue`/`close` are
 * no-ops, so the health endpoint and server boot stay safe without Redis.
 */
export function initQueues(redisUrl?: string): Queues {
  const url = resolveRedisUrl(redisUrl);
  if (!url) {
    return createNoopQueues();
  }

  const connection = createRedisConnection(url);
  const queues = {} as Record<BackgroundQueueName, Queue>;
  const logQueueError = createThrottledLogger("[background] queue:");
  for (const name of BACKGROUND_QUEUE_NAMES) {
    queues[name] = new Queue(queueNameFor(name), {
      connection,
      skipVersionCheck: true,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 1_000 },
      },
    });
    queues[name].on("error", logQueueError);
  }

  return {
    enabled: true,
    queues,
    async enqueue(name, data = {}) {
      const q = queues[name];
      if (!q) return;
      try {
        await q.add(name, data, { attempts: 1 });
      } catch (error) {
        console.warn(`[background] enqueue ${name} failed:`, error);
      }
    },
    async getJobCounts() {
      const out: Record<string, JobCounts> = {};
      for (const name of BACKGROUND_QUEUE_NAMES) {
        const q = queues[name];
        if (!q) continue;
        try {
          const raw = await q.getJobCounts();
          out[name] = normalizeJobCounts(raw);
        } catch {
          // Never crash the health endpoint on a dead queue — skip it.
        }
      }
      return out;
    },
    async close() {
      await Promise.all(BACKGROUND_QUEUE_NAMES.map((name) => queues[name]?.close()));
      await connection.quit().catch(() => {});
    },
  };
}

/**
 * Register the repeatable-job schedulers (v6 `upsertJobScheduler`, the
 * modern replacement for the `repeat` job option). Each upsert is isolated so
 * one failing queue does not kill the rest.
 */
export async function scheduleRepeatableJobs(queues: Queues): Promise<void> {
  if (!queues.enabled || !queues.queues) return;

  await Promise.all(
    BACKGROUND_QUEUE_NAMES.map(async (name) => {
      const q = queues.queues?.[name];
      const spec = REPEATABLE_JOB_SPEC[name];
      if (!q || !spec) return;
      try {
        await q.upsertJobScheduler(name, { every: spec.every }, { name });
      } catch (error) {
        console.warn(`[background] failed to schedule repeatable job ${name}:`, error);
      }
    })
  );
}
