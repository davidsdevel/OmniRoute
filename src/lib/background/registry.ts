import type { BackgroundJobName } from "./types";

export type JobRunner = () => Promise<void>;

async function importJobRunner(name: BackgroundJobName): Promise<JobRunner> {
  const modulePath = `@/lib/background/jobs/${name}`;
  try {
    const imported = await import(modulePath);
    const fn = imported.default ?? imported.run ?? imported[name];
    if (typeof fn !== "function") {
      throw new Error(`Job runner for ${name} is not a function`);
    }
    return fn;
  } catch (error) {
    console.error(`[background] Failed to load job runner for ${name}:`, error);
    return async () => {
      console.log(`[background] ${name} not yet wired — skipping`);
    };
  }
}

const runnerCache = new Map<BackgroundJobName, JobRunner>();

export async function jobRunner(name: BackgroundJobName): Promise<JobRunner> {
  const cached = runnerCache.get(name);
  if (cached) return cached;

  const runner = await importJobRunner(name);
  runnerCache.set(name, runner);
  return runner;
}

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

function getProcessEnv(): Record<string, string | undefined> {
  if (typeof globalThis !== "undefined" && "process" in globalThis) {
    const proc = (globalThis as { process?: { env: Record<string, string | undefined> } }).process;
    if (proc?.env) return proc.env;
  }
  return {};
}

function getDisabledJobs(): Set<string> {
  const env = getProcessEnv();
  const disabledEnv = env.OMNIROUTE_DISABLED_BACKGROUND_JOBS;
  if (!disabledEnv) return new Set();
  return new Set(disabledEnv.split(",").map((s: string) => s.trim()));
}

export function getEnabledJobNames(): BackgroundJobName[] {
  const disabled = getDisabledJobs();
  return ALL_JOB_NAMES.filter((name) => !disabled.has(name));
}
