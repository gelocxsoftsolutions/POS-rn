import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { isAuthorizedPOS } from "~/lib/pos-auth";
import { employeeAccessReady, nctEmployeeDirectory } from "~/server/pos/employee-directory";

export async function POST(request: Request) {
  const auth = await isAuthorizedPOS(request);
  if (!auth.ok || !auth.deviceId) return NextResponse.json({ error: "Registered NCT device required" }, { status: 401 });
  if (!await employeeAccessReady()) return NextResponse.json({ error: "Employee access setup is pending" }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (typeof body?.pin !== "string" || !/^\d{6}$/.test(body.pin)) return NextResponse.json({ error: "A 6-digit PIN is required" }, { status: 400 });
  const directory = await nctEmployeeDirectory(auth.deviceId);
  const hash = createHash("sha256").update(body.pin).digest("hex");
  const matches = directory.users.filter((u) => u.pinLoginEnabled && u.pinHash === hash);
  const user = body.userId ? matches.find((u) => u.id === body.userId) : matches.length === 1 ? matches[0] : undefined;
  if (!user) return NextResponse.json({ error: "Invalid employee or PIN" }, { status: 401 });
  return NextResponse.json({ id: user.id, employeeId: user.employeeId, name: user.name, role: user.roleName });
}
