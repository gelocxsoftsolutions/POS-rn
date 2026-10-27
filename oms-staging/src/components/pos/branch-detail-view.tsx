"use client";

import React, { useState } from "react";
import { ArrowLeft, Boxes, Monitor, ArrowRightLeft, MapPin } from "lucide-react";
import { useDepartmentTheme } from "~/contexts/DepartmentThemeContext";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { BranchInventorySubTab } from "./branch-inventory-sub-tab";
import { BranchDevicesSubTab } from "./branch-devices-sub-tab";
import { TransferMonitoringTab } from "./transfer-monitoring-tab";
import { PosSummaryReport } from "./pos-summary-report";
import { PosUsersDevicesTab } from "./pos-users-devices-tab";
import { NctBackupsTab } from "./nct-backups-tab";
import { usePosScope, usePosPermission } from "./pos-scope";
import { PERMISSIONS } from "~/lib/permissions";

type SubTab = "inventory" | "devices" | "transfers" | "sales" | "users" | "backups";

const SUB_TABS: { key: SubTab; label: string; icon: typeof Boxes }[] = [
  { key: "inventory", label: "Branch Inventory", icon: Boxes },
  { key: "devices", label: "Devices", icon: Monitor },
  { key: "transfers", label: "Product Transfer", icon: ArrowRightLeft },
  { key: "sales", label: "Branch Sales", icon: Boxes },
  { key: "users", label: "Users & Roles", icon: Monitor },
  { key: "backups", label: "Database Backups", icon: Boxes },
];

interface BranchDetailViewProps {
  branch: { id: number; name: string; location: string | null; code: string | null; color?: string | null };
  onBack: () => void;
}

export function BranchDetailView({ branch, onBack }: BranchDetailViewProps) {
  const scope = usePosScope();
  const { can } = usePosPermission();
  const { gradient } = useDepartmentTheme();
  const [subTab, setSubTab] = useState<SubTab>("inventory");
  const branchColor = branch.color || "#2563EB";

  return (
    <Card className="bg-white shadow-lg border-0">
      <CardHeader className="text-white rounded-t-xl border-b" style={{ background: `linear-gradient(135deg, ${branchColor}, ${branchColor}dd)` }}>
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-white flex items-center justify-center hover:bg-white/90 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-blue-600" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white truncate">{branch.name}</h2>
              {branch.code && (
                <Badge variant="secondary" className="bg-white/20 text-white border-0 text-xs shrink-0">
                  {branch.code}
                </Badge>
              )}
            </div>
            {branch.location && (
              <p className="text-white/80 text-sm mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {branch.location}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          {SUB_TABS.filter((t) => t.key === "backups" ? scope === "pos" && can(PERMISSIONS.MANAGE_POS_DEVICES) : t.key === "users" ? scope === "pos" && (can(PERMISSIONS.MANAGE_POS_USERS) || can(PERMISSIONS.MANAGE_POS_ROLES)) : t.key !== "sales" || (scope === "pos" && can(PERMISSIONS.VIEW_POS_SALES_HISTORY))).map((t) => {
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
        {subTab === "backups" && scope === "pos" && can(PERMISSIONS.MANAGE_POS_DEVICES) && <NctBackupsTab branchId={branch.id} />}
        {subTab === "users" && scope === "pos" && <PosUsersDevicesTab branchId={branch.id} />}
        {subTab === "sales" && scope === "pos" && can(PERMISSIONS.VIEW_POS_SALES_HISTORY) && <PosSummaryReport branchId={branch.id} />}
        {subTab === "inventory" && (
          <BranchInventorySubTab branchId={branch.id} branchName={branch.name} />
        )}
        {subTab === "devices" && (
          <BranchDevicesSubTab branchId={branch.id} branchName={branch.name} />
        )}
        {subTab === "transfers" && (
          <TransferMonitoringTab branchId={branch.id} branchName={branch.name} />
        )}
      </CardContent>
    </Card>
  );
}
