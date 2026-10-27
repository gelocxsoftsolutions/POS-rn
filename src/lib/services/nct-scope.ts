import { getApiConfig } from "@/lib/api/http";
import { BusinessConfigurationService } from "@/lib/business/configuration.service";

export function isNctPos() {
  return (
    !getApiConfig().dealership &&
    BusinessConfigurationService.current().operatingMode === "NCT_DEPENDENT"
  );
}
