import { flushSpendBatchWriter } from "@/lib/spend/batchWriter";

export default async function spendBatch(): Promise<void> {
  await flushSpendBatchWriter();
}
