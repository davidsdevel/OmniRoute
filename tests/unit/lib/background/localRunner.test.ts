import test from "node:test";
import assert from "node:assert/strict";
import type { BackgroundJobName } from "@/lib/background/types";

const BACKUP_ENV = "OMNIROUTE_BACKUP_SCHEDULE_JOB_INTERVAL_MS";
const BUDGET_RESET_ENV = "OMNIROUTE_BUDGET_RESET_JOB_INTERVAL_MS";

async function withEnvVar(name: string, value: string | undefined, fn: () => void): Promise<void> {
  const orig = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (orig === undefined) delete process.env[name];
    else process.env[name] = orig;
  }
}

test("JOB_TICK_MS defaults match the live jobs", async () => {
  const { JOB_TICK_MS } = await import("@/lib/background/types");
  assert.equal(JOB_TICK_MS.backup, 30_000);
  assert.equal(JOB_TICK_MS.budgetReset, 600_000);
});

test("backup tick honors env override with 5s floor", async () => {
  const { getBackupTickMs } = await import("@/lib/background/localRunner");
  await withEnvVar(BACKUP_ENV, undefined, () => {
    assert.equal(getBackupTickMs(30_000), 30_000);
  });
  await withEnvVar(BACKUP_ENV, "9999", () => {
    assert.equal(getBackupTickMs(30_000), 9999);
  });
  await withEnvVar(BACKUP_ENV, "1000", () => {
    assert.equal(getBackupTickMs(30_000), 30_000);
  });
});

test("budgetReset tick honors env override with 10s floor", async () => {
  const { getBudgetResetTickMs } = await import("@/lib/background/localRunner");
  await withEnvVar(BUDGET_RESET_ENV, undefined, () => {
    assert.equal(getBudgetResetTickMs(600_000), 600_000);
  });
  await withEnvVar(BUDGET_RESET_ENV, "11111", () => {
    assert.equal(getBudgetResetTickMs(600_000), 11111);
  });
  await withEnvVar(BUDGET_RESET_ENV, "999", () => {
    assert.equal(getBudgetResetTickMs(600_000), 600_000);
  });
});

test("startLocalTimers runs budgetReset once immediately, other jobs only on interval", async () => {
  const { startLocalTimers, stopLocalTimers } = await import("@/lib/background/localRunner");
  const { JOB_TICK_MS } = await import("@/lib/background/types");

  const calls = new Map<string, number>();
  const makeRunner = (name: string) => async () => {
    calls.set(name, (calls.get(name) ?? 0) + 1);
  };

  const runners = new Map<BackgroundJobName, () => Promise<void>>();
  runners.set("budgetReset", makeRunner("budgetReset"));
  runners.set("tokenHealth", makeRunner("tokenHealth"));

  const stop = startLocalTimers(runners, JOB_TICK_MS);
  try {
    assert.equal(calls.get("budgetReset"), 1, "budgetReset must run immediately at start");
    assert.equal(calls.get("tokenHealth"), undefined, "other jobs must not run at start");
  } finally {
    stop();
  }
});
