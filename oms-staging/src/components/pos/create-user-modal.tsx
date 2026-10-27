"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";
import { X, UserCog, Users as UsersIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { usePosApi, usePosScope } from "./pos-scope";

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  branchId?: number;
}

export function CreateUserModal({ isOpen, onClose, onSuccess, branchId }: CreateUserModalProps) {
  const api = usePosApi();
  const nct = usePosScope() === "pos";
  const employees = api.posUser.listEmployeesForPos.useQuery(undefined, { enabled: isOpen && nct });
  const devicesQuery = api.posDevice.getDevices.useQuery({ search: "", limit: 500 });
  const rolesQuery = api.posUser.listRoles.useQuery();
  const createUser = api.posUser.createUser.useMutation({
    onSuccess: () => {
      toast.success("User created");
      onSuccess?.();
      onClose();
      setForm(initialForm);
    },
    onError: (err) => {
      try {
        const issues = JSON.parse(err.message) as Array<{ path: string[]; message: string }>;
        if (Array.isArray(issues)) {
          const friendly = issues.map((i) => {
            const field = i.path?.[0] ?? "";
            const label = field === "password" ? "Password" : field === "pin" ? "PIN" : field === "username" ? "Username" : field === "displayName" ? "Display Name" : field;
            return `${label} ${i.message.replace("String ", "")}`;
          }).join("\n");
          toast.error(friendly);
          return;
        }
      } catch {}
      toast.error(err.message);
    },
  });

  const initialForm = {
    employeeId: "", username: "", displayName: "", pin: "", password: "",
    roleId: "", deviceId: "", pinLoginEnabled: true, passwordLoginEnabled: false,
  };
  const [form, setForm] = useState(initialForm);

  const handleCreate = () => {
    if (!form.username || !form.displayName || !form.pin || !form.roleId) {
      toast.error("Please fill in all required fields");
      return;
    }
    createUser.mutate({
      employeeId: nct ? Number(form.employeeId) : undefined,
      deviceId: nct ? form.deviceId || undefined : undefined,
      branchId,
      username: form.username,
      displayName: form.displayName,
      pin: form.pin,
      password: form.password || undefined,
      roleId: form.roleId,
      pinLoginEnabled: form.pinLoginEnabled,
      passwordLoginEnabled: form.passwordLoginEnabled,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b bg-gradient-to-r from-indigo-600 to-indigo-700 p-4 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <UsersIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">Create New User</div>
              <div className="text-sm text-white/80">Add a POS user account</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-white/80 hover:bg-white/15 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6">
          {nct && <label className="mb-4 block text-sm">OMS Employee *
            <select className="block w-full rounded-lg border p-2" value={form.employeeId} onChange={(e) => {
              const employee = employees.data?.find((person) => person.id === Number(e.target.value));
              setForm({ ...form, employeeId: e.target.value, username: employee?.username ?? "", displayName: employee ? [employee.first_name, employee.last_name].filter(Boolean).join(" ") || employee.username : "" });
            }}><option value="">Select an employee...</option>{employees.data?.map((person) => <option key={person.id} value={person.id}>{[person.first_name, person.last_name].filter(Boolean).join(" ") || person.username} (@{person.username})</option>)}</select>
            {employees.error && <p role="alert" className="text-red-600">{employees.error.message}</p>}
          </label>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Username *</label>
              <Input disabled={nct} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. jdelacruz" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Display Name *</label>
              <Input disabled={nct} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="e.g. Juan Dela Cruz" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">PIN * (4-8 digits)</label>
              <Input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} type="password" maxLength={8} placeholder="••••" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Password (optional)</label>
              <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" placeholder="••••••" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Role *</label>
              <select
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                className="flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select role...</option>
                {rolesQuery.data?.map((r: { id: string; name: string }) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Assign to Device</label>
              <select
                value={form.deviceId}
                onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
                className="flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Skip assignment...</option>
                {devicesQuery.data?.devices.filter((d: any) => !branchId || Number(d.branchId) === branchId).map((d: any) => (
                  <option key={d.id} value={d.id}>{d.deviceName} ({d.deviceCode})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-6 mb-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.pinLoginEnabled}
                onChange={(e) => setForm({ ...form, pinLoginEnabled: e.target.checked })} />
              PIN login enabled
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.passwordLoginEnabled}
                onChange={(e) => setForm({ ...form, passwordLoginEnabled: e.target.checked })} />
              Password login enabled
            </label>
          </div>

          {(() => {
            const raw = createUser.error?.message;
            if (!raw) return null;
            try {
              const issues = JSON.parse(raw) as Array<{ path: string[]; message: string }>;
              if (Array.isArray(issues)) {
                return (
                  <div className="mb-4 space-y-1">
                    {issues.map((i, idx) => {
                      const field = i.path?.[0] ?? "";
                      const label = field === "password" ? "Password" : field === "pin" ? "PIN" : field === "username" ? "Username" : field === "displayName" ? "Display Name" : field;
                      return <p key={idx} className="text-sm text-red-600">{label} {i.message.replace("String ", "")}</p>;
                    })}
                  </div>
                );
              }
            } catch {}
            return <p className="mb-4 text-sm text-red-600">{raw}</p>;
          })()}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createUser.isPending}>
              {createUser.isPending ? "Creating..." : "Create User"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
