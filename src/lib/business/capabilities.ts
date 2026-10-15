import type { BusinessCapabilities, OperatingMode } from "./types";

const CAPABILITIES: Record<OperatingMode, BusinessCapabilities> = {
  NCT_DEPENDENT: {
    manageLocalCatalog: false,
    manageLocalInventory: false,
    receiveNctTransfers: true,
    importNctCatalog: true,
    uploadEndOfDay: true,
    uploadBackups: true,
  },
  INDEPENDENT: {
    manageLocalCatalog: true,
    manageLocalInventory: true,
    receiveNctTransfers: false,
    importNctCatalog: false,
    uploadEndOfDay: true,
    uploadBackups: true,
  },
};

export function capabilitiesFor(mode: OperatingMode): BusinessCapabilities {
  return CAPABILITIES[mode];
}

export function assertCapability(
  mode: OperatingMode,
  capability: keyof BusinessCapabilities
): void {
  if (!CAPABILITIES[mode][capability]) {
    throw new Error(`This operation is unavailable in ${mode === "INDEPENDENT" ? "Independent" : "OMS-dependent"} mode.`);
  }
}
