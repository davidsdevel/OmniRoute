import { runAutoCleanup } from "@/lib/db/cleanup";

export default async function cleanup(): Promise<void> {
  await runAutoCleanup();
}
