/**
 * The public fan page uses #main without the private .app-layout wrapper.
 * Pure selectors are shared with the renderer and tested without a browser dependency.
 */
export interface FocusIdentity {
  readonly id?: string;
  readonly action?: string;
  readonly dataId?: string;
  readonly dataIndex?: string;
}

export function hadMountedScreen(root: { readonly querySelector: (selector: string) => unknown }): boolean {
  return root.querySelector('#main') !== null;
}

export function selectFocusTarget<T>(
  snapshot: FocusIdentity | null,
  candidates: readonly T[],
  identity: (item: T) => FocusIdentity,
): T | undefined {
  if (!snapshot) return undefined;
  if (snapshot.id) {
    const matchingId = candidates.find(candidate => identity(candidate).id === snapshot.id);
    if (matchingId) return matchingId;
  }
  if (!snapshot.action) return undefined;
  return candidates.find(candidate => {
    const item = identity(candidate);
    return item.action === snapshot.action
      && (snapshot.dataId === undefined || item.dataId === snapshot.dataId)
      && (snapshot.dataIndex === undefined || item.dataIndex === snapshot.dataIndex);
  });
}
