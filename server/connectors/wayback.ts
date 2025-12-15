import type { Connector } from "./types";

export const waybackConnector: Connector = {
  name: "wayback",
  description: "Query the Internet Archive Wayback Machine CDX index for snapshots.",
  supportedTargetTypes: ["domain", "url"],
  async run(ctx) {
    const input = ctx.input.trim();
    const url = ctx.targetType === "domain" ? `${input}/*` : input;

    const apiUrl = new URL("https://web.archive.org/cdx/search/cdx");
    apiUrl.searchParams.set("url", url);
    apiUrl.searchParams.set("output", "json");
    apiUrl.searchParams.set("fl", "timestamp,original,statuscode,mimetype");
    apiUrl.searchParams.set("filter", "statuscode:200");
    apiUrl.searchParams.set("collapse", "digest");
    apiUrl.searchParams.set("limit", String(ctx.options?.limit ?? 50));

    const res = await fetch(apiUrl.toString(), {
      headers: { "User-Agent": "kimi-osint-platform" },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Wayback CDX error (${res.status}): ${text}`);
    }

    const data = await res.json();
    // data[0] is header row.
    const rows = Array.isArray(data) ? data.slice(1) : [];

    return {
      evidence: [
        {
          type: "json",
          title: `Wayback snapshots: ${input}`,
          content: JSON.stringify({ query: apiUrl.toString(), rows }, null, 2),
          source: "Wayback Machine",
          tags: ["wayback", "archive"],
          metadata: { query: apiUrl.toString(), count: rows.length },
        },
      ],
    };
  },
};
