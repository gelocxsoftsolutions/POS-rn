import { BusinessConfigurationService } from "@/lib/business/configuration.service";

export function isNctPos() {
  return (
    BusinessConfigurationService.current().operatingMode === "NCT_DEPENDENT"
  );
}
