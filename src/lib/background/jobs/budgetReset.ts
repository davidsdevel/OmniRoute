import { syncAllBudgetSchedules } from "@/domain/costRules";

export default async function budgetReset(): Promise<void> {
  const result = syncAllBudgetSchedules(Date.now());
  if (result.resetCount > 0) {
    console.log(`[BudgetReset] processed=${result.processed} reset=${result.resetCount}`);
  }
}
