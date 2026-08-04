import { evictModelLockoutOverflow } from "@omniroute/open-sse/services/accountFallback.ts";

export default async function accountFallback(): Promise<void> {
  evictModelLockoutOverflow();
}
