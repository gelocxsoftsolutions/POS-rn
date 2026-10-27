import { isDealershipOperator } from "~/server/pos/dealership-procedure";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { DeviceRegistrationService } from "~/server/services/device-registration.service";
import { DeviceAuthService } from "~/server/modules/device-auth/device-auth.service";
import { DeviceHeartbeatService } from "~/server/modules/device-heartbeat/device-heartbeat.service";
import { DeviceSessionService } from "~/server/modules/device-session/device-session.service";
import { DeviceAuditService } from "~/server/modules/device-audit/device-audit.service";
import { DeviceProvisionService } from "~/server/modules/device-provision/device-provision.service";
import { PERMISSIONS } from "~/lib/permissions";
import { cryptoService } from "~/server/services/crypto.service";

function createDeviceService(ctx: { db: any }) {
  return new DeviceRegistrationService(ctx.db as any);
}

async function resolveActorId(ctx: {
  db: any;
  session: { user: { id?: string; userType?: string; isAdmin?: boolean } };
}): Promise<number> {
  const userType = (ctx.session.user as any).userType || "legacyuser";

  if (userType === "superuser" || ctx.session.user.isAdmin) {
    const parsedId = Number.parseInt(ctx.session.user.id ?? "", 10);
    if (Number.isInteger(parsedId)) {
      const user = await ctx.db.legacyUser.findUnique({
        where: { id: parsedId },
        select: { id: true },
      });
      if (user) return user.id;
    }

    const firstUser = await ctx.db.legacyUser.findFirst({
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    if (firstUser) return firstUser.id;

    throw new TRPCError({ code: "UNAUTHORIZED", message: "No active legacy user found for audit trail" });
  }

  if (userType !== "legacyuser") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only legacy users can manage POS devices" });
  }

  const parsedId = Number.parseInt(ctx.session.user.id ?? "", 10);
  if (!Number.isInteger(parsedId)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid user ID" });
  }

  const user = await ctx.db.legacyUser.findUnique({
    where: { id: parsedId },
    select: { id: true },
  });

  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  }

  return user.id;
}

async function hasDevicePermission(
  ctx: {
    db: any;
    session: { user: { id?: string; userType?: string; isAdmin?: boolean } };
  },
  requiredPermission: string,
): Promise<boolean> {
  if (isDealershipOperator(ctx)) return true;
  if (ctx.session.user.userType === "superuser" || ctx.session.user.isAdmin) {
    return true;
  }

  const parsedId = Number.parseInt(ctx.session.user.id ?? "", 10);
  if (!Number.isInteger(parsedId)) {
    return false;
  }

  const user = await ctx.db.legacyUser.findUnique({
    where: { id: parsedId },
    include: {
      userPermissions: { include: { permission: true } },
      position: {
        include: {
          defaultPermissions: { include: { permission: true } },
        },
      },
    },
  });

  if (!user) return false;

  const permissionNames = new Set<string>();
  user.userPermissions?.forEach((up: { permission: { name: string } }) => {
    permissionNames.add(up.permission.name);
  });

  const departmentId = user.departmentId ? Number(user.departmentId) : null;
  user.position?.defaultPermissions?.forEach(
    (dp: { permission: { name: string }; departmentId: bigint | null }) => {
      if (departmentId == null || dp.departmentId == null || Number(dp.departmentId) === departmentId) {
        permissionNames.add(dp.permission.name);
      }
    },
  );

  return permissionNames.has(requiredPermission);
}

export function createPosDeviceRouter(procedure = protectedProcedure) { return createTRPCRouter({
  getBranches: procedure.query(async ({ ctx }) => {
    const service = createDeviceService(ctx);
    return service.getBranches();
  }),

  generateActivation: procedure
    .input(
      z.object({
        branchId: z.number().int().positive(),
        deviceName: z.string().trim().min(1).max(255),
        userIds: z.array(z.string().uuid()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage POS devices" });
      }

      const actorId = await resolveActorId(ctx);
      const service = createDeviceService(ctx);

      return service.generateActivationToken({
        branchId: input.branchId,
        deviceName: input.deviceName,
        userIds: input.userIds,
        createdBy: actorId,
      });
    }),

  getPosUsers: procedure
    .input(
      z.object({
        branchId: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const canView = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_USERS);
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view POS users" });
      }

      const users = await ctx.db.posUser.findMany({
        where: { branchId: BigInt(input.branchId), active: true },
        select: {
          id: true,
          username: true,
          displayName: true,
          role: { select: { id: true, name: true } },
        },
        orderBy: { displayName: "asc" },
      });

      return users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        roleId: u.role.id,
        roleName: u.role.name,
      }));
    }),

  registerDevice: procedure
    .input(
      z.object({
        activationToken: z.string().min(1),
        branchId: z.number().int().positive(),
        publicKey: z.string().min(1),
        appVersion: z.string().max(50).default("1.0.0"),
        osVersion: z.string().max(50).default("unknown"),
        computerName: z.string().max(255).default("unknown"),
        machineIdentifier: z.string().max(255).default("unknown"),
        publicIp: z.string().max(45).optional(),
        isp: z.string().max(255).optional(),
        approximateLocation: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const service = createDeviceService(ctx);

      return service.registerDevice({
        rawToken: input.activationToken,
        branchId: input.branchId,
        publicKey: input.publicKey,
        appVersion: input.appVersion,
        osVersion: input.osVersion,
        computerName: input.computerName,
        machineIdentifier: input.machineIdentifier,
        publicIp: input.publicIp,
        isp: input.isp,
        approximateLocation: input.approximateLocation,
      });
    }),

  getDevices: procedure
    .input(
      z.object({
        branchId: z.number().int().positive().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const canView = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view POS devices" });
      }

      const service = createDeviceService(ctx);
      return service.getDevices(input);
    }),

  getDeviceById: procedure
    .input(z.object({ deviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const canView = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view POS devices" });
      }

      const service = createDeviceService(ctx);
      return service.getDeviceById(input.deviceId);
    }),

  updateDeviceStatus: procedure
    .input(
      z.object({
        deviceId: z.string().uuid(),
        status: z.enum(["ONLINE", "IDLE", "OFFLINE", "DISABLED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage POS devices" });
      }

      const actorId = await resolveActorId(ctx);
      const service = createDeviceService(ctx);

      return service.updateDeviceStatus(input.deviceId, input.status, actorId);
    }),

  deleteDevice: procedure
    .input(z.object({
      deviceId: z.string().uuid(),
      password: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage POS devices" });
      }

      const userType = (ctx.session.user as any).userType || "legacyuser";
      const actorId = await resolveActorId(ctx);

      let passwordMatch = false;

      if (userType !== "legacyuser") {
        const sessionId = Number.parseInt(ctx.session.user.id ?? "", 10);
        if (Number.isInteger(sessionId)) {
          const superuser = await ctx.db.superuser.findUnique({
            where: { id: sessionId },
            select: { password: true },
          });
          if (superuser) {
            const bcrypt = await import("bcrypt");
            passwordMatch = await bcrypt.compare(input.password, superuser.password);
          }
        }
      } else {
        const user = await ctx.db.legacyUser.findUnique({
          where: { id: actorId },
          select: { password: true },
        });
        if (user) {
          const bcrypt = await import("bcrypt");
          passwordMatch = await bcrypt.compare(input.password, user.password);
        }
      }

      if (!passwordMatch) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Incorrect password" });
      }

      const service = createDeviceService(ctx);
      return service.deleteDevice(input.deviceId, actorId);
    }),

  bulkDeleteDevices: procedure
    .input(z.object({
      deviceIds: z.array(z.string().uuid()).min(1),
      password: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage POS devices" });
      }

      const userType = (ctx.session.user as any).userType || "legacyuser";
      const actorId = await resolveActorId(ctx);

      let passwordMatch = false;

      if (userType !== "legacyuser") {
        const sessionId = Number.parseInt(ctx.session.user.id ?? "", 10);
        if (Number.isInteger(sessionId)) {
          const superuser = await ctx.db.superuser.findUnique({
            where: { id: sessionId },
            select: { password: true },
          });
          if (superuser) {
            const bcrypt = await import("bcrypt");
            passwordMatch = await bcrypt.compare(input.password, superuser.password);
          }
        }
      } else {
        const user = await ctx.db.legacyUser.findUnique({
          where: { id: actorId },
          select: { password: true },
        });
        if (user) {
          const bcrypt = await import("bcrypt");
          passwordMatch = await bcrypt.compare(input.password, user.password);
        }
      }

      if (!passwordMatch) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Incorrect password" });
      }

      const service = createDeviceService(ctx);
      return service.bulkDeleteDevices(input.deviceIds, actorId);
    }),

  revokeCredentials: procedure
    .input(z.object({ deviceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage POS devices" });
      }

      const actorId = await resolveActorId(ctx);
      const service = createDeviceService(ctx);

      return service.revokeCredentials(input.deviceId, actorId);
    }),

  generateNewActivation: procedure
    .input(
      z.object({
        deviceId: z.string().uuid(),
        deviceName: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage POS devices" });
      }

      const actorId = await resolveActorId(ctx);

      const device = await ctx.db.posDevice.findUnique({
        where: { id: input.deviceId },
        select: { branchId: true },
      });

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      const service = createDeviceService(ctx);
      return service.generateActivationToken({
        branchId: Number(device.branchId),
        deviceName: input.deviceName,
        createdBy: actorId,
        userIds: [],
      });
    }),

  getDashboardStats: procedure.query(async ({ ctx }) => {
    const canView = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
    if (!canView) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view POS devices" });
    }

    const heartbeatService = new DeviceHeartbeatService(ctx.db as any);
    return heartbeatService.getDashboardStats();
  }),

  getDeviceSessions: procedure
    .input(
      z.object({
        deviceId: z.string().uuid(),
        includeRevoked: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const canView = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view POS devices" });
      }

      const sessionService = new DeviceSessionService(ctx.db as any);
      return sessionService.getAllSessions(input.deviceId, input.includeRevoked);
    }),

  getLatestHeartbeat: procedure
    .input(z.object({ deviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const canView = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view POS devices" });
      }

      const heartbeatService = new DeviceHeartbeatService(ctx.db as any);
      return heartbeatService.getLatestHeartbeat(input.deviceId);
    }),

  getDeviceHeartbeats: procedure
    .input(
      z.object({
        deviceId: z.string().uuid(),
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const canView = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view POS devices" });
      }

      const heartbeatService = new DeviceHeartbeatService(ctx.db as any);
      return heartbeatService.getHeartbeatHistory(input.deviceId, input.limit, input.offset);
    }),

  getDeviceAuditLogs: procedure
    .input(
      z.object({
        deviceId: z.string().uuid(),
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).default(0),
        action: z.string().max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const canView = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view POS devices" });
      }

      const auditService = new DeviceAuditService(ctx.db as any);
      return auditService.getLogs(input.deviceId, input.limit, input.offset, input.action);
    }),

  getPosAuditLogs: procedure
    .input(
      z.object({
        deviceId: z.string().uuid().optional(),
        cashierUserId: z.string().optional(),
        action: z.string().max(100).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const canView = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view POS audit logs" });
      }

      const where: Record<string, unknown> = {};
      if (input.deviceId) where.deviceId = input.deviceId;
      if (input.cashierUserId) where.cashierUserId = input.cashierUserId;
      if (input.action) where.action = input.action;
      if (input.from || input.to) {
        where.createdAt = {};
        if (input.from) (where.createdAt as Record<string, unknown>).gte = new Date(input.from);
        if (input.to) (where.createdAt as Record<string, unknown>).lte = new Date(input.to);
      }

      const [logs, total] = await Promise.all([
        (ctx.db as any).posAuditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: input.limit,
          skip: input.offset,
        }),
        (ctx.db as any).posAuditLog.count({ where }),
      ]);

      return { logs, total };
    }),

  revokeSession: procedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage POS devices" });
      }

      const authService = new DeviceAuthService(ctx.db as any);
      return authService.revokeSession(input.sessionId);
    }),

  rotateDeviceSecret: procedure
    .input(z.object({ deviceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage POS devices" });
      }

      const authService = new DeviceAuthService(ctx.db as any);
      return authService.rotateDeviceSecret(input.deviceId);
    }),

  forgetDevice: procedure
    .input(z.object({
      deviceId: z.string().uuid(),
      password: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage POS devices" });
      }

      const userType = (ctx.session.user as any).userType || "legacyuser";
      const actorId = await resolveActorId(ctx);

      let passwordMatch = false;

      if (userType !== "legacyuser") {
        const sessionId = Number.parseInt(ctx.session.user.id ?? "", 10);
        if (Number.isInteger(sessionId)) {
          const superuser = await ctx.db.superuser.findUnique({
            where: { id: sessionId },
            select: { password: true },
          });
          if (superuser) {
            const bcrypt = await import("bcrypt");
            passwordMatch = await bcrypt.compare(input.password, superuser.password);
          }
        }
      } else {
        const user = await ctx.db.legacyUser.findUnique({
          where: { id: actorId },
          select: { password: true },
        });
        if (user) {
          const bcrypt = await import("bcrypt");
          passwordMatch = await bcrypt.compare(input.password, user.password);
        }
      }

      if (!passwordMatch) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Incorrect password" });
      }

      const service = createDeviceService(ctx);
      return service.forgetDevice(input.deviceId, actorId);
    }),

  reconnectDevice: procedure
    .input(z.object({ deviceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage POS devices" });
      }

      const actorId = await resolveActorId(ctx);
      const service = createDeviceService(ctx);

      if (!isDealershipOperator(ctx)) {
        const [schema] = await ctx.db.$queryRaw<Array<{ ready: boolean }>>`SELECT to_regclass('pos.device_reconnect_tokens') IS NOT NULL AS ready`;
        if (!schema?.ready) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Identity-preserving reconnect requires approved database setup." });
        return ctx.db.$transaction(async (tx) => {
          const device = await tx.posDevice.findUnique({ where: { id: input.deviceId }, select: { branchId: true, deviceName: true } });
          if (!device) throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
          const assignments = await tx.posUserAssignment.findMany({ where: { deviceId: input.deviceId, isActive: true }, select: { userId: true } });
          const activation = await new DeviceRegistrationService(tx as any).generateActivationToken({ branchId: Number(device.branchId), deviceName: device.deviceName, createdBy: actorId, userIds: assignments.map((a) => a.userId) });
          const token = await tx.posActivationToken.findUniqueOrThrow({ where: { tokenLookup: cryptoService.sha256(activation.rawToken) }, select: { id: true } });
          await tx.$executeRaw`INSERT INTO pos.device_reconnect_tokens(activation_token_id, device_id) VALUES (${token.id}, ${input.deviceId})`;
          await tx.posAuditLog.create({ data: { deviceId: input.deviceId, action: "DEVICE_RECONNECT_REQUESTED", entityType: "device", entityId: input.deviceId, details: { performedBy: actorId } } });
          // Credentials remain valid until this one-time token is redeemed.
          return activation;
        });
      }

      await service.revokeCredentials(input.deviceId, actorId);

      const device = await ctx.db.posDevice.findUnique({
        where: { id: input.deviceId },
        select: { branchId: true, deviceName: true },
      });

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
      }

      const activation = await service.generateActivationToken({
        branchId: Number(device.branchId),
        deviceName: device.deviceName,
        createdBy: actorId,
        userIds: [],
      });

      await (ctx.db as any).posAuditLog.create({
        data: {
          deviceId: input.deviceId,
          action: "DEVICE_RECONNECTED",
          entityType: "device",
          entityId: input.deviceId,
          details: JSON.stringify({ performedBy: actorId }),
        },
      });

      return activation;
    }),

  getProvisionStatus: procedure
    .input(z.object({ deviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const canView = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view POS devices" });
      }

      const provisionService = new DeviceProvisionService(ctx.db as any);
      return provisionService.getProvisionStatus(input.deviceId);
    }),

  forceReProvision: procedure
    .input(z.object({ deviceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage POS devices" });
      }

      const provisionService = new DeviceProvisionService(ctx.db as any);
      return provisionService.forceReProvision(input.deviceId);
    }),

  getProvisionLogs: procedure
    .input(
      z.object({
        deviceId: z.string().uuid(),
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const canView = await hasDevicePermission(ctx, PERMISSIONS.MANAGE_POS_DEVICES);
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view POS devices" });
      }

      const provisionService = new DeviceProvisionService(ctx.db as any);
      return provisionService.getProvisionLogs(input.deviceId, input.limit, input.offset);
    }),
}); }
export const posDeviceRouter = createPosDeviceRouter();

