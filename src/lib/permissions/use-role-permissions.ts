import { useEffect, useMemo, useState } from "react";
import { PermissionService } from "@/lib/services/permission.service";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { useSyncStore } from "@/lib/stores/sync-store";
import { isNctPos } from "@/lib/services/nct-scope";

export function useRolePermissions() {
  const session = useCashierStore((state) => state.session);
  const directoryRevision = useSyncStore((state) => isNctPos() ? state.lastSyncTime : null);
  const [codes, setCodes] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    if (session?.isSuperAdmin) {
      setCodes([]);
      setLoaded(true);
      return () => { active = false; };
    }
    if (!session?.roleId) {
      setCodes([]);
      setLoaded(true);
      return () => { active = false; };
    }
    PermissionService.getEffectivePermissions(session.roleId, session.cashierId)
      .then((permissions) => { if (active) setCodes(permissions); })
      .catch(() => { if (active) setCodes([]); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [session?.cashierId, session?.isSuperAdmin, session?.roleId, directoryRevision]);

  return useMemo(() => ({
    loaded,
    codes,
    has: (code: string) => Boolean(session?.isSuperAdmin || codes.includes(code)),
  }), [codes, loaded, session?.isSuperAdmin]);
}
