export const SUPER_ADMIN_ID = "__nct_pos_super_admin__";

export function isLocalSuperAdmin(session: { cashierId: string; isSuperAdmin?: boolean } | null) {
  return session?.cashierId === SUPER_ADMIN_ID && session.isSuperAdmin === true;
}
