import { NextResponse } from "next/server";
import { isAuthorizedPOS } from "~/lib/pos-auth";
import { posStorageScope } from "~/server/pos/scope";
import { GET as dealershipUsers } from "~/server/pos/dealership-users";
import { employeeAccessReady, nctEmployeeDirectory } from "~/server/pos/employee-directory";

export async function GET(request: Request) {
  if (posStorageScope.getStore() === "dealership") return dealershipUsers(request);
  const auth = await isAuthorizedPOS(request);
  if (!auth.ok || !auth.deviceId) return NextResponse.json({ error: "Registered device key required" }, { status: 401 });
  if (!await employeeAccessReady()) return NextResponse.json({ error: "Employee access mapping is awaiting approved database setup" }, { status: 503 });
  // Scope is always derived from the authenticated device, never a query parameter.
  return NextResponse.json(await nctEmployeeDirectory(auth.deviceId));
}
