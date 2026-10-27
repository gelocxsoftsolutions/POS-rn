// Serialize sale delivery and stock snapshots; checkout remains entirely local.
let tail: Promise<unknown> = Promise.resolve();
export function serializeNctSync<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work, work);
  tail = result.catch(() => {});
  return result;
}
