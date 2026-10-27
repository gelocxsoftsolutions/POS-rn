"use client";

import React, { useState } from "react";
import { Store, Boxes, ReceiptText, BarChart3 } from "lucide-react";
import { PermissionProtected } from "~/components/PermissionProtected";
import { PageHeader } from "~/components/ui/page-header";
import { usePersistentTab } from "~/hooks/usePersistentTab";
import { useDepartmentTheme } from "~/contexts/DepartmentThemeContext";
import { usePermission } from "~/hooks/usePermissions";
import { PERMISSIONS } from "~/lib/permissions";
import { PosBranchManagementTab } from "~/components/pos/pos-branch-management-tab";
import { PosSalesTab } from "~/components/pos/pos-sales-tab";
import { PosSummaryReport } from "~/components/pos/pos-summary-report";
import { BranchDetailView } from "~/components/pos/branch-detail-view";

type TabKey = "branch-management" | "sales" | "summary";

function PosPageContent() {
  const [activeTab, setActiveTab] = usePersistentTab("pos-active-tab", "branch-management");
  const tab = (activeTab === "users-devices" ? "summary" : ["branch-management", "sales", "summary"].includes(activeTab) ? activeTab : "branch-management") as TabKey;
  const { gradient } = useDepartmentTheme();
  const { can } = usePermission();

  // Branch detail state - when a branch is selected, show BranchDetailView instead of the grid
  const [selectedBranch, setSelectedBranch] = useState<{ id: number; name: string; location: string | null; code: string | null; color?: string | null } | null>(null);

  const canViewBranches = can(PERMISSIONS.VIEW_POS);
  const canViewSales = can(PERMISSIONS.VIEW_POS_SALES_HISTORY) || can(PERMISSIONS.EDIT_POS_PRICES) || can(PERMISSIONS.EDIT_PRICING) || can(PERMISSIONS.CREATE_POS_SALES);
  const canViewSummary = can(PERMISSIONS.VIEW_POS_SALES_HISTORY);

  const visibleTabs = [
    canViewBranches ? { key: "branch-management" as const, label: "POS Branch Management", icon: Boxes } : null,
    canViewSales ? { key: "sales" as const, label: "POS Sales", icon: ReceiptText } : null,
    canViewSummary ? { key: "summary" as const, label: "POS Summary Report", icon: BarChart3 } : null,
  ].filter(Boolean) as Array<{ key: TabKey; label: string; icon: typeof Boxes }>;

  const effectiveTab = visibleTabs.some((item) => item.key === tab) ? tab : (visibleTabs[0]?.key ?? "branch-management");

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-none px-2 sm:px-4 lg:px-6 py-4 sm:py-6">
        <PageHeader title="POS Management" subtitle="Manage POS branches, sales, users, and devices" icon={Store} />

        {/* Tab bar */}
        <div className="sticky -top-3 sm:-top-4 lg:-top-6 z-10 bg-gray-50 pt-3 sm:pt-4 pb-2 sm:pb-3 lg:pb-4 -mx-2 px-2 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6 mb-2">
          <div className="rounded-lg border bg-white p-1 shadow-sm">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(visibleTabs.length, 1)}, minmax(0, 1fr))` }}>
              {visibleTabs.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.key} type="button" onClick={() => { setActiveTab(item.key); setSelectedBranch(null); }}
                    className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 font-medium transition-all text-center ${effectiveTab === item.key ? "text-white shadow-sm" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
                    style={{ background: effectiveTab === item.key ? gradient : undefined }}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="mt-4 space-y-4">
          {effectiveTab === "branch-management" && (
            selectedBranch ? (
              <BranchDetailView branch={selectedBranch} onBack={() => setSelectedBranch(null)} />
            ) : (
              <PosBranchManagementTab onSelectBranch={setSelectedBranch} />
            )
          )}
          {effectiveTab === "sales" && <PosSalesTab />}
          {effectiveTab === "summary" && <PosSummaryReport />}
        </div>
      </div>
    </div>
  );
}

export default function PosPage() {
  return (
    <PermissionProtected requiredPermission={PERMISSIONS.VIEW_POS} pageName="POS">
      <PosPageContent />
    </PermissionProtected>
  );
}
