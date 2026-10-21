import { createUnitHandler } from './app.ts';
import { ledgerOptions } from './config.ts';
import type { WorkerEnv } from './config.ts';
import { UsageLedger } from './ledger.ts';
import type { LedgerStorage } from './ledger.ts';
import { handleWorkerRequest } from './router.ts';

/** Keep the existing class name/binding/migration; this HTTP-only DO needs no RPC base class. */
export class UnitLedger {
  private readonly handle: (request: Request) => Promise<Response>;

  constructor(ctx: { readonly storage: LedgerStorage }, env: WorkerEnv) {
    const ledger = new UsageLedger(ctx.storage, ledgerOptions(env, Date.now));
    this.handle = createUnitHandler({ env, ledger,
      probeStorage: async () => { await ctx.storage.get('tour-rescue:quotas:v1'); } });
  }

  fetch(request: Request): Promise<Response> { return this.handle(request); }
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleWorkerRequest(request, env);
  },
};
