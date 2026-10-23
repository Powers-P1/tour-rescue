/** A history entry may only retrieve a snapshot held by this document. */
export function createWorkspaceHistory<T extends { screen: string }>(documentId: string = crypto.randomUUID()) {
  const entries = new Map<string, T>();
  let sequence = 0;
  const get = (key: unknown): T | undefined => typeof key === 'string' ? entries.get(key) : undefined;
  return {
    get,
    remember(previous: unknown, workspace: T): string {
      const key = typeof previous === 'string' && get(previous)?.screen === workspace.screen
        ? previous : documentId + ':' + ++sequence;
      entries.set(key, workspace);
      while (entries.size > 120) entries.delete(entries.keys().next().value!);
      return key;
    },
  };
}

/** Numeric keys from the older build also need the expired-context fallback. */
export function isWorkspaceHistoryKey(value: unknown): value is string | number {
  return (typeof value === 'string' && value.length > 0) || typeof value === 'number';
}

export function canonicalWorkspaceHash(hash: string): string {
  return hash === 'breakpoint' ? 'simulation' : hash === 'audit' ? 'evidence'
    : hash === 'options' ? 'rescue' : hash;
}

export function workspaceScreenHash(screen: string): string {
  return screen === 'today' ? '' : screen === 'options' ? 'rescue' : screen;
}
