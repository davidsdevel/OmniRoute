import { getDatabaseSettings } from "@/lib/db/databaseSettings";
import { runNow } from "@/lib/db/vacuumScheduler";

export default async function dbVacuum(): Promise<void> {
  if (getDatabaseSettings().optimization.scheduledVacuum === "never") return;
  await runNow();
}
