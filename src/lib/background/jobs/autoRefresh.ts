import { autoRefreshDaemon } from "@omniroute/open-sse/services/autoRefreshDaemon.ts";

export default async function autoRefresh(): Promise<void> {
  await autoRefreshDaemon.check();
}
