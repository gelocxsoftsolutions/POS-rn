import { api } from "@/lib/api/http";
import { isNctPos } from "./nct-scope";

export async function uploadNctBackup(body: unknown) {
  if (!isNctPos()) throw new Error("NCT backup uploads require an NCT device connection.");
  const response = await api.post<{ backupId: string; checksum: string; byteSize: number }>(
    "/api/pos/backups",
    body,
    180000,
  );
  if (!response.ok || !response.data?.backupId)
    throw Object.assign(
      new Error(response.error?.error ?? "NCT backup upload was not acknowledged"),
      { status: response.status },
    );
  return response.data;
}
