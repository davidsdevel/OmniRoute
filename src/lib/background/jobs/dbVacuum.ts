import { runNow } from "@/lib/db/vacuumScheduler";

export default async function dbVacuum(): Promise<void> {
  await runNow();
}
