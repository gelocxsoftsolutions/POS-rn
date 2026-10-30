export function normalizePosPath(path: string) {
  const normalized = path.replace(/^\/\(pos\)/, "") || "/";
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}

export function isNavItemActive(pathname: string, href: string) {
  const current = normalizePosPath(pathname);
  const target = normalizePosPath(href);
  return target === "/" ? current === "/" : current === target || current.startsWith(`${target}/`);
}

export function permissionRedirect(pathname: string, forbidden: boolean, allowedHrefs: string[]) {
  if (!forbidden) return null;
  // No permitted destination: keep the shell mounted and display access guidance.
  const target = allowedHrefs.find((href) => !isNavItemActive(pathname, href));
  return target ?? null;
}
