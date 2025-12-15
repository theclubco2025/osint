import type { Connector } from "./types";

export const serpapiConnector: Connector = {
  name: "serpapi",
  description: "Search engine results via SerpAPI (requires SERPAPI_API_KEY).",
  supportedTargetTypes: ["domain", "email", "username"],
  async run(ctx) {
    if (!process.env.SERPAPI_API_KEY) {
      return {
        evidence: [
          {
            type: "text",
            title: "SerpAPI not configured",
            content: "Set SERPAPI_API_KEY to enable this connector.",
            source: "SerpAPI",
            tags: ["config"],
          },
        ],
      };
    }

    const q = ctx.options?.query ?? ctx.input;
    const apiUrl = new URL("https://serpapi.com/search.json");
    apiUrl.searchParams.set("engine", "google");
    apiUrl.searchParams.set("q", String(q));
    apiUrl.searchParams.set("api_key", process.env.SERPAPI_API_KEY);

    const res = await fetch(apiUrl.toString(), { headers: { "User-Agent": "kimi-osint-platform" } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SerpAPI error (${res.status}): ${text}`);
    }

    const data = await res.json();
    return {
      evidence: [
        {
          type: "json",
          title: `SerpAPI results: ${q}`,
          content: JSON.stringify(data, null, 2),
          source: "SerpAPI",
          tags: ["search"],
          metadata: { query: q },
        },
      ],
    };
  },
};
