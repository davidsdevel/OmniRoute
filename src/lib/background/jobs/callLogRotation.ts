import { rotateCallLogs } from "@/lib/usage/callLogs";

export default async function callLogRotation(): Promise<void> {
  rotateCallLogs();
}
