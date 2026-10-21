import { DurableObject } from "cloudflare:workers";

const VERSION = "0.0.1-skeleton";

export class UnitLedger extends DurableObject {
  async fetch(_request: Request): Promise<Response> {
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS ping (n INTEGER)");
    this.ctx.storage.sql.exec("INSERT INTO ping VALUES (1)");
    const rows = this.ctx.storage.sql.exec("SELECT COUNT(*) AS c FROM ping").one();
    return Response.json({ ok: true, pings: rows.c });
  }
}

export default {
  async fetch(request: Request, env: { UNIT_LEDGER: DurableObjectNamespace }): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, version: VERSION });
    }
    if (url.pathname === "/do-check") {
      const stub = env.UNIT_LEDGER.get(env.UNIT_LEDGER.idFromName("check"));
      return stub.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};
