import { ShiftRepository } from "@/lib/repositories/shift.repository";
import { DeviceRepository } from "@/lib/repositories/device.repository";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { queryFirst } from "@/lib/db/connection";

export const SessionService = {
  async getCurrent() {
    try {
      const shift = await ShiftRepository.findCurrent();
      if (!shift) return null;

      const session = useCashierStore.getState().session;
      return {
        id: shift.id,
        shiftNumber: shift.shiftNumber,
        openedById: shift.cashierId,
        openedByName: shift.cashierName,
        openedAt: shift.openedAt,
        openingFloat: shift.openingFloat,
        status: shift.status as "OPEN" | "CLOSED",
        deviceId: shift.deviceId,
        deviceName: shift.deviceName,
      };
    } catch {
      return null;
    }
  },

  async open(openingFloat: number) {
    try {
      const session = useCashierStore.getState().session;
      const device = await DeviceRepository.find();

      const today = new Date().toISOString().split("T")[0];
      const countResult = await queryFirst<{ c: number }>(
        "SELECT COUNT(*) as c FROM Shift WHERE openedAt LIKE ?",
        [`${today}%`]
      );
      const shiftNumber = `SH-${today.replace(/-/g, "")}-${String((countResult?.c ?? 0) + 1).padStart(3, "0")}`;

      const shift = await ShiftRepository.create({
        shiftNumber,
        cashierId: session?.cashierId,
        cashierName: session?.cashierName,
        deviceId: device?.id,
        deviceName: device?.deviceName,
        branchId: device?.branchId ?? undefined,
        branchName: device?.branchName ?? undefined,
        openingFloat,
      });

      return {
        success: true,
        shift: {
          id: shift.id,
          shiftNumber: shift.shiftNumber,
          openingFloat: shift.openingFloat,
          openedAt: shift.openedAt,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Failed to open shift" };
    }
  },

  async close(shiftId: string, actualCash: number) {
    try {
      const shift = await ShiftRepository.findCurrent();
      if (!shift) return { success: false, error: "No open shift found" };

      const expectedCash = shift.openingFloat + (await this.calculateExpectedCash(shiftId));
      const difference = actualCash - expectedCash;

      const closed = await ShiftRepository.close(shiftId, {
        expectedCash,
        actualCash,
        difference,
      });

      return { success: true, shift: closed };
    } catch (e: any) {
      return { success: false, error: e.message ?? "Failed to close shift" };
    }
  },

  private async calculateExpectedCash(shiftId: string): Promise<number> {
    const result = await queryFirst<{ s: number }>(
      "SELECT COALESCE(SUM(total), 0) as s FROM Sale WHERE shiftId = ? AND paymentMethod = 'CASH' AND status = 'COMPLETED'",
      [shiftId]
    );
    return result?.s ?? 0;
  },
};
