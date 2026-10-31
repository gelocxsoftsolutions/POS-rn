/** Display formatting only: keep calculations and editable numeric fields ungrouped. */
export function formatAmount(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  const [integer, fraction] = amount.toFixed(2).split(".");
  if (fraction === undefined) return amount.toLocaleString("en-PH", {
    useGrouping: true, minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
