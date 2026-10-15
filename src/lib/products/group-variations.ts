export interface VariationLike {
  productCode?: string | null;
  name: string;
}

/**
 * Groups products into variation families. Two items belong to the same
 * group when they share a productCode OR share a normalized name, so
 * same-name items with different codes (e.g. CRABSTICK 200G vs 250G from
 * separate OMS products) still appear as one card with a variation picker
 * instead of duplicated cards.
 */
export function groupByVariation<T extends VariationLike>(items: T[]): T[][] {
  const groups: T[][] = [];
  const codeToGroup = new Map<string, T[]>();
  const nameToGroup = new Map<string, T[]>();

  const repoint = (from: T[], to: T[]) => {
    for (const [key, group] of codeToGroup) {
      if (group === from) codeToGroup.set(key, to);
    }
    for (const [key, group] of nameToGroup) {
      if (group === from) nameToGroup.set(key, to);
    }
  };

  for (const item of items) {
    const code = item.productCode?.trim().toLowerCase();
    const name = item.name.toLowerCase().trim();
    const codeGroup = code ? codeToGroup.get(code) : undefined;
    const nameGroup = nameToGroup.get(name);

    let target = codeGroup ?? nameGroup;
    if (!target) {
      target = [];
      groups.push(target);
    } else {
      if (codeGroup && codeGroup !== target) {
        for (const member of codeGroup) target.push(member);
        groups.splice(groups.indexOf(codeGroup), 1);
        repoint(codeGroup, target);
      }
      const currentNameGroup = nameToGroup.get(name);
      if (currentNameGroup && currentNameGroup !== target) {
        for (const member of currentNameGroup) target.push(member);
        groups.splice(groups.indexOf(currentNameGroup), 1);
        repoint(currentNameGroup, target);
      }
    }

    target.push(item);
    if (code) codeToGroup.set(code, target);
    nameToGroup.set(name, target);
  }

  return groups;
}
