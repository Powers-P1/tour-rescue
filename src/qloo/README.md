# Qloo boundary

`contracts.ts` specifies our application-owned adapter boundary. It does not describe the raw Qloo JSON schema. Maintainer probes report `urn:geohash` and `urn:entity:locality`, district-level localities without a dedicated city field, and ignored heatmap `take`. The complete raw response contract, normalized city mapping, scenario coverage and Worker access remain **UNKNOWN**; see [QLOO_NOTES](../../docs/QLOO_NOTES.md).

PR4 will add the GET-only client and runtime response adapter after maintainers supply an approved recording/contract. Each normalized profile represents one artist query over the same frozen city universe. The adapter must not reinterpret missing rows as zero, mix query-local raw affinities, silently drop cities, or merge geographic cells without a documented rule. Application profile weights are not Qloo per-entity weights.

Record the query ID and a provenance reference so a later audit can join input data to the redacted query log. No API keys, authorization headers, IP addresses or unrestricted upstream payloads belong in public fixtures or client bundles. Maintainers own credentials, live probes, publication clearance and deployment.

The probes also report domination by a popular comparison artist in a combined-artist query. PR1 deliberately consumes separate artist vectors, computes ranks within each, then applies explicit model weights. Before PR4, agree a bounded region and response-size cap: `take` is not a reliable payload limit for heatmaps. A district or geohash must not be silently treated as a city.
