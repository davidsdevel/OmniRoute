/**
 * One-shot CronJob entrypoints smoke tests.
 *
 * Static-content verification of bin/workers/*.mjs — the one-shots are
 * top-level-execute (they call process.exit), so source assertions are the
 * right tool, modeled on tests/integration/integration-wiring.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

function readProjectFile(relPath: string) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

const ONE_SHOTS: { path: string; domainFunction: string }[] = [
  { path: "bin/workers/pricing-sync.mjs", domainFunction: "syncPricingFromSources" },
  { path: "bin/workers/backup.mjs", domainFunction: "runBackupScheduleTick" },
  { path: "bin/workers/db-vacuum.mjs", domainFunction: "runNow" },
  { path: "bin/workers/budget-reset.mjs", domainFunction: "syncAllBudgetSchedules" },
  { path: "bin/workers/call-log-rotation.mjs", domainFunction: "rotateCallLogs" },
  { path: "bin/workers/cleanup.mjs", domainFunction: "runAutoCleanup" },
];

test("all 6 one-shot CronJob entrypoints exist", () => {
  for (const { path } of ONE_SHOTS) {
    assert.ok(existsSync(join(ROOT, path)), `${path} should exist`);
  }
});

test("each one-shot imports the real domain function, exits explicitly, and guards with try/catch", () => {
  for (const { path, domainFunction } of ONE_SHOTS) {
    const src = readProjectFile(path);
    assert.ok(src, `${path} should exist`);
    assert.match(src, new RegExp(domainFunction), `${path} should import ${domainFunction}`);
    assert.match(src, /process\.exit\(0\)/, `${path} should exit 0 on success`);
    assert.match(src, /process\.exit\(1\)/, `${path} should exit 1 on failure`);
    assert.match(src, /try\s*\{/, `${path} should guard work in try`);
    assert.match(src, /\bcatch\s*\(/, `${path} should catch failures`);
  }
});

test("pricing-sync one-shot gates on PRICING_SYNC_ENABLED", () => {
  const src = readProjectFile("bin/workers/pricing-sync.mjs");
  assert.ok(src, "bin/workers/pricing-sync.mjs should exist");
  assert.match(src, /PRICING_SYNC_ENABLED/);
});

test("db-vacuum one-shot gates on scheduledVacuum", () => {
  const src = readProjectFile("bin/workers/db-vacuum.mjs");
  assert.ok(src, "bin/workers/db-vacuum.mjs should exist");
  assert.match(src, /scheduledVacuum/);
});

test("cleanup one-shot runs best-effort VACUUM only after rows were deleted", () => {
  const src = readProjectFile("bin/workers/cleanup.mjs");
  assert.ok(src, "bin/workers/cleanup.mjs should exist");
  assert.match(src, /runAutoCleanup/, "cleanup one-shot should import runAutoCleanup");
  assert.match(src, /totalDeleted\s*>\s*0/, "VACUUM should be gated on rows being deleted");
  assert.match(src, /getDbInstance\(\).*exec\("VACUUM"\)/s, "deleted rows should trigger VACUUM");
  assert.match(
    src,
    /non-fatal/,
    "a busy-DB VACUUM failure must be non-fatal (dedicated db-vacuum CronJob owns authoritative vacuuming)"
  );
});

test("accountFallback registry job is wired to evictModelLockoutOverflow", () => {
  const src = readProjectFile("src/lib/background/jobs/accountFallback.ts");
  assert.ok(src, "src/lib/background/jobs/accountFallback.ts should exist");
  assert.match(src, /evictModelLockoutOverflow/);
});

test("browserPool/comboMetrics/healthMonitor no-op wrappers dropped the 'not yet wired' stub", () => {
  for (const name of ["browserPool", "comboMetrics", "healthMonitor"]) {
    const src = readProjectFile(`src/lib/background/jobs/${name}.ts`);
    assert.ok(src, `src/lib/background/jobs/${name}.ts should exist`);
    assert.ok(!src.includes("not yet wired"), `${name} should no longer claim 'not yet wired'`);
  }
});
