import { initQueues, scheduleRepeatableJobs } from "./queues";
import type { Queues } from "./queues";
import { getEnabledJobNames, jobRunner } from "./registry";
import type { JobRunner } from "./registry";
import { startLocalTimers } from "./localRunner";
import { JOB_TICK_MS } from "./types";
import type { BackgroundJobName } from "./types";

/**
 * Queue-vs-local selector for the periodic background loops.
 *
 * Production callers (`instrumentation-node.ts`, dead-code `server-init.ts`)
 * call `registerBackgroundJobs()` with no arguments: REDIS_URL present →
 * BullMQ queue mode (repeatable schedulers registered here, consumed by the
 * separate worker process from Task 3); REDIS_URL empty → in-process
 * local-timer mode (the legacy single-node behavior). `options` is a test
 * seam and is never passed in production.
 *
 * NEVER throws on Redis absence/unreachability: an empty REDIS_URL yields a
 * disabled `Queues` handle from `initQueues()`, and scheduling failures are
 * warned, never thrown. On a repeatable-scheduling timeout the caller still
 * returns `{ mode: "queue" }` — the worker (`bin/worker.mjs`) registers the
 * schedulers in production, so a slow Redis here is non-fatal.
 */

export type BackgroundMode = "queue" | "local";

export interface BackgroundRegistration {
  mode: BackgroundMode;
  queues: Queues;
  dispose(): Promise<void>;
}

const SCHEDULE_TIMEOUT_MS = 15_000;

let activeRegistration: BackgroundRegistration | null = null;

/**
 * The active background queues handle, or null before `registerBackgroundJobs()`
 * has run. Read by the health endpoint (via `src/lib/background/observed.ts`) so
 * it can report live queue depth without owning a second Redis connection.
 */
export function getActiveBackgroundQueues(): Queues | null {
  return activeRegistration?.queues ?? null;
}

export interface RegisterBackgroundJobsOptions {
  /** Test seam — production callers omit this and let initQueues() read REDIS_URL. */
  queues?: Queues;
  scheduleTimeoutMs?: number;
}

export async function registerBackgroundJobs(
  options: RegisterBackgroundJobsOptions = {}
): Promise<BackgroundRegistration> {
  // Module-level guard: a second call while a registration is active returns
  // the cached registration (never double-start timers or double-register
  // schedulers). A disposed registration is replaced freely.
  if (activeRegistration) return activeRegistration;

  const queues = options.queues ?? initQueues();

  if (queues.enabled) {
    const scheduleTimeoutMs = options.scheduleTimeoutMs ?? SCHEDULE_TIMEOUT_MS;
    let timedOut = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        resolve();
      }, scheduleTimeoutMs);
      if (typeof timeoutTimer === "object" && timeoutTimer !== null && "unref" in timeoutTimer) {
        (timeoutTimer as { unref: () => void }).unref();
      }
    });
    try {
      await Promise.race([
        // scheduleRepeatableJobs never rejects (per-queue try/catch inside),
        // but swallow a rejection so a stubborn driver can't crash boot.
        scheduleRepeatableJobs(queues).catch((error) => {
          console.warn("[background] Failed to register repeatable schedulers (non-fatal):", error);
        }),
        timeoutPromise,
      ]);
    } catch (error) {
      console.warn("[background] Failed to register repeatable schedulers (non-fatal):", error);
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
    }
    if (timedOut) {
      console.warn(
        `[background] scheduleRepeatableJobs exceeded the ${scheduleTimeoutMs}ms cap — the worker process registers the repeatables`
      );
    }

    const registration: BackgroundRegistration = {
      mode: "queue",
      queues,
      dispose: async () => {
        try {
          await queues.close();
        } catch (error) {
          console.warn("[background] Failed to close background queues (non-fatal):", error);
        }
        if (activeRegistration === registration) activeRegistration = null;
      },
    };
    activeRegistration = registration;
    return registration;
  }

  // Local mode: mirror the legacy single-node in-process timers. dbVacuum is
  // excluded (single-ownership decision): the 24h dbVacuum registry job owns
  // vacuuming (K8s CronJob in queue mode, Task 5), so the settings-driven
  // vacuum scheduler is gone and must not be re-armed here.
  const runners = new Map<BackgroundJobName, JobRunner>();
  for (const name of getEnabledJobNames()) {
    if (name === "dbVacuum") continue;
    runners.set(name, await jobRunner(name));
  }
  const stopTimers = startLocalTimers(runners, JOB_TICK_MS);

  const registration: BackgroundRegistration = {
    mode: "local",
    queues,
    dispose: async () => {
      stopTimers();
      if (activeRegistration === registration) activeRegistration = null;
    },
  };
  activeRegistration = registration;
  return registration;
}
