import type { BackgroundJobName } from "./types";
import type { JobRunner } from "./registry";

type TimerHandle = ReturnType<typeof setInterval>;

const BACKUP_TICK_ENV = "OMNIROUTE_BACKUP_SCHEDULE_JOB_INTERVAL_MS";
const BUDGET_RESET_TICK_ENV = "OMNIROUTE_BUDGET_RESET_JOB_INTERVAL_MS";
const BACKUP_TICK_FLOOR_MS = 5_000;
const BUDGET_RESET_TICK_FLOOR_MS = 10_000;

const activeTimers = new Map<BackgroundJobName, TimerHandle>();

function effectiveTickMs(envName: string, floorMs: number, fallbackMs: number): number {
  const raw = process.env[envName];
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= floorMs ? parsed : fallbackMs;
}

export function getBackupTickMs(fallbackMs: number): number {
  return effectiveTickMs(BACKUP_TICK_ENV, BACKUP_TICK_FLOOR_MS, fallbackMs);
}

export function getBudgetResetTickMs(fallbackMs: number): number {
  return effectiveTickMs(BUDGET_RESET_TICK_ENV, BUDGET_RESET_TICK_FLOOR_MS, fallbackMs);
}

export function startLocalTimers(
  runners: Map<BackgroundJobName, JobRunner>,
  tickMs: Record<BackgroundJobName, number>
): () => void {
  for (const [name, runner] of runners) {
    let interval = tickMs[name];
    if (!interval) continue;

    if (name === "backup") {
      interval = getBackupTickMs(interval);
    } else if (name === "budgetReset") {
      interval = getBudgetResetTickMs(interval);
      runner().catch((error) => {
        console.error(`Background job ${name} failed:`, error);
      });
    }

    const timer = setInterval(async () => {
      try {
        await runner();
      } catch (error) {
        console.error(`Background job ${name} failed:`, error);
      }
    }, interval);

    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      (timer as { unref: () => void }).unref();
    }
    activeTimers.set(name, timer);
  }

  return stopLocalTimers;
}

export function stopLocalTimers(): void {
  for (const [, timer] of activeTimers) {
    clearInterval(timer);
  }
  activeTimers.clear();
}
