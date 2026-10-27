import { NextResponse } from "next/server";
import { isAuthorizedPOS } from "~/lib/pos-auth";
import { db } from "~/server/db";



export async function GET(request: Request) {
  const authz = await isAuthorizedPOS(request);
  if (!authz.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: authz.status });
  }

  try {
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");
    const branchIdNum = branchId ? Number(branchId) : undefined;

    const users = await db.posUser.findMany({
      where: branchIdNum ? { branchId: BigInt(branchIdNum), active: true } : { active: true },
      select: {
        id: true,
        username: true,
        displayName: true,
        pinHash: true,
        passwordHash: true,
        pinLoginEnabled: true,
        passwordLoginEnabled: true,
        active: true,
        role: { select: { id: true, name: true } },
      },
      orderBy: { displayName: "asc" },
    });

    return NextResponse.json({
      users: users.map((u) => ({
        employeeId: u.id,
        username: u.username,
        name: u.displayName,
        role: u.role.name,
        pinHash: u.pinHash,
        passwordHash: u.passwordHash,
        pinLoginEnabled: u.pinLoginEnabled,
        passwordLoginEnabled: u.passwordLoginEnabled,
        active: u.active,
      })),
    });
  } catch (error) {
    console.error("POS users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
