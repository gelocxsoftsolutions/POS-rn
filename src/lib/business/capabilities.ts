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
    manageLocalCatalog: false,
    manageLocalInventory: false,
    receiveNctTransfers: true,
    importNctCatalog: true,
    uploadEndOfDay: false,
    uploadBackups: false,
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
    throw new Error("This operation is unavailable in NCT OMS-dependent POS.");
  }
}
