"use client";

import React, { Suspense } from "react";
import {
  TrendingUp,
  Wallet,
  BookOpen,
  LineChart,
} from "lucide-react";

const PesoIcon = ({ className }: { className?: string }) => (
  <span className={className} style={{ fontFamily: "Arial", fontWeight: 700, lineHeight: 1 }}>₱</span>
);
import { usePersistentTab } from "~/hooks/usePersistentTab";
import { useDepartmentTheme } from "~/contexts/DepartmentThemeContext";
import { PermissionProtected } from "~/components/PermissionProtected";
import { usePermission } from "~/hooks/usePermissions";
import { PageHeader } from "~/components/ui/page-header";
import { Skeleton } from "~/components/ui/skeleton";
import { PERMISSIONS } from "~/lib/permissions";
import ProfitLoss from "./profit-loss";
import COGS from "./cogs";
import InventoryValuation from "./inventory-valuation";
import FIFOBatchLedger from "./fifo-batch-ledger";
import ProductProfitability from "./product-profitability";
import { PosSummaryReport } from "~/components/pos/pos-summary-report";

const tabs = [
  { key: "pos-summary", label: "POS Summary Report", icon: TrendingUp },
  { key: "profit-loss", label: "Profit & Loss", icon: TrendingUp },
  { key: "cogs", label: "Cost of Goods Sold (COGS)", icon: PesoIcon },
  { key: "inventory-valuation", label: "Inventory Valuation", icon: Wallet },
  { key: "fifo-ledger", label: "FIFO Batch Ledger", icon: BookOpen },
  { key: "product-profitability", label: "Product Profitability", icon: LineChart },
];

const FinancePageContent = () => {
  const [activeTab, setActiveTab] = usePersistentTab("finance-active-tab", "profit-loss");
  const { gradient } = useDepartmentTheme();
  const { can, isLoading: isLoadingPermissions } = usePermission();

  const canViewProfitLoss = !isLoadingPermissions && can(PERMISSIONS.VIEW_FINANCE_TAB_PROFIT_LOSS);
  const canViewCOGS = !isLoadingPermissions && can(PERMISSIONS.VIEW_FINANCE_TAB_COGS);
  const canViewInventoryValuation = !isLoadingPermissions && can(PERMISSIONS.VIEW_FINANCE_TAB_INVENTORY_VALUATION);
  const canViewFIFOLedger = !isLoadingPermissions && can(PERMISSIONS.VIEW_FINANCE_TAB_FIFO_LEDGER);
  const canViewProductProfitability = !isLoadingPermissions && can(PERMISSIONS.VIEW_FINANCE_TAB_PRODUCT_PROFITABILITY);

  const visibleTabs = tabs.filter((t) => {
    if (t.key === "pos-summary") return canViewProfitLoss;
    if (t.key === "profit-loss") return canViewProfitLoss;
    if (t.key === "cogs") return canViewCOGS;
    if (t.key === "inventory-valuation") return canViewInventoryValuation;
    if (t.key === "fifo-ledger") return canViewFIFOLedger;
    if (t.key === "product-profitability") return canViewProductProfitability;
    return false;
  });

  if (isLoadingPermissions) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="w-full max-w-none px-2 sm:px-4 lg:px-6 py-4 sm:py-6">
          <div className="flex items-center gap-4 mb-8">
            <Skeleton className="w-14 h-14 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
          <Skeleton className="h-12 w-full rounded-lg mb-6" />
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="w-full max-w-none px-2 sm:px-4 lg:px-6 py-4 sm:py-6">
        <PageHeader
          title="Finance"
          subtitle="Profit & Loss, COGS, Inventory Valuation, FIFO Ledger, and Product Profitability"
          icon={TrendingUp}
        />

        <div className="sticky -top-3 sm:-top-4 lg:-top-6 z-10 bg-gray-50 pt-3 sm:pt-4 pb-2 sm:pb-3 lg:pb-4 -mx-2 px-2 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6 mb-2">
          <div className="sm:hidden">
            <div className="flex overflow-x-auto scrollbar-hide space-x-1 bg-white rounded-lg p-1 shadow-sm border">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-shrink-0 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md font-medium transition-all min-w-[100px] text-center ${
                    activeTab === tab.key
                      ? "text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                  style={{
                    background: activeTab === tab.key ? gradient : undefined,
                  }}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden sm:block">
            <div className="flex space-x-1 bg-white rounded-lg p-1 shadow-sm border">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium transition-all ${
                    activeTab === tab.key
                      ? "text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                  style={{
                    background: activeTab === tab.key ? gradient : undefined,
                  }}
                >
                  <tab.icon className="w-5 h-5" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === "pos-summary" && canViewProfitLoss && <PosSummaryReport finance />}
        {activeTab === "profit-loss" && canViewProfitLoss && <ProfitLoss />}
        {activeTab === "cogs" && canViewCOGS && <COGS />}
        {activeTab === "inventory-valuation" && canViewInventoryValuation && <InventoryValuation />}
        {activeTab === "fifo-ledger" && canViewFIFOLedger && <FIFOBatchLedger />}
        {activeTab === "product-profitability" && canViewProductProfitability && <ProductProfitability />}

        {visibleTabs.length === 0 && (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <TrendingUp className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <h3 className="mb-2 text-lg font-semibold text-gray-700">
                No Access to Finance Tabs
              </h3>
              <p className="text-sm text-gray-600">
                You don&apos;t have permission to view any Finance tabs
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const FinancePage = () => {
  return (
    <PermissionProtected requiredPermission="VIEW_FINANCE" pageName="Finance">
      <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
        <FinancePageContent />
      </Suspense>
    </PermissionProtected>
  );
};

export default FinancePage;
