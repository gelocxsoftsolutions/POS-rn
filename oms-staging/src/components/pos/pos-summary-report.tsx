"use client";

import React, { useState } from "react";
import { api } from "~/trpc/react";
import { formatCurrency } from "~/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

export function PosSummaryReport({
  branchId,
  finance = false,
}: {
  branchId?: number;
  finance?: boolean;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const invalidDates = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const input = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    branchId: branchId ?? (selectedBranch ? Number(selectedBranch) : undefined),
  };
  const pos = api.pos.getSummaryReport.useQuery(input, {
    enabled: !finance && !invalidDates,
    refetchInterval: 30000,
  });
  const accounting = api.finance.getPosSummaryReport.useQuery(input, {
    enabled: finance && !invalidDates,
    refetchInterval: 30000,
  });
  const report = finance ? accounting : pos;
  const data = report.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{branchId ? "Branch Sales" : "POS Summary Report"}</CardTitle>
        <p className="text-sm text-gray-500">
          Recorded NCT POS sales{branchId ? " for this branch" : " across all branches"}. Dates use
          Philippine time. Finance uses the same sales records.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            From
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            Through
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          {!branchId && (
            <label className="text-sm">
              Branch
              <select
                className="block rounded-md border p-2"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                <option value="">All branches</option>
                {data?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            disabled={report.isFetching || invalidDates}
            onClick={() => void report.refetch()}
          >
            Refresh
          </Button>
        </div>
        {invalidDates ? (
          <p role="alert" className="text-red-600">
            Start date must be before end date.
          </p>
        ) : report.error ? (
          <p role="alert" className="text-red-600">
            Unable to load sales: {report.error.message}
          </p>
        ) : report.isLoading ? (
          <p>Loading sales report...</p>
        ) : (
          data && (
            <>
              {!data.attributionReady && (
                <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                  Branch attribution for device sales is awaiting database setup. Historical sales
                  without a branch remain included in the combined total.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Total sales", formatCurrency(data.total)],
                  ["Transactions", data.count],
                  ["Average sale", formatCurrency(data.average)],
                ].map(([label, value]) => (
                  <div className="rounded-lg border p-4" key={label}>
                    <p className="text-sm text-gray-500">{label}</p>
                    <p className="text-2xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="py-2 text-left font-semibold">Sales by branch</caption>
                  <thead>
                    <tr>
                      <th className="p-2">Branch</th>
                      <th className="p-2">Transactions</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.groups.map((g) => (
                      <tr key={g.branchId ?? "unknown"} className="border-t">
                        <td className="p-2">{g.branchName}</td>
                        <td className="p-2">{g.count}</td>
                        <td className="p-2 text-right">{formatCurrency(g.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.count && <p>No recorded sales match these filters.</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="py-2 text-left font-semibold">Latest 50 transactions</caption>
                  <thead>
                    <tr>
                      {[
                        "Receipt",
                        "Date (Philippines)",
                        "Branch",
                        "Cashier",
                        "Payment",
                        "Total",
                      ].map((label) => (
                        <th className="p-2" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((sale) => (
                      <tr className="border-t" key={sale.id}>
                        <td className="p-2">{sale.receiptNumber ?? `POS #${sale.id}`}</td>
                        <td className="p-2">
                          {new Date(sale.createdAt).toLocaleString("en-PH", {
                            timeZone: "Asia/Manila",
                          })}
                        </td>
                        <td className="p-2">{sale.branchName}</td>
                        <td className="p-2">{sale.cashierName ?? "Unavailable"}</td>
                        <td className="p-2">{sale.paymentMethod ?? "Unavailable"}</td>
                        <td className="p-2 text-right">{formatCurrency(sale.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {finance && (
                <p className="text-sm text-gray-500">
                  POS revenue is shown separately. It has not been posted to the OMS FIFO cost or
                  profit ledgers.
                </p>
              )}
            </>
          )
        )}
      </CardContent>
    </Card>
  );
}
