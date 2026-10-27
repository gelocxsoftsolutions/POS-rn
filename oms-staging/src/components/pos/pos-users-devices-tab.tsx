"use client";

import { usePosScope } from "./pos-scope";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Monitor,
  Users,
  Shield,
  BadgePlus,
  Search,
  Circle,
  Eye,
  Edit3,
  Trash2,
  Plus,
  X,
  UserPlus,
  GripVertical,
  ClipboardList,
} from "lucide-react";
import { useDepartmentTheme } from "~/contexts/DepartmentThemeContext";
import { usePosPermission as usePermission } from "./pos-scope";
import { PERMISSIONS } from "~/lib/permissions";
import { usePosApi } from "./pos-scope";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { RegisterDeviceDialog } from "./register-device-dialog";
import { CreateUserModal } from "./create-user-modal";
import { CreateRoleModal } from "./create-role-modal";

type SubTab = "devices" | "users" | "roles" | "audit-logs";

const SUB_TABS: { key: SubTab; label: string; icon: typeof Monitor }[] = [
  { key: "devices", label: "Devices", icon: Monitor },
  { key: "users", label: "Users", icon: Users },
  { key: "roles", label: "Roles", icon: Shield },
  { key: "audit-logs", label: "Audit Logs", icon: ClipboardList },
];

export function PosUsersDevicesTab({ branchId }: { branchId?: number } = {}) {
  const api = usePosApi();
  const isolatedDealership = usePosScope() === "dealership";
  const { gradient, primaryColor } = useDepartmentTheme();
  const { can } = usePermission();
  const canManageDevices = can(PERMISSIONS.MANAGE_POS_DEVICES);
  const canManageUsers = can(PERMISSIONS.MANAGE_POS_USERS);
  const canManageRoles = can(PERMISSIONS.MANAGE_POS_ROLES);

  const [subTab, setSubTab] = useState<SubTab>(branchId ? "users" : "devices");
  const visibleSubTabs = SUB_TABS.filter((t) =>
    t.key === "devices" ? canManageDevices || canManageUsers
      : t.key === "users" ? canManageUsers
      : t.key === "roles" ? canManageRoles
      : t.key === "audit-logs" ? canManageDevices || canManageUsers
      : false,
  );

  if (visibleSubTabs.length === 0) return null;

  return (
    <Card className="bg-white shadow-lg border-0">
      <CardHeader className="text-white rounded-t-xl border-b" style={{ background: gradient }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shadow-sm">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-white">Users & Devices</CardTitle>
              <p className="text-white/90 text-sm mt-1">Manage POS devices, users, and roles</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1 mt-3">
          {visibleSubTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setSubTab(t.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  subTab === t.key
                    ? "bg-white/20 text-white shadow-sm"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {subTab === "devices" && <DevicesSubTab canManageDevices={!!canManageDevices} />}
        {subTab === "users" && <UsersSubTab branchId={branchId} />}
        {subTab === "roles" && <RolesSubTab />}
        {subTab === "audit-logs" && <AuditLogsSubTab />}
      </CardContent>
    </Card>
  );
}

// ── DEVICES SUB-TAB ────────────────────────────────────────────────

function DevicesSubTab({ canManageDevices }: { canManageDevices: boolean }) {
  const api = usePosApi();
  const isolatedDealership = usePosScope() === "dealership";
  const { gradient } = useDepartmentTheme();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const devicesQuery = api.posDevice.getDevices.useQuery({ search, limit: 100 });
  const statsQuery = api.posDevice.getDashboardStats.useQuery();

  const updateStatus = api.posDevice.updateDeviceStatus.useMutation({
    onSuccess: () => { toast.success("Device status updated"); void devicesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteDevice = api.posDevice.deleteDevice.useMutation({
    onSuccess: () => { toast.success("Device deleted"); void devicesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const STATUS_BADGES: Record<string, { label: string; color: string; bg: string }> = {
    ONLINE: { label: "Online", color: "text-green-700", bg: "bg-green-100" },
    IDLE: { label: "Idle", color: "text-amber-700", bg: "bg-amber-100" },
    OFFLINE: { label: "Offline", color: "text-gray-700", bg: "bg-gray-100" },
    DISABLED: { label: "Disabled", color: "text-red-700", bg: "bg-red-100" },
    PENDING: { label: "Pending", color: "text-blue-700", bg: "bg-blue-100" },
  };

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletePassword, setDeletePassword] = useState("");

  const confirmDelete = () => {
    if (!deleteTarget || !deletePassword) return;
    deleteDevice.mutate({ deviceId: deleteTarget.id, password: deletePassword });
  };

  const handleDeleteDialogClose = () => {
    setDeleteTarget(null);
    setDeletePassword("");
  };

  useEffect(() => {
    if (deleteDevice.isSuccess && deleteTarget) {
      handleDeleteDialogClose();
    }
  }, [deleteDevice.isSuccess]);

  return (
    <div className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search devices..."
            className="w-64 pl-9"
          />
        </div>
        {canManageDevices ? (
          <Button disabled={isolatedDealership} title={isolatedDealership ? "Use Enroll Device on the dealership page" : undefined} onClick={() => setRegisterOpen(true)}>
            <BadgePlus className="w-4 h-4 mr-2" />
            Register Device
          </Button>
        ) : null}
      </div>

      {statsQuery.data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-4">
          <div className="rounded-lg bg-white p-3 border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total</div>
            <div className="mt-1 text-xl font-bold text-slate-900">{statsQuery.data.total}</div>
          </div>
          <div className="rounded-lg bg-green-50 p-3 border border-green-200 shadow-sm">
            <div className="text-xs text-green-600 font-medium uppercase tracking-wide">Online</div>
            <div className="mt-1 text-xl font-bold text-green-700">{statsQuery.data.online}</div>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 shadow-sm">
            <div className="text-xs text-amber-600 font-medium uppercase tracking-wide">Idle</div>
            <div className="mt-1 text-xl font-bold text-amber-700">{statsQuery.data.idle}</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 border border-gray-200 shadow-sm">
            <div className="text-xs text-gray-600 font-medium uppercase tracking-wide">Offline</div>
            <div className="mt-1 text-xl font-bold text-gray-700">{statsQuery.data.offline}</div>
          </div>
          <div className="rounded-lg bg-red-50 p-3 border border-red-200 shadow-sm">
            <div className="text-xs text-red-600 font-medium uppercase tracking-wide">Disabled</div>
            <div className="mt-1 text-xl font-bold text-red-700">{statsQuery.data.disabled}</div>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 border border-blue-200 shadow-sm">
            <div className="text-xs text-blue-600 font-medium uppercase tracking-wide">Pending</div>
            <div className="mt-1 text-xl font-bold text-blue-700">{statsQuery.data.pending}</div>
          </div>
          <div className="rounded-lg bg-purple-50 p-3 border border-purple-200 shadow-sm">
            <div className="text-xs text-purple-600 font-medium uppercase tracking-wide">Expired Sessions</div>
            <div className="mt-1 text-xl font-bold text-purple-700">{statsQuery.data.expiredSessions}</div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide mr-1">Filter:</span>
        {[null, "ONLINE", "IDLE", "OFFLINE", "DISABLED", "PENDING"].map((status) => {
          const label = status === null ? "All" : (STATUS_BADGES[status]?.label ?? status);
          const isActive = statusFilter === status;
          const statusBg = status === null ? "bg-slate-100 text-slate-700" : `${STATUS_BADGES[status]?.bg ?? "bg-slate-100"} ${STATUS_BADGES[status]?.color ?? "text-slate-700"}`;
          return (
            <button
              key={status ?? "all"}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "ring-2 ring-offset-1 ring-blue-400 " + statusBg
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg overflow-hidden">
          <thead className="bg-gradient-to-r from-blue-50 to-blue-100/50">
            <tr className="text-left text-gray-700">
              <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm">Device</th>
              <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm">Branch</th>
              <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm">Status</th>
              <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm hidden sm:table-cell">Health</th>
              <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm hidden sm:table-cell">Last Seen</th>
              <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm hidden md:table-cell">Assigned Users</th>
              <th className="py-3 px-3 sm:py-4 sm:px-6 font-semibold text-xs sm:text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {devicesQuery.isLoading ? (
              <tr><td colSpan={7} className="py-12 text-center text-gray-500">Loading POS devices...</td></tr>
            ) : (devicesQuery.data?.devices.length ?? 0) === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-gray-500">No POS devices registered yet.</td></tr>
            ) : (
              devicesQuery.data?.devices
                .filter((device) => !statusFilter || device.status === statusFilter)
                .map((device) => {
                  const badge = STATUS_BADGES[device.status] ?? { label: "Pending", color: "text-blue-700", bg: "bg-blue-100" };
                  const healthLabel = device.healthStatus === "HEALTHY" ? "Healthy"
                    : device.healthStatus === "WARNING" ? "Warning"
                    : device.healthStatus === "CRITICAL" ? "Critical" : "Unknown";
                  const healthColor = device.healthStatus === "HEALTHY" ? "text-green-700 bg-green-100"
                    : device.healthStatus === "WARNING" ? "text-amber-700 bg-amber-100"
                    : device.healthStatus === "CRITICAL" ? "text-red-700 bg-red-100"
                    : "text-gray-700 bg-gray-100";
                  return (
                    <tr key={device.id} className="border-b border-gray-100 bg-gradient-to-r from-white to-blue-50/10 transition-colors hover:bg-blue-50/50 hover:from-blue-50/20 hover:to-blue-100/20">
                      <td className="py-3 px-3 sm:py-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-blue-200">
                            <Monitor className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 text-sm sm:text-base">{device.deviceName}</div>
                            <div className="text-xs text-gray-500 font-mono">{device.deviceCode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 sm:py-4 sm:px-6">
                        <span className="text-sm text-gray-700">{device.branchName}</span>
                      </td>
                      <td className="py-3 px-3 sm:py-4 sm:px-6">
                        <Badge className={`${badge.bg} ${badge.color} border-0`}>
                          <Circle className="mr-1 h-2 w-2 fill-current" />
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 sm:py-4 sm:px-6 hidden sm:table-cell">
                        <Badge className={`${healthColor} border-0`}>{healthLabel}</Badge>
                      </td>
                      <td className="py-3 px-3 sm:py-4 sm:px-6 hidden sm:table-cell">
                        <span className="text-sm text-gray-600">
                          {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : "—"}
                        </span>
                      </td>
                      <td className="py-3 px-3 sm:py-4 sm:px-6 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {device.assignments?.length > 0 ? (
                            device.assignments.filter((a: any) => a.isActive).map((a: any) => (
                              <Badge key={a.id} className="bg-blue-50 text-blue-700 border border-blue-200 text-xs">
                                {a.user?.displayName ?? "—"}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400 italic">None</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 sm:py-4 sm:px-6">
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm"
                            onClick={() => router.push(`/pos/devices/${device.id}`)}
                            className="border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50"
                          >
                            <Eye className="mr-1 h-3 w-3" /> View
                          </Button>
                          {canManageDevices && device.status !== "DISABLED" ? (
                            <Button type="button" variant="outline" size="sm"
                              onClick={() => updateStatus.mutate({ deviceId: device.id, status: "DISABLED" })}
                              disabled={updateStatus.isPending}
                              className="border-red-200 text-red-600 hover:border-red-400 hover:bg-red-50"
                            >Disable</Button>
                          ) : null}
                          {canManageDevices ? (
                            <Button type="button" variant="outline" size="sm"
                              onClick={() => setDeleteTarget({ id: device.id, name: device.deviceName })}
                              disabled={deleteDevice.isPending}
                              className="border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50"
                            >Delete</Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
            )}
          </tbody>
        </table>
      </div>

      <RegisterDeviceDialog
        isOpen={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSuccess={() => void devicesQuery.refetch()}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleDeleteDialogClose}>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b bg-gradient-to-r from-red-600 to-red-700 p-4 text-white rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">Delete Device</div>
                  <div className="text-sm text-white/80">{deleteTarget.name}</div>
                </div>
              </div>
              <button type="button" onClick={handleDeleteDialogClose} className="rounded-full p-2 text-white/80 hover:bg-white/15 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">
                Enter your password to confirm deletion. This action cannot be undone — the device will be revoked and all sessions terminated.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Your Password *</label>
                <Input
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  type="password"
                  placeholder="Enter your password"
                  autoFocus
                />
              </div>
              {deleteDevice.error && (
                <p className="mt-2 text-sm text-red-600">{deleteDevice.error.message}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t p-4">
              <Button variant="outline" onClick={handleDeleteDialogClose}>Cancel</Button>
              <Button
                onClick={confirmDelete}
                disabled={!deletePassword || deleteDevice.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteDevice.isPending ? "Deleting..." : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── USERS SUB-TAB ──────────────────────────────────────────────────

function UsersSubTab({ branchId }: { branchId?: number }) {
  const api = usePosApi();
  const { primaryColor } = useDepartmentTheme();
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const usersQuery = api.posUser.listUsers.useQuery({ branchId, search: search || undefined });
  const devicesQuery = api.posDevice.getDevices.useQuery({ search: "", limit: 500 });
  const rolesQuery = api.posUser.listRoles.useQuery();
  const assignMut = api.posUser.assignUserToDevice.useMutation({
    onSuccess: () => { toast.success("Assigned to device"); void usersQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const unassignMut = api.posUser.unassignUserFromDevice.useMutation({
    onSuccess: () => { toast.success("Unassigned from device"); void usersQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const handleAssignDevice = (userId: string, deviceId: string) => {
    if (deviceId) assignMut.mutate({ userId, deviceId });
  };

  const handleUnassignDevice = (userId: string, deviceId: string) => {
    unassignMut.mutate({ userId, deviceId });
  };

  return (
    <div className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-64 pl-9"
          />
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Create User
        </Button>
      </div>

      <CreateUserModal
        branchId={branchId}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => void usersQuery.refetch()}
      />

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg overflow-hidden">
          <thead className="bg-gradient-to-r from-blue-50 to-blue-100/50">
            <tr className="text-left text-gray-700">
              <th className="py-3 px-4 font-semibold text-xs sm:text-sm">User</th>
              <th className="py-3 px-4 font-semibold text-xs sm:text-sm">Role</th>
              <th className="py-3 px-4 font-semibold text-xs sm:text-sm hidden sm:table-cell">Status</th>
              <th className="py-3 px-4 font-semibold text-xs sm:text-sm">Assigned Device</th>
              <th className="py-3 px-4 font-semibold text-xs sm:text-sm w-52">Actions</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.isLoading ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-500">Loading users...</td></tr>
            ) : !usersQuery.data?.length ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-500">No users yet.</td></tr>
            ) : (
              usersQuery.data.map((user: any) => {
                return (
                  <tr key={user.id} className="border-b border-gray-100 hover:bg-blue-50/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-600 font-semibold text-sm">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{user.displayName}</div>
                          <div className="text-xs text-gray-500">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className="bg-purple-100 text-purple-700 border-0">{user.role?.name ?? "—"}</Badge>
                    </td>
                    <td className="py-3 px-4 hidden sm:table-cell">
                      <Badge className={user.active ? "bg-green-100 text-green-700 border-0" : "bg-red-100 text-red-700 border-0"}>
                        {user.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {user.assignments?.filter((a: any) => a.isActive).map((a: any) => (
                          <Badge key={a.id} className="bg-blue-50 text-blue-700 border border-blue-200 text-xs flex items-center gap-1">
                            <Monitor className="w-3 h-3" />
                            {a.device?.deviceName ?? "—"}
                            <button
                              type="button"
                              onClick={() => handleUnassignDevice(user.id, a.deviceId)}
                              className="ml-0.5 text-blue-400 hover:text-red-500"
                              title="Unassign"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {(!user.assignments || user.assignments.filter((a: any) => a.isActive).length === 0) && (
                          <span className="text-sm text-gray-400 italic">Not assigned</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssignDevice(user.id, e.target.value);
                            }
                          }}
                          className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs"
                        >
                          <option value="">Add device...</option>
                          {devicesQuery.data?.devices
                            .filter((d: any) => !user.assignments?.some((a: any) => a.isActive && a.deviceId === d.id))
                            .map((d: any) => (
                              <option key={d.id} value={d.id}>{d.deviceName}</option>
                            ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ASSIGN DEVICES DIALOG ──────────────────────────────────────────

function AssignDevicesDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const api = usePosApi();
  const devicesQuery = api.posDevice.getDevices.useQuery({ search: "", limit: 200 });
  const userAssignmentsQuery = api.posUser.getUserAssignments.useQuery({ userId: user.id });
  const assignMut = api.posUser.assignUserToDevice.useMutation({
    onSuccess: () => { void userAssignmentsQuery.refetch(); void devicesQuery.refetch(); toast.success("Assigned"); },
    onError: (err) => toast.error(err.message),
  });
  const unassignMut = api.posUser.unassignUserFromDevice.useMutation({
    onSuccess: () => { void userAssignmentsQuery.refetch(); void devicesQuery.refetch(); toast.success("Unassigned"); },
    onError: (err) => toast.error(err.message),
  });

  const assignedDeviceIds = new Set(userAssignmentsQuery.data?.filter((a: any) => a.isActive).map((a: any) => a.deviceId) ?? []);
  const devices = devicesQuery.data?.devices ?? [];

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "link"; };
  const handleDrop = (e: React.DragEvent, deviceId: string) => {
    e.preventDefault();
    assignMut.mutate({ userId: user.id, deviceId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-indigo-600 to-indigo-700 p-4 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">Assign Devices</div>
              <div className="text-sm text-white/80">{user.displayName} (@{user.username})</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-white/80 hover:bg-white/15 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-4 p-4 max-h-[70vh]">
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              All Devices — drag onto assigned area
            </p>
            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {devices
                .filter((d: any) => !assignedDeviceIds.has(d.id))
                .map((device: any) => (
                  <div
                    key={device.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", device.id);
                      e.dataTransfer.effectAllowed = "link";
                    }}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
                  >
                    <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-indigo-100 to-indigo-200">
                      <Monitor className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{device.deviceName}</div>
                      <div className="text-xs text-gray-500 font-mono">{device.deviceCode}</div>
                    </div>
                    <Badge className={`${device.status === "ONLINE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"} border-0 text-xs`}>
                      {device.status ?? "—"}
                    </Badge>
                  </div>
                ))}
              {devices.filter((d: any) => !assignedDeviceIds.has(d.id)).length === 0 && (
                <div className="py-8 text-center text-sm text-gray-400">All devices assigned to this user.</div>
              )}
            </div>
          </div>

          <div className="w-px bg-slate-200" />

          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Assigned to <span className="font-bold">{user.displayName}</span>
            </p>
            <div
              className="space-y-2 max-h-[55vh] overflow-y-auto min-h-[200px] rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 p-3"
              onDragOver={handleDragOver}
              onDrop={(e) => {
                e.preventDefault();
                const deviceId = e.dataTransfer.getData("text/plain");
                if (deviceId) handleDrop(e, deviceId);
              }}
            >
              {userAssignmentsQuery.data?.filter((a: any) => a.isActive).map((assignment: any) => (
                <div
                  key={assignment.id}
                  className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-green-100 to-green-200">
                    <Monitor className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{assignment.device?.deviceName ?? "—"}</div>
                    <div className="text-xs text-gray-500 font-mono">{assignment.device?.deviceCode ?? "—"}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => unassignMut.mutate({ userId: user.id, deviceId: assignment.deviceId })}
                    className="rounded-full p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Unassign"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {(userAssignmentsQuery.data?.filter((a: any) => a.isActive).length ?? 0) === 0 && (
                <div className="py-8 text-center text-sm text-gray-400 italic">Drop devices here</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

// ── ROLES SUB-TAB ──────────────────────────────────────────────────

function RolesSubTab() {
  const api = usePosApi();
  const { primaryColor } = useDepartmentTheme();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const rolesQuery = api.posUser.listRoles.useQuery();
  const permsQuery = api.posUser.listPermissions.useQuery();
  const updateRole = api.posUser.updateRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); setEditing(null); void rolesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteRole = api.posUser.deleteRole.useMutation({
    onSuccess: () => { toast.success("Role deleted"); void rolesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPerms, setEditPerms] = useState<string[]>([]);

  const startEdit = (role: any) => {
    setEditing(role.id);
    setEditName(role.name);
    setEditDesc(role.description ?? "");
    setEditPerms(role.permissions?.map((rp: any) => rp.permissionId) ?? []);
  };

  const cancelEdit = () => {
    setEditing(null);
  };

  const saveRole = () => {
    if (!editName.trim()) { toast.error("Role name is required"); return; }
    if (editing) {
      updateRole.mutate({ id: editing, name: editName.trim(), description: editDesc.trim() || undefined, permissionIds: editPerms });
    }
  };

  const togglePerm = (permId: string) => {
    setEditPerms((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId],
    );
  };

  const permissionsByGroup = permsQuery.data?.reduce((acc: Record<string, any[]>, p: any) => {
    const group = p.group ?? "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(p);
    return acc;
  }, {} as Record<string, any[]>) ?? {};

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Define roles and assign page/action permissions for POS users.</p>
        <Button onClick={() => setShowCreateModal(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" /> New Role
        </Button>
      </div>

      <CreateRoleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => void rolesQuery.refetch()}
      />

      <div className="grid gap-4">
        {rolesQuery.isLoading ? (
          <div className="py-8 text-center text-gray-500">Loading roles...</div>
        ) : !rolesQuery.data?.length ? (
          <div className="py-8 text-center text-gray-500">No roles defined yet.</div>
        ) : (
          rolesQuery.data.map((role: any) => {
            const isEditing = editing === role.id;
            return (
              <Card key={role.id} className={`border ${isEditing ? "border-blue-200 ring-1 ring-blue-100" : "border-gray-200"}`}>
                <CardContent className="p-4">
                  {isEditing ? (
                    <div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600">Role Name</label>
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)}
                            disabled={role.isSystem} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600">Description</label>
                          <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                            disabled={role.isSystem} />
                        </div>
                      </div>

                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Permissions</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto p-3 rounded-lg border bg-gray-50">
                          {Object.entries(permissionsByGroup).map(([group, perms]) => (
                            <div key={group}>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{group}</p>
                              {(perms as Array<any>).map((perm: any) => (
                                <label key={perm.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer hover:bg-white rounded px-1">
                                  <input
                                    type="checkbox"
                                    checked={editPerms.includes(perm.id)}
                                    onChange={() => togglePerm(perm.id)}
                                    disabled={role.isSystem}
                                    className="rounded"
                                  />
                                  {perm.name}
                                </label>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={saveRole} size="sm" disabled={updateRole.isPending || role.isSystem}>
                          {updateRole.isPending ? "Saving..." : "Save"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={cancelEdit}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-100 to-purple-200">
                            <Shield className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{role.name}</div>
                            {role.description && <div className="text-xs text-gray-500">{role.description}</div>}
                            <div className="text-xs text-gray-400 mt-1">
                              {role._count?.users ?? 0} user(s) · {role.permissions?.length ?? 0} permission(s)
                              {role.isSystem && <Badge className="ml-2 bg-slate-100 text-slate-600 border-0 text-xs">System</Badge>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!role.isSystem && (
                            <>
                              <Button type="button" variant="outline" size="sm"
                                onClick={() => startEdit(role)}
                                className="border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50"
                              >
                                <Edit3 className="mr-1 h-3 w-3" /> Edit
                              </Button>
                              <Button type="button" variant="outline" size="sm"
                                onClick={() => {
                                  if (window.confirm(`Delete role "${role.name}"?`)) deleteRole.mutate({ id: role.id });
                                }}
                                disabled={deleteRole.isPending}
                                className="border-red-200 text-red-600 hover:border-red-400 hover:bg-red-50"
                              >
                                <Trash2 className="mr-1 h-3 w-3" /> Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {role.permissions?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {role.permissions.map((rp: any) => (
                            <Badge key={rp.permissionId} className="bg-gray-100 text-gray-600 border-0 text-xs font-normal">
                              {rp.permission.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── AUDIT LOGS SUB-TAB ──────────────────────────────────────────

function AuditLogsSubTab() {
  const api = usePosApi();
  const [actionFilter, setActionFilter] = useState<string>("");
  const [deviceFilter, setDeviceFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const LIMIT = 50;

  const devicesQuery = api.posDevice.getDevices.useQuery({ search: "", limit: 500 });

  const auditQuery = api.posDevice.getPosAuditLogs.useQuery({
    deviceId: deviceFilter || undefined,
    action: actionFilter || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    limit: LIMIT,
    offset: page * LIMIT,
  });

  const ACTION_OPTIONS = [
    { value: "", label: "All Actions" },
    { value: "SALE_CREATED", label: "Sale Created" },
    { value: "TRANSFER_INVENTORY_TO_POS", label: "Transfer In" },
    { value: "TRANSFER_POS_TO_INVENTORY", label: "Transfer Out" },
    { value: "LOGIN_SUCCESS", label: "Login Success" },
    { value: "LOGIN_FAILED", label: "Login Failed" },
    { value: "LOGOUT", label: "Logout" },
  ];

  const ACTION_COLORS: Record<string, string> = {
    SALE_CREATED: "bg-green-100 text-green-700",
    TRANSFER_INVENTORY_TO_POS: "bg-blue-100 text-blue-700",
    TRANSFER_POS_TO_INVENTORY: "bg-amber-100 text-amber-700",
    LOGIN_SUCCESS: "bg-emerald-100 text-emerald-700",
    LOGIN_FAILED: "bg-red-100 text-red-700",
    LOGOUT: "bg-gray-100 text-gray-700",
    DEVICE_RECONNECTED: "bg-purple-100 text-purple-700",
    DEVICE_FORGOTTEN: "bg-orange-100 text-orange-700",
  };

  const totalPages = auditQuery.data ? Math.ceil(auditQuery.data.total / LIMIT) : 0;

  return (
    <div className="p-4">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={deviceFilter}
          onChange={(e) => { setDeviceFilter(e.target.value); setPage(0); }}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm"
        >
          <option value="">All Devices</option>
          {devicesQuery.data?.devices.map((d: any) => (
            <option key={d.id} value={d.id}>{d.deviceName} ({d.deviceCode})</option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPage(0); }}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPage(0); }}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg overflow-hidden">
          <thead className="bg-gradient-to-r from-blue-50 to-blue-100/50">
            <tr className="text-left text-gray-700">
              <th className="py-3 px-4 font-semibold text-xs sm:text-sm">Timestamp</th>
              <th className="py-3 px-4 font-semibold text-xs sm:text-sm">Action</th>
              <th className="py-3 px-4 font-semibold text-xs sm:text-sm hidden sm:table-cell">Device</th>
              <th className="py-3 px-4 font-semibold text-xs sm:text-sm hidden sm:table-cell">Cashier</th>
              <th className="py-3 px-4 font-semibold text-xs sm:text-sm">Details</th>
            </tr>
          </thead>
          <tbody>
            {auditQuery.isLoading ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-500">Loading audit logs...</td></tr>
            ) : !auditQuery.data?.logs.length ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-500">No audit logs found.</td></tr>
            ) : (
              auditQuery.data.logs.map((log: any) => (
                <tr key={log.id} className="border-b border-gray-100 hover:bg-blue-50/30">
                  <td className="py-3 px-4 text-sm whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <Badge className={`text-xs ${ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-700"}`}>
                      {log.action}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 hidden sm:table-cell">
                    {log.deviceId ? log.deviceId.slice(0, 8) + "..." : "—"}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 hidden sm:table-cell">
                    {log.cashierUserId ?? "—"}
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-500 max-w-[200px] truncate">
                    {log.details ? JSON.stringify(log.details) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {page + 1} of {totalPages} ({auditQuery.data?.total ?? 0} total)
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
