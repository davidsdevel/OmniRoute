import { sweep, isHealthCheckDisabled } from "@/lib/tokenHealthCheck";

export default async function tokenHealth(): Promise<void> {
  if (isHealthCheckDisabled()) return;
  await sweep();
}
