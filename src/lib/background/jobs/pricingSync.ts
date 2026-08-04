import { syncPricingFromSources } from "@/lib/pricingSync";

export default async function pricingSync(): Promise<void> {
  if (process.env.PRICING_SYNC_ENABLED !== "true") return;
  await syncPricingFromSources();
}
