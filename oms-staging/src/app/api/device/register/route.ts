import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { DeviceRegistrationService } from "~/server/services/device-registration.service";

const registerSchema = {
  activationToken: (v: unknown) => typeof v === "string" && v.length > 0,
  publicKey: (v: unknown) => typeof v === "string" && v.length > 0,
  machineIdentifier: (v: unknown) => typeof v === "string" && v.length > 0,
  computerName: (v: unknown) => typeof v === "string" && v.length > 0,
};

function parseBody(body: Record<string, unknown>): {
  activationToken: string;
  publicKey: string;
  machineIdentifier: string;
  computerName: string;
  appVersion: string;
  osVersion: string;
  existingDeviceId?: string;
} | { error: string; status: number } {
  const errors: string[] = [];

  for (const [key, validate] of Object.entries(registerSchema)) {
    if (!validate(body[key])) {
      errors.push(`${key} is required and must be a non-empty string`);
    }
  }

  if (errors.length > 0) {
    return { error: errors.join("; "), status: 400 };
  }

  return {
    activationToken: body.activationToken as string,
    publicKey: body.publicKey as string,
    machineIdentifier: body.machineIdentifier as string,
    computerName: body.computerName as string,
    appVersion: (body.appVersion as string) ?? "0.1.0",
    osVersion: (body.osVersion as string) ?? "unknown",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(body);

    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    if (body.existingDeviceId !== undefined && (typeof body.existingDeviceId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.existingDeviceId))) return NextResponse.json({ error: "Invalid existing device identity" }, { status: 400 });
    const service = new DeviceRegistrationService(db);
    const result = await service.registerDevice({
      rawToken: parsed.activationToken,
      existingDeviceId: body.existingDeviceId,
      publicKey: parsed.publicKey,
      appVersion: parsed.appVersion,
      osVersion: parsed.osVersion,
      computerName: parsed.computerName,
      machineIdentifier: parsed.machineIdentifier,
    });

    return NextResponse.json(
      {
        deviceId: result.deviceId,
        deviceCode: result.deviceCode,
        publicIdentifier: result.publicIdentifier,
        deviceSecret: result.deviceSecret,
        posApiKey: result.posApiKey,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt.toISOString(),
        branchId: result.branchId,
        branchName: result.branchName,
        branchAddress: result.branchAddress,
        registeredAt: result.registeredAt,
        deviceName: result.deviceName,
        initialCashiers: result.initialCashiers,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      const trpcError = error as { code: string; message: string };
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        BAD_REQUEST: 400,
        TOO_MANY_REQUESTS: 429,
      };
      const status = statusMap[trpcError.code] ?? 400;
      return NextResponse.json({ error: trpcError.message }, { status });
    }

    console.error("Device registration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
