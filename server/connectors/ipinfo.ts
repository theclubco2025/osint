import type { Connector } from "./types";

export const ipinfoConnector: Connector = {
  name: "ipinfo",
  description: "Fetch IP enrichment from ipinfo.io (requires IPINFO_TOKEN).",
  supportedTargetTypes: ["ip"],
  async run(ctx) {
    if (!process.env.IPINFO_TOKEN) {
      return {
        evidence: [
          {
            type: "text",
            title: "IPinfo not configured",
            content: "Set IPINFO_TOKEN to enable this connector.",
            source: "IPinfo",
            tags: ["config"],
          },
        ],
      };
    }

    const ip = ctx.input.trim();
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(process.env.IPINFO_TOKEN)}`, {
      headers: { "User-Agent": "kimi-osint-platform" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`IPinfo error (${res.status}): ${text}`);
    }

    const data = await res.json();
    return {
      evidence: [
        {
          type: "json",
          title: `IPinfo: ${ip}`,
          content: JSON.stringify(data, null, 2),
          source: "IPinfo",
          tags: ["ip", "enrichment"],
        },
      ],
    };
  },
};
