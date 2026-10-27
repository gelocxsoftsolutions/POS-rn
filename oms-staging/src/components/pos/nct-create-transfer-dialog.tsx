"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import type { CreateTransferDialogProps } from "./create-transfer-dialog";

type Item = {
  id: number;
  productName: string;
  variationName: string;
  stock: number;
  groupKey: string;
  unit: string | null;
};
export function NctCreateTransferDialog({
  isOpen,
  onClose,
  branchId,
  branchName,
  fixedDeviceId,
  onSuccess,
}: CreateTransferDialogProps) {
  const [direction, setDirection] = useState<"INVENTORY_TO_POS" | "POS_TO_INVENTORY">(
    "INVENTORY_TO_POS",
  );
  const [deviceId, setDeviceId] = useState(fixedDeviceId ?? ""),
    [search, setSearch] = useState(""),
    [notes, setNotes] = useState("");
  const [cart, setCart] = useState<Array<Item & { qty: number }>>([]),
    [requestId, setRequestId] = useState(""),
    [error, setError] = useState("");
  const submitting = useRef(false);
  const devices = api.posDevice.getDevices.useQuery(
    { branchId, limit: 500, search: "" },
    { enabled: isOpen },
  );
  const warehouse = api.pos.searchVariations.useQuery(
    { search: search || undefined, limit: 500 },
    { enabled: isOpen && direction === "INVENTORY_TO_POS" },
  );
  const stock = api.pos.getInventory.useQuery(
    { branchId, deviceId, limit: 500, search: search || undefined },
    { enabled: isOpen && direction === "POS_TO_INVENTORY" && Boolean(deviceId) },
  );
  const create = api.posTransfer.create.useMutation();
  useEffect(() => {
    if (isOpen) {
      setDeviceId(fixedDeviceId ?? "");
      setDirection("INVENTORY_TO_POS");
      setCart([]);
      setSearch("");
      setNotes("");
      setError("");
      setRequestId(crypto.randomUUID());
    }
  }, [isOpen, branchId, fixedDeviceId]);
  const options = useMemo<Item[]>(
    () =>
      direction === "INVENTORY_TO_POS"
        ? (warehouse.data ?? []).map((v) => ({
            id: v.id,
            productName: v.productName,
            variationName: v.variationName,
            stock: v.stock,
            groupKey: v.groupKey,
            unit: v.unit,
          }))
        : (stock.data ?? []).map((v) => ({
            id: v.variation.id,
            productName: v.variation.productName,
            variationName: v.variation.variationName,
            stock: v.qty,
            groupKey: v.groupKey,
            unit: v.variation.unit,
          })),
    [direction, warehouse.data, stock.data],
  );
  const invalid =
    cart.some((item) => !Number.isInteger(item.qty) || item.qty < 1) ||
    [...new Set(cart.map((i) => i.groupKey))].some(
      (key) =>
        cart.filter((i) => i.groupKey === key).reduce((sum, i) => sum + i.qty, 0) >
        Math.min(...cart.filter((i) => i.groupKey === key).map((i) => i.stock)),
    );
  const source = direction === "INVENTORY_TO_POS" ? warehouse : stock;
  const submit = async () => {
    if (submitting.current || !deviceId || !cart.length || invalid) return;
    submitting.current = true;
    setError("");
    try {
      const result = await create.mutateAsync({
        clientRequestId: requestId,
        direction,
        targetDeviceId: deviceId,
        targetBranchId: branchId,
        notes: notes.trim() || undefined,
        items: cart.map((i) => ({
          variationId: i.id,
          productName: i.productName,
          variationName: i.variationName,
          allocatedQty: i.qty,
          unit: i.unit ?? undefined,
        })),
      });
      toast.success(`${result.transferNumber} created for approval`);
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Transfer could not be created. Your selection is retained for retry.",
      );
    } finally {
      submitting.current = false;
    }
  };
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !create.isPending) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[92vh] w-[96vw] max-w-5xl flex-col overflow-hidden"
        onEscapeKeyDown={(e) => {
          if (create.isPending) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (create.isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Transfer Products — {branchName ?? "NCT branch"}</DialogTitle>
          <DialogDescription>
            Select the destination device, review quantities, then create a transfer for approval.
            Shared-stock variations draw from the same available balance.
          </DialogDescription>
        </DialogHeader>
        <fieldset
          disabled={create.isPending || Boolean(error)}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Direction
              <select
                className="block w-full rounded-md border p-2"
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value as typeof direction);
                  setCart([]);
                  setRequestId(crypto.randomUUID());
                  setError("");
                }}
              >
                <option value="INVENTORY_TO_POS">OMS warehouse → POS device</option>
                <option value="POS_TO_INVENTORY">POS device → OMS warehouse</option>
              </select>
            </label>
            <label className="text-sm">
              Device
              <select
                disabled={Boolean(fixedDeviceId) || devices.isLoading}
                className="block w-full rounded-md border p-2"
                value={deviceId}
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  setCart([]);
                  setRequestId(crypto.randomUUID());
                  setError("");
                }}
              >
                <option value="">Choose a branch device...</option>
                {devices.data?.devices
                  .filter((d) => d.status !== "DISABLED")
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.deviceName} ({d.deviceCode})
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {devices.error && (
            <p role="alert" className="text-red-600">
              {devices.error.message}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <section className="space-y-2">
              <Input
                aria-label="Search available products"
                placeholder="Search available products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {!deviceId && direction === "POS_TO_INVENTORY" ? (
                <p>Choose a device to see its stock.</p>
              ) : source.isLoading ? (
                <p>Loading available stock...</p>
              ) : source.error ? (
                <p role="alert" className="text-red-600">
                  {source.error.message}{" "}
                  <button type="button" onClick={() => void source.refetch()}>
                    Retry
                  </button>
                </p>
              ) : !options.length ? (
                <p>No matching products with recorded stock.</p>
              ) : (
                <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
                  {options.map((item) => (
                    <li className="flex items-center justify-between gap-2 p-3" key={item.id}>
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-gray-500">
                          {item.variationName} · Available: {item.stock} {item.unit}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={item.stock < 1 || cart.some((i) => i.id === item.id)}
                        onClick={() => setCart((previous) => [...previous, { ...item, qty: 1 }])}
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">Transfer selection</h3>
              {!cart.length ? (
                <p className="rounded-md border border-dashed p-6 text-sm text-gray-500">
                  Add products to review quantities here.
                </p>
              ) : (
                <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
                  {cart.map((item) => (
                    <li className="space-y-2 p-3" key={item.id}>
                      <p className="font-medium">
                        {item.productName} — {item.variationName}
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                          className="w-24"
                          aria-label={`Quantity for ${item.productName} ${item.variationName}`}
                          type="number"
                          min={1}
                          max={item.stock}
                          step={1}
                          value={item.qty}
                          onChange={(e) =>
                            setCart((previous) =>
                              previous.map((i) =>
                                i.id === item.id ? { ...i, qty: Number(e.target.value) } : i,
                              ),
                            )
                          }
                        />
                        <span className="text-xs text-gray-500">of {item.stock} available</span>
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() =>
                            setCart((previous) => previous.filter((i) => i.id !== item.id))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {invalid && (
                <p role="alert" className="text-red-600">
                  Use positive whole quantities within the available balance, including shared
                  stock.
                </p>
              )}
            </section>
          </div>
          <label className="block text-sm">
            Notes
            <textarea
              className="mt-1 block w-full rounded-md border p-2"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error} Retrying the same selection uses the same request ID.
          </p>
        )}
        <DialogFooter className="items-center border-t pt-3">
          <p className="mr-auto text-sm text-gray-500">
            {cart.length} variations ·{" "}
            {cart.reduce((sum, i) => sum + (Number.isFinite(i.qty) ? i.qty : 0), 0)} units
          </p>
          <Button variant="outline" disabled={create.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={create.isPending || !deviceId || !cart.length || invalid || !requestId}
            onClick={() => void submit()}
          >
            {create.isPending ? "Creating transfer..." : "Create Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
