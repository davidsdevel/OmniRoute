import { getActiveBackgroundQueues } from "./registerBackgroundJobs";
import type { JobCounts } from "./queues";

export interface BackgroundQueueDepth {
  enabled: boolean;
  queues: Record<string, JobCounts>;
}

export const EMPTY_BACKGROUND_QUEUE_DEPTH: BackgroundQueueDepth = {
  enabled: false,
  queues: {},
};

/**
 * Non-blocking snapshot of the active background queues for the health
 * endpoint. Never throws and never degrades health: no active registration, a
 * disabled handle (empty REDIS_URL), or a Redis read failure all resolve to an
 * empty/disabled payload — a background outage must not flip the overall
 * status.
 */
export async function getBackgroundQueueDepth(): Promise<BackgroundQueueDepth> {
  try {
    const queues = getActiveBackgroundQueues();
    if (!queues) return EMPTY_BACKGROUND_QUEUE_DEPTH;
    const counts = await queues.getJobCounts();
    return { enabled: queues.enabled, queues: counts };
  } catch (error) {
    console.warn("[background] queue depth read failed (non-fatal):", error);
    return EMPTY_BACKGROUND_QUEUE_DEPTH;
  }
}
