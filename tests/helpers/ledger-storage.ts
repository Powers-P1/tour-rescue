import type { LedgerStorage, LedgerTransaction } from '../../worker/src/ledger.ts';

/** Serialized, rollback-capable storage double, matching Durable Object transaction semantics. */
export class MemoryLedgerStorage implements LedgerStorage {
  data = new Map<string, unknown>();
  failNextWrite = false;
  private tail: Promise<unknown> = Promise.resolve();

  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.data.get(key)) as T | undefined; }
  async put<T>(key: string, value: T): Promise<void> { this.data.set(key, structuredClone(value)); }
  async delete(key: string): Promise<boolean> { return this.data.delete(key); }

  transaction<T>(operation: (transaction: LedgerTransaction) => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const snapshot = structuredClone(this.data);
      const transaction: LedgerTransaction = {
        get: async <V>(key: string) => structuredClone(snapshot.get(key)) as V | undefined,
        put: async (key, value) => {
          if (this.failNextWrite) { this.failNextWrite = false; throw new Error('Synthetic storage write failure.'); }
          snapshot.set(key, structuredClone(value));
        },
        delete: async key => snapshot.delete(key),
      };
      const value = await operation(transaction);
      this.data = snapshot;
      return value;
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
}
