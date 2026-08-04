import { syncAllProviderLimits } from "@/lib/usage/providerLimits";

export default async function providerLimits(): Promise<void> {
  await syncAllProviderLimits();
}
