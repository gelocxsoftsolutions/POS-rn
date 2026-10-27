import { isDealershipOperator } from "~/server/pos/dealership-procedure";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PERMISSIONS } from "~/lib/permissions";
import { employeeAccessReady } from "~/server/pos/employee-directory";

async function hasPermission(ctx: any, required: string): Promise<boolean> {
  if (isDealershipOperator(ctx)) return true;
  if (ctx.session.user.userType === "superuser" || ctx.session.user.isAdmin) return true;
  const parsedId = Number.parseInt(ctx.session.user.id ?? "", 10);
  if (!Number.isInteger(parsedId)) return false;

  const user = await ctx.db.legacyUser.findUnique({
    where: { id: parsedId },
    include: {
      userPermissions: { include: { permission: true } },
      position: { include: { defaultPermissions: { include: { permission: true } } } },
    },
  });
  if (!user) return false;

  const names = new Set<string>();
  user.userPermissions?.forEach((up: any) => names.add(up.permission.name));
  const deptId = user.departmentId ? Number(user.departmentId) : null;
  user.position?.defaultPermissions?.forEach((dp: any) => {
    if (deptId == null || dp.departmentId == null || Number(dp.departmentId) === deptId) {
      names.add(dp.permission.name);
    }
  });
  return names.has(required);
}

export function createPosUserRouter(procedure = protectedProcedure) { return createTRPCRouter({
  listEmployeesForPos: procedure.query(async ({ ctx }) => {
    if (isDealershipOperator(ctx) || !(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_USERS))) throw new TRPCError({ code: "FORBIDDEN" });
    return ctx.db.legacyUser.findMany({ where: { isActive: true, isOnHold: false }, select: { id: true, username: true, first_name: true, last_name: true }, orderBy: { username: "asc" } });
  }),
  // ── Roles ────────────────────────────────────────────────────
  listRoles: procedure.query(async ({ ctx }) => {
    if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_ROLES))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_ROLES permission" });
    }
    return ctx.db.posRole.findMany({
      orderBy: { name: "asc" },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
  }),

  getRole: procedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_ROLES))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_ROLES permission" });
      }
      const role = await ctx.db.posRole.findUnique({
        where: { id: input.id },
        include: { permissions: { include: { permission: true } } },
      });
      if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
      return role;
    }),

  createRole: procedure
    .input(z.object({
      name: z.string().trim().min(1).max(100),
      description: z.string().max(500).optional(),
      permissionIds: z.array(z.string().uuid()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_ROLES))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_ROLES permission" });
      }
      return ctx.db.$transaction(async (tx: any) => {
        const role = await tx.posRole.create({
          data: { name: input.name, description: input.description ?? null, isSystem: false },
        });
        if (input.permissionIds.length > 0) {
          await tx.posRolePermission.createMany({
            data: input.permissionIds.map((pid: string) => ({
              roleId: role.id,
              permissionId: pid,
            })),
          });
        }
        return tx.posRole.findUnique({
          where: { id: role.id },
          include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
        });
      });
    }),

  updateRole: procedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      permissionIds: z.array(z.string().uuid()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_ROLES))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_ROLES permission" });
      }
      const existing = await ctx.db.posRole.findUnique({ where: { id: input.id }, select: { isSystem: true } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
      if (existing.isSystem) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot modify system roles" });

      return ctx.db.$transaction(async (tx: any) => {
        if (input.name || input.description !== undefined) {
          await tx.posRole.update({
            where: { id: input.id },
            data: { ...(input.name ? { name: input.name } : {}), description: input.description ?? null },
          });
        }
        if (input.permissionIds !== undefined) {
          await tx.posRolePermission.deleteMany({ where: { roleId: input.id } });
          if (input.permissionIds.length > 0) {
            await tx.posRolePermission.createMany({
              data: input.permissionIds.map((pid: string) => ({ roleId: input.id, permissionId: pid })),
            });
          }
        }
        return tx.posRole.findUnique({
          where: { id: input.id },
          include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
        });
      });
    }),

  deleteRole: procedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_ROLES))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_ROLES permission" });
      }
      const existing = await ctx.db.posRole.findUnique({
        where: { id: input.id },
        include: { _count: { select: { users: true } } },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
      if (existing.isSystem) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete system roles" });
      if (existing._count.users > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete role with assigned users" });
      await ctx.db.posRole.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ── Permissions ──────────────────────────────────────────────
  listPermissions: procedure.query(async ({ ctx }) => {
    if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_ROLES))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_ROLES permission" });
    }
    return ctx.db.posPermission.findMany({ orderBy: [{ group: "asc" }, { code: "asc" }] });
  }),

  // ── Users ────────────────────────────────────────────────────
  listUsers: procedure
    .input(z.object({
      branchId: z.number().int().optional(),
      active: z.boolean().optional(),
      search: z.string().optional(),
    }).default({}))
    .query(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_USERS))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_USERS permission" });
      }
      const where: any = {};
      if (input.branchId) where.branchId = BigInt(input.branchId);
      if (input.active !== undefined) where.active = input.active;
      if (input.search) {
        where.OR = [
          { username: { contains: input.search, mode: "insensitive" } },
          { displayName: { contains: input.search, mode: "insensitive" } },
        ];
      }
      const users = await ctx.db.posUser.findMany({
        where,
        orderBy: { displayName: "asc" },
        include: {
          role: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          assignments: { where: { isActive: true }, include: { device: { select: { id: true, deviceName: true, deviceCode: true } } } },
          _count: { select: { assignments: true } },
        },
      });
      if (isDealershipOperator(ctx)) return users;
      if (!await employeeAccessReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Employee access mapping requires approved database setup." });
      const links = await ctx.db.$queryRaw<Array<{ id: string; username: string; displayName: string }>>`
        SELECT a.pos_user_id AS id, e.username, COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), e.username) AS "displayName"
        FROM pos.employee_pos_access a JOIN public.users e ON e.id = a.employee_id`;
      const employees = new Map(links.map((e) => [e.id, e]));
      return users.filter((u) => employees.has(u.id)).map((u) => ({ ...u, ...employees.get(u.id)! }));
    }),

  getUser: procedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_USERS))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_USERS permission" });
      }
      const user = await ctx.db.posUser.findUnique({
        where: { id: input.id },
        include: {
          role: true,
          branch: true,
          assignments: { where: { isActive: true }, include: { device: true } },
        },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      return user;
    }),

  createUser: procedure
    .input(z.object({
      employeeId: z.number().int().positive().optional(),
      deviceId: z.string().uuid().optional(),
      username: z.string().trim().min(1).max(100),
      displayName: z.string().trim().min(1).max(255),
      pin: z.string().min(4).max(8),
      password: z.string().min(6).max(128).optional(),
      roleId: z.string().uuid(),
      branchId: z.number().int().min(1).optional(),
      pinLoginEnabled: z.boolean().default(true),
      passwordLoginEnabled: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_USERS))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_USERS permission" });
      }
      const actorId = await resolveActorId(ctx);

      const nct = !isDealershipOperator(ctx);
      if (nct && !input.branchId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select the branch before adding POS access." });
      if (nct && !/^\d{6}$/.test(input.pin)) throw new TRPCError({ code: "BAD_REQUEST", message: "NCT POS PINs must contain exactly 6 digits." });
      const employee = nct && input.employeeId ? await ctx.db.legacyUser.findUnique({ where: { id: input.employeeId }, select: { id: true, username: true, first_name: true, last_name: true, isActive: true, isOnHold: true } }) : null;
      if (nct && (!employee || !employee.isActive || employee.isOnHold)) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active employee from OMS Employees." });
      if (nct && !await employeeAccessReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Employee access mapping requires approved database setup." });
      const username = employee?.username ?? input.username;
      const displayName = employee ? [employee.first_name, employee.last_name].filter(Boolean).join(" ") || employee.username : input.displayName;

      const existing = await ctx.db.posUser.findUnique({ where: { username } });
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Username already exists" });

      const { createHash } = await import("node:crypto");
      const pinHash = createHash("sha256").update(input.pin).digest("hex");
      const passwordHash = input.password
        ? createHash("sha256").update(input.password).digest("hex")
        : null;

      const userBranchId = input.branchId
        ? BigInt(input.branchId)
        : (await ctx.db.branch.findFirst({ select: { id: true }, orderBy: { id: "asc" } }))?.id ?? BigInt(1);

      return ctx.db.$transaction(async (tx: any) => {
      if (input.deviceId) {
        const device = await tx.posDevice.findUnique({ where: { id: input.deviceId }, select: { branchId: true } });
        if (!device || device.branchId !== userBranchId) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected device belongs to another branch." });
      }
      const created = await tx.posUser.create({
        data: {
          username,
          displayName,
          pinHash,
          passwordHash,
          roleId: input.roleId,
          branchId: userBranchId,
          pinLoginEnabled: input.pinLoginEnabled,
          passwordLoginEnabled: input.passwordLoginEnabled ?? !!input.password,
          createdBy: actorId,
        },
        include: {
          role: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      });
      if (employee) await tx.$executeRaw`INSERT INTO pos.employee_pos_access(pos_user_id, employee_id) VALUES (${created.id}, ${employee.id})`;
      if (input.deviceId) await tx.posUserAssignment.create({ data: { userId: created.id, deviceId: input.deviceId, assignedBy: actorId } });
      return created;
      });
    }),

  updateUser: procedure
    .input(z.object({
      id: z.string().uuid(),
      displayName: z.string().trim().min(1).max(255).optional(),
      pin: z.string().min(4).max(8).optional(),
      password: z.string().min(6).max(128).optional().nullable(),
      roleId: z.string().uuid().optional(),
      branchId: z.number().int().positive().optional(),
      active: z.boolean().optional(),
      pinLoginEnabled: z.boolean().optional(),
      passwordLoginEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_USERS))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_USERS permission" });
      }
      const actorId = await resolveActorId(ctx);

      const existing = await ctx.db.posUser.findUnique({ where: { id: input.id }, select: { id: true } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const data: any = { updatedBy: actorId };
      if (!isDealershipOperator(ctx)) {
        if (input.pin && !/^\d{6}$/.test(input.pin)) throw new TRPCError({ code: "BAD_REQUEST", message: "NCT POS PINs must contain exactly 6 digits." });
        if (!await employeeAccessReady()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Employee access mapping requires approved database setup." });
        const [employee] = await ctx.db.$queryRaw<Array<{ displayName: string }>>`
          SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''), e.username) AS "displayName"
          FROM pos.employee_pos_access a JOIN public.users e ON e.id = a.employee_id WHERE a.pos_user_id = ${input.id}`;
        if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "This POS access record is not linked to an OMS employee." });
        data.displayName = employee.displayName;
      }
      if (input.displayName && isDealershipOperator(ctx)) data.displayName = input.displayName;
      if (input.roleId) data.roleId = input.roleId;
      if (input.branchId) data.branchId = BigInt(input.branchId);
      if (input.active !== undefined) data.active = input.active;
      if (input.pinLoginEnabled !== undefined) data.pinLoginEnabled = input.pinLoginEnabled;
      if (input.passwordLoginEnabled !== undefined) data.passwordLoginEnabled = input.passwordLoginEnabled;
      if (input.pin) {
        const { createHash } = await import("node:crypto");
        data.pinHash = createHash("sha256").update(input.pin).digest("hex");
      }
      if (input.password !== undefined) {
        const { createHash } = await import("node:crypto");
        data.passwordHash = input.password ? createHash("sha256").update(input.password).digest("hex") : null;
      }

      return ctx.db.posUser.update({
        where: { id: input.id },
        data,
        include: {
          role: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      });
    }),

  deleteUser: procedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_USERS))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_USERS permission" });
      }
      await ctx.db.posUserAssignment.deleteMany({ where: { userId: input.id } });
      await ctx.db.posUser.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ── Assignments ──────────────────────────────────────────────
  assignUserToDevice: procedure
    .input(z.object({
      userId: z.string().uuid(),
      deviceId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_USERS))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_USERS permission" });
      }

      const [user, device] = await Promise.all([
        ctx.db.posUser.findUnique({ where: { id: input.userId }, select: { id: true } }),
        ctx.db.posDevice.findUnique({ where: { id: input.deviceId }, select: { id: true } }),
      ]);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (!device) throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });

      const existingActive = await ctx.db.posUserAssignment.findFirst({
        where: { userId: input.userId, deviceId: input.deviceId, isActive: true },
      });
      if (existingActive) return { success: true, message: "Already assigned" };

      await ctx.db.$transaction(async (tx: any) => {
        await tx.posUserAssignment.updateMany({
          where: { userId: input.userId, isActive: true },
          data: { isActive: false, assignedUntil: new Date() },
        });
        await tx.posUserAssignment.create({
          data: { userId: input.userId, deviceId: input.deviceId },
        });
      });

      return { success: true };
    }),

  unassignUserFromDevice: procedure
    .input(z.object({
      userId: z.string().uuid(),
      deviceId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_USERS))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_USERS permission" });
      }
      await ctx.db.posUserAssignment.updateMany({
        where: { userId: input.userId, deviceId: input.deviceId, isActive: true },
        data: { isActive: false, assignedUntil: new Date() },
      });
      return { success: true };
    }),

  getUserAssignments: procedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_USERS))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_USERS permission" });
      }
      return ctx.db.posUserAssignment.findMany({
        where: { userId: input.userId },
        orderBy: { assignedAt: "desc" },
        include: { device: { select: { id: true, deviceName: true, deviceCode: true } } },
      });
    }),

  getDeviceAssignments: procedure
    .input(z.object({ deviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_USERS))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_USERS permission" });
      }
      return ctx.db.posUserAssignment.findMany({
        where: { deviceId: input.deviceId, isActive: true },
        orderBy: { assignedAt: "desc" },
        include: { user: { select: { id: true, username: true, displayName: true } } },
      });
    }),

  // ── Branches (for user creation form) ────────────────────────
  listBranchesForUser: procedure.query(async ({ ctx }) => {
    if (!(await hasPermission(ctx, PERMISSIONS.MANAGE_POS_USERS))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Missing MANAGE_POS_USERS permission" });
    }
    const branches = await ctx.db.branch.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, location: true },
    });
    return branches.map((b: any) => ({ id: Number(b.id), name: b.name, location: b.location }));
  }),
}); }
export const posUserRouter = createPosUserRouter();

async function resolveActorId(ctx: any): Promise<number> {
  const userType = ctx.session.user.userType || "legacyuser";
  if (userType === "superuser" || ctx.session.user.isAdmin) {
    const parsedId = Number.parseInt(ctx.session.user.id ?? "", 10);
    if (Number.isInteger(parsedId)) {
      const user = await ctx.db.legacyUser.findUnique({ where: { id: parsedId }, select: { id: true } });
      if (user) return user.id;
    }
    const firstUser = await ctx.db.legacyUser.findFirst({ where: { isActive: true }, select: { id: true }, orderBy: { id: "asc" } });
    if (firstUser) return firstUser.id;
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No active legacy user found" });
  }
  if (userType !== "legacyuser") throw new TRPCError({ code: "FORBIDDEN", message: "Only legacy users can manage POS users" });
  const parsedId = Number.parseInt(ctx.session.user.id ?? "", 10);
  if (!Number.isInteger(parsedId)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid user ID" });
  const user = await ctx.db.legacyUser.findUnique({ where: { id: parsedId }, select: { id: true } });
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });

  return user.id;
}
