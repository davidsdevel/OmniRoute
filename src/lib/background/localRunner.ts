import type { BackgroundJobName } from "./types";
import type { JobRunner } from "./registry";

type TimerHandle = ReturnType<typeof setInterval>;

const activeTimers = new Map<BackgroundJobName, TimerHandle>();

export function startLocalTimers(
  runners: Map<BackgroundJobName, JobRunner>,
  tickMs: Record<BackgroundJobName, number>
): () => void {
  for (const [name, runner] of runners) {
    const interval = tickMs[name];
    if (!interval) continue;

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
