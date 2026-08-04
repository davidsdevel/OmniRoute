export type BackgroundJobName =
  | "tokenHealth"
  | "browserPool"
  | "providerLimits"
  | "accountFallback"
  | "comboMetrics"
  | "healthMonitor"
  | "autoRefresh"
  | "spendBatch"
  | "reasoningCacheCleanup"
  | "pricingSync"
  | "backup"
  | "dbVacuum"
  | "budgetReset"
  | "callLogRotation"
  | "cleanup";

export const JOB_TICK_MS: Record<BackgroundJobName, number> = {
  tokenHealth: 300_000,
  browserPool: 60_000,
  providerLimits: 300_000,
  accountFallback: 120_000,
  comboMetrics: 60_000,
  healthMonitor: 30_000,
  autoRefresh: 300_000,
  spendBatch: 60_000,
  reasoningCacheCleanup: 3_600_000,
  pricingSync: 86_400_000,
  backup: 30_000,
  dbVacuum: 86_400_000,
  budgetReset: 600_000,
  callLogRotation: 86_400_000,
  cleanup: 3_600_000,
};
