import type { Connector } from "./types";

export const shodanConnector: Connector = {
  name: "shodan",
  description: "Fetch host intelligence from Shodan (requires SHODAN_API_KEY).",
  supportedTargetTypes: ["ip"],
  async run(ctx) {
    if (!process.env.SHODAN_API_KEY) {
      return {
        evidence: [
          {
            type: "text",
            title: "Shodan not configured",
            content: "Set SHODAN_API_KEY to enable this connector.",
            source: "Shodan",
            tags: ["config"],
          },
        ],
      };
    }

    const ip = ctx.input.trim();
    const res = await fetch(
      `https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${encodeURIComponent(process.env.SHODAN_API_KEY)}`,
      { headers: { "User-Agent": "kimi-osint-platform" } },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shodan error (${res.status}): ${text}`);
    }

    const data = await res.json();
    return {
      evidence: [
        {
          type: "json",
          title: `Shodan host: ${ip}`,
          content: JSON.stringify(data, null, 2),
          source: "Shodan",
          tags: ["ip", "ports"],
        },
      ],
    };
  },
};
