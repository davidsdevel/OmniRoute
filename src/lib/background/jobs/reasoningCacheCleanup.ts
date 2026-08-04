import { cleanupReasoningCache } from "@omniroute/open-sse/services/reasoningCache.ts";

export default async function reasoningCacheCleanup(): Promise<void> {
  cleanupReasoningCache();
}
