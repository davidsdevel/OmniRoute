import { sweep } from "@/lib/tokenHealthCheck";

export default async function tokenHealth(): Promise<void> {
  await sweep();
}
