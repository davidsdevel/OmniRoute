import { runBackupScheduleTick } from "@/lib/jobs/backupScheduleJob";

export default async function backup(): Promise<void> {
  await runBackupScheduleTick();
}
