import { TRPCError } from "@trpc/server";
import { PrismaClient } from "@prisma/client";
import { cryptoService } from "./crypto.service";

interface GenerateActivationInput {
  branchId: number;
  deviceName: string;
  createdBy: number;
  userIds: string[];
}

interface VerifyActivationInput {
  rawToken: string;
  branchId: number;
}

interface RegisterDeviceInput {
  existingDeviceId?: string;
  rawToken: string;
  branchId?: number;
  publicKey: string;
  appVersion: string;
  osVersion: string;
  computerName: string;
  machineIdentifier: string;
  publicIp?: string;
  isp?: string;
  approximateLocation?: string;
}

interface RegisterDeviceOutput {
  deviceId: string;
  deviceCode: string;
  publicIdentifier: string;
  deviceSecret: string;
  posApiKey: string;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  branchId: number;
  branchName: string;
  branchAddress: string;
  registeredAt: string;
  deviceName: string;
  initialCashiers: Array<{
    id: string;
    employeeId: string;
    username: string;
    displayName: string;
    pinHash: string;
    passwordHash: string | null;
    roleId: string;
    roleName: string;
  }>;
}

const ACTIVATION_TOKEN_TTL_MINUTES = 15;
const ACCESS_TOKEN_BYTES = 32;
const DEVICE_SECRET_BYTES = 32;
const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_TTL_DAYS = 90;
const MAX_ACTIVATION_ATTEMPTS = 10;

export class DeviceRegistrationService {
  private db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
  }

  async generateActivationToken(
    input: GenerateActivationInput,
  ): Promise<{ rawToken: string; expiresAt: Date; qrData: string }> {
    const branch = await this.db.branch.findUnique({
      where: { id: BigInt(input.branchId) },
      select: { id: true, name: true },
    });

    if (!branch) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Branch not found" });
    }

    const { raw, lookup } = cryptoService.generateActivationToken();
    const tokenHash = await cryptoService.hashToken(raw);

    const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_MINUTES * 60 * 1000);

    await this.db.posActivationToken.create({
      data: {
        tokenHash,
        tokenLookup: lookup,
        branchId: branch.id,
        deviceName: input.deviceName,
        expiresAt,
        createdBy: input.createdBy,
        assignedUserIds: input.userIds,
      },
    });

    const qrData = JSON.stringify({
      server: process.env.QR_SERVER_URL ?? process.env.NEXTAUTH_URL ?? "https://nctseafoods.store",
      activationToken: raw,
      version: "1.0",
      expiresAt: expiresAt.toISOString(),
    });

    return { rawToken: raw, expiresAt, qrData };
  }

  async registerDevice(input: RegisterDeviceInput): Promise<RegisterDeviceOutput> {
    const { rawToken, branchId, publicKey, appVersion, osVersion, computerName, machineIdentifier, publicIp, isp, approximateLocation } = input;

    const lookup = cryptoService.sha256(rawToken);

    const storedToken = await this.db.posActivationToken.findUnique({
      where: { tokenLookup: lookup },
      include: { branch: { select: { name: true, location: true } } },
    });

    if (!storedToken) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invalid activation token" });
    }

    if (storedToken.usedAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Activation token has already been used" });
    }

    const [reconnectSchema] = await this.db.$queryRaw<Array<{ ready: boolean }>>`SELECT to_regclass('pos.device_reconnect_tokens') IS NOT NULL AS ready`;
    const reconnect = reconnectSchema?.ready
      ? await this.db.$queryRaw<Array<{ deviceId: string }>>`SELECT device_id AS "deviceId" FROM pos.device_reconnect_tokens WHERE activation_token_id = ${storedToken.id}`
      : [];
    const reconnectDeviceId = reconnect[0]?.deviceId;
    if (input.existingDeviceId && input.existingDeviceId !== reconnectDeviceId) throw new TRPCError({ code: "BAD_REQUEST", message: "Use the reconnect token for this existing device; its data was preserved." });
    if (reconnectDeviceId && reconnectDeviceId !== input.existingDeviceId) throw new TRPCError({ code: "BAD_REQUEST", message: "This token reconnects an existing device. Use that installation or its verified restore." });

    if (new Date() > storedToken.expiresAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Activation token has expired" });
    }

    if (branchId !== undefined && Number(storedToken.branchId) !== branchId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Activation token does not match the selected branch" });
    }

    const isValidToken = await cryptoService.verifyToken(rawToken, storedToken.tokenHash);
    if (!isValidToken) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid activation token" });
    }

    const effectiveBranchId = branchId ?? Number(storedToken.branchId);
    const recentAttempts = await this.db.posActivationToken.count({
      where: {
        branchId: BigInt(effectiveBranchId),
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    if (recentAttempts > MAX_ACTIVATION_ATTEMPTS) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many activation attempts for this branch. Please try again later.",
      });
    }

    const deviceSecret = cryptoService.generateRandomBytes(DEVICE_SECRET_BYTES);
    const deviceSecretHash = await cryptoService.hashToken(deviceSecret);

    const accessToken = cryptoService.generateRandomBytes(ACCESS_TOKEN_BYTES);
    const accessTokenHash = await cryptoService.hashToken(accessToken);

    const refreshToken = cryptoService.generateRandomBytes(REFRESH_TOKEN_BYTES);
    const refreshTokenHash = await cryptoService.hashToken(refreshToken);
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const deviceCode = cryptoService.generateDeviceCode(storedToken.branch.name, storedToken.deviceName);
    const publicIdentifier = cryptoService.generatePublicIdentifier();
    const posApiKey = cryptoService.generatePosApiKey();

    const device = await this.db.$transaction(async (tx) => {
      const claimed = await tx.posActivationToken.updateMany({ where: { id: storedToken.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Activation token was already used or expired." });
      const newDevice = reconnectDeviceId ? await tx.posDevice.update({
        where: { id: reconnectDeviceId, branchId: storedToken.branchId },
        data: { deviceSecretHash, accessTokenHash, posApiKey, publicKey, computerName, machineIdentifier,
          status: "ONLINE", lastSeen: new Date(), lastAppVersion: appVersion, lastOSVersion: osVersion, updatedBy: storedToken.createdBy },
      }) : await tx.posDevice.create({
        data: {
          branchId: storedToken.branchId,
          deviceName: storedToken.deviceName,
          deviceCode,
          status: "ONLINE",
          publicIdentifier,
          deviceSecretHash,
          publicKey,
          registeredAt: new Date(),
          lastSeen: new Date(),
          publicIp: publicIp ?? null,
          isp: isp ?? null,
          approximateLocation: approximateLocation ?? null,
          lastAppVersion: appVersion,
          lastOSVersion: osVersion,
          computerName,
          machineIdentifier,
          accessTokenHash,
          posApiKey,
          createdBy: storedToken.createdBy,
        },
      });

      if (reconnectDeviceId) {
        await tx.deviceRefreshToken.updateMany({ where: { deviceId: reconnectDeviceId, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.deviceSession.updateMany({ where: { deviceId: reconnectDeviceId, revokedAt: null }, data: { revokedAt: new Date() } });
      }

      await tx.posActivationToken.update({
        where: { id: storedToken.id },
        data: {
          usedAt: new Date(),
          usedByDeviceId: newDevice.id,
        },
      });

      await tx.deviceRefreshToken.create({
        data: {
          deviceId: newDevice.id,
          refreshTokenHash,
          expiresAt: refreshTokenExpiresAt,
        },
      });

      return newDevice;
    });

    const branchName = storedToken.branch.name;
    const branchLocation = storedToken.branch.location ?? "";

    let initialCashiers: RegisterDeviceOutput["initialCashiers"] = [];

    const assignedUserIds = storedToken.assignedUserIds as string[];
    if (assignedUserIds.length > 0 && !reconnectDeviceId) {
      const users = await this.db.posUser.findMany({
        where: { id: { in: assignedUserIds } },
        include: { role: { select: { id: true, name: true } } },
      });

      const assignments = users.map((u) => ({
        userId: u.id,
        deviceId: device.id,
        isActive: true,
        assignedBy: storedToken.createdBy,
      }));

      await this.db.posUserAssignment.createMany({ data: assignments });

      initialCashiers = users.map((u) => ({
        id: u.id,
        employeeId: u.username,
        username: u.username,
        displayName: u.displayName,
        pinHash: u.pinHash,
        passwordHash: u.passwordHash,
        roleId: u.roleId,
        roleName: u.role.name,
      }));
    }

    return {
      deviceId: device.id,
      deviceCode: device.deviceCode,
      publicIdentifier: device.publicIdentifier,
      deviceSecret,
      posApiKey,
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
      branchId: Number(storedToken.branchId),
      branchName,
      branchAddress: branchLocation,
      registeredAt: device.registeredAt?.toISOString() ?? new Date().toISOString(),
      deviceName: storedToken.deviceName,
      initialCashiers,
    };
  }

  async getDevices(input: { branchId?: number; status?: string; search?: string; limit: number }) {
    const where: Record<string, unknown> = {};

    if (input.branchId) {
      where.branchId = BigInt(input.branchId);
    }

    if (input.status) {
      where.status = input.status;
    }

    if (input.search) {
      where.OR = [
        { deviceName: { contains: input.search, mode: "insensitive" } },
        { deviceCode: { contains: input.search, mode: "insensitive" } },
        { publicIdentifier: { contains: input.search, mode: "insensitive" } },
      ];
    }

    const devices = await this.db.posDevice.findMany({
      where,
      take: input.limit,
      orderBy: { createdAt: "desc" },
      include: {
        branch: { select: { id: true, name: true } },
        creator: { select: { id: true, username: true, first_name: true, last_name: true } },
        userAssignments: {
          where: { isActive: true },
          include: {
            user: { select: { id: true, displayName: true, username: true } },
          },
        },
      },
    });

    const total = await this.db.posDevice.count({ where });

    return {
      devices: devices.map((d) => ({
        id: d.id,
        branchId: Number(d.branchId),
        branchName: d.branch.name,
        deviceName: d.deviceName,
        deviceCode: d.deviceCode,
        status: d.status,
        healthStatus: d.healthStatus,
        publicIdentifier: d.publicIdentifier,
        registeredAt: d.registeredAt,
        lastSeen: d.lastSeen,
        lastHeartbeatAt: d.lastHeartbeatAt,
        lastSync: d.lastSync,
        lastAppVersion: d.lastAppVersion,
        lastOSVersion: d.lastOSVersion,
        publicIp: d.publicIp,
        isp: d.isp,
        approximateLocation: d.approximateLocation,
        computerName: d.computerName,
        posApiKey: d.posApiKey,
        createdAt: d.createdAt,
        createdBy: d.creator
          ? `${d.creator.first_name ?? ""} ${d.creator.last_name ?? ""}`.trim() || d.creator.username
          : "Unknown",
        assignments: d.userAssignments.map((a: any) => ({
          id: a.id,
          userId: a.userId,
          isActive: a.isActive,
          user: a.user,
        })),
      })),
      total,
    };
  }

  async getDeviceById(deviceId: string) {
    const device = await this.db.posDevice.findUnique({
      where: { id: deviceId },
      include: {
        branch: { select: { id: true, name: true, location: true } },
        creator: { select: { id: true, username: true, first_name: true, last_name: true } },
        updater: { select: { id: true, username: true, first_name: true, last_name: true } },
      },
    });

    if (!device) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
    }

    return {
      id: device.id,
      branchId: Number(device.branchId),
      branchName: device.branch.name,
      branchLocation: device.branch.location,
      deviceName: device.deviceName,
      deviceCode: device.deviceCode,
      status: device.status,
      healthStatus: device.healthStatus,
      publicIdentifier: device.publicIdentifier,
      registeredAt: device.registeredAt,
      lastSeen: device.lastSeen,
      lastHeartbeatAt: device.lastHeartbeatAt,
      lastSync: device.lastSync,
      publicIp: device.publicIp,
      isp: device.isp,
      approximateLocation: device.approximateLocation,
      lastAppVersion: device.lastAppVersion,
      lastOSVersion: device.lastOSVersion,
      computerName: device.computerName,
      machineIdentifier: device.machineIdentifier,
      posApiKey: device.posApiKey,
      qrServerUrl: process.env.QR_SERVER_URL ?? process.env.NEXTAUTH_URL ?? "https://nctseafoods.store",
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
      createdBy: device.creator
        ? `${device.creator.first_name ?? ""} ${device.creator.last_name ?? ""}`.trim() || device.creator.username
        : "Unknown",
      updatedBy: device.updater
        ? `${device.updater.first_name ?? ""} ${device.updater.last_name ?? ""}`.trim() || device.updater.username
        : null,
    };
  }

  async updateDeviceStatus(deviceId: string, status: "ONLINE" | "IDLE" | "OFFLINE" | "DISABLED", updatedBy: number) {
    const device = await this.db.posDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, status: true },
    });

    if (!device) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
    }

    const updated = await this.db.posDevice.update({
      where: { id: deviceId },
      data: { status, updatedBy },
    });

    return { id: updated.id, status: updated.status };
  }

  async deleteDevice(deviceId: string, deletedBy: number) {
    const device = await this.db.posDevice.findUnique({
      where: { id: deviceId },
      select: { id: true, status: true },
    });

    if (!device) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
    }

    await this.db.$transaction(async (tx) => {
      await tx.deviceRefreshToken.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.deviceSession.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.deviceProvisionLog.updateMany({
        where: { deviceId, status: "SUCCESS" },
        data: { status: "REVOKED" },
      });

      await tx.deviceConfiguration.deleteMany({ where: { deviceId } });

      await tx.deviceAuditLog.create({
        data: {
          deviceId,
          action: "DEVICE_REVOKED",
          details: JSON.stringify({ deletedBy, reason: "Device deleted by admin" }),
        },
      });

      await tx.posDevice.delete({ where: { id: deviceId } });
    });

    return { success: true };
  }

  async revokeCredentials(deviceId: string, updatedBy: number) {
    const device = await this.db.posDevice.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });

    if (!device) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
    }

    await this.db.$transaction(async (tx) => {
      await tx.deviceRefreshToken.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.posDevice.update({
        where: { id: deviceId },
        data: {
          deviceSecretHash: null,
          accessTokenHash: null,
          publicKey: null,
          status: "PENDING",
          updatedBy,
        },
      });
    });

    return { success: true };
  }

  async forgetDevice(deviceId: string, performedBy: number) {
    const device = await this.db.posDevice.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });

    if (!device) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
    }

    await this.db.$transaction(async (tx) => {
      await tx.deviceRefreshToken.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.deviceSession.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.deviceProvisionLog.updateMany({
        where: { deviceId, status: "SUCCESS" },
        data: { status: "REVOKED" },
      });

      await tx.deviceConfiguration.deleteMany({ where: { deviceId } });

      await tx.posDevice.update({
        where: { id: deviceId },
        data: {
          deviceSecretHash: null,
          accessTokenHash: null,
          publicKey: null,
          status: "PENDING",
          updatedBy: performedBy,
        },
      });

      await (tx as any).posAuditLog.create({
        data: {
          deviceId,
          action: "DEVICE_FORGOTTEN",
          entityType: "device",
          entityId: deviceId,
          details: JSON.stringify({ performedBy }),
        },
      });
    });

    return { success: true };
  }

  async bulkDeleteDevices(deviceIds: string[], deletedBy: number) {
    const devices = await this.db.posDevice.findMany({
      where: { id: { in: deviceIds } },
      select: { id: true },
    });

    if (devices.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No devices found" });
    }

    const foundIds = devices.map((d) => d.id);

    await this.db.$transaction(async (tx) => {
      await tx.deviceRefreshToken.updateMany({
        where: { deviceId: { in: foundIds }, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.deviceSession.updateMany({
        where: { deviceId: { in: foundIds }, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.deviceProvisionLog.updateMany({
        where: { deviceId: { in: foundIds }, status: "SUCCESS" },
        data: { status: "REVOKED" },
      });

      await tx.deviceConfiguration.deleteMany({ where: { deviceId: { in: foundIds } } });

      for (const id of foundIds) {
        await tx.deviceAuditLog.create({
          data: {
            deviceId: id,
            action: "DEVICE_REVOKED",
            details: JSON.stringify({ deletedBy, reason: "Device bulk deleted by admin" }),
          },
        });
      }

      await tx.posDevice.deleteMany({ where: { id: { in: foundIds } } });
    });

    return { success: true, deletedCount: foundIds.length };
  }

  async getBranches() {
    const branches = await this.db.branch.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, location: true, code: true, contactNumber: true, email: true, status: true },
    });

    return branches.map((b) => ({
      id: Number(b.id),
      name: b.name,
      location: b.location,
      code: b.code,
      contactNumber: b.contactNumber,
      email: b.email,
      status: b.status,
    }));
  }
}
