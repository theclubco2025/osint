import type { Connector } from "./types";

export const hibpConnector: Connector = {
  name: "hibp",
  description: "HaveIBeenPwned breach check (requires HIBP_API_KEY; obey ToS and rate limits).",
  supportedTargetTypes: ["email"],
  async run(ctx) {
    if (!process.env.HIBP_API_KEY) {
      return {
        evidence: [
          {
            type: "text",
            title: "HIBP not configured",
            content: "Set HIBP_API_KEY to enable this connector. Ensure you comply with HaveIBeenPwned ToS.",
            source: "HaveIBeenPwned",
            tags: ["config"],
          },
        ],
      };
    }

    const email = ctx.input.trim();
    const res = await fetch(
      `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
      {
        headers: {
          "hibp-api-key": process.env.HIBP_API_KEY,
          "User-Agent": process.env.HIBP_USER_AGENT ?? "kimi-osint-platform",
          "Accept": "application/json",
        },
      },
    );

    // HIBP uses 404 for "no breach".
    if (res.status === 404) {
      return {
        evidence: [
          {
            type: "json",
            title: `HIBP breaches: ${email}`,
            content: JSON.stringify({ breaches: [] }, null, 2),
            source: "HaveIBeenPwned",
            tags: ["breach", "hibp"],
            metadata: { breached: false },
          },
        ],
      };
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HIBP error (${res.status}): ${text}`);
    }

    const breaches = await res.json();
    return {
      evidence: [
        {
          type: "json",
          title: `HIBP breaches: ${email}`,
          content: JSON.stringify({ breaches }, null, 2),
          source: "HaveIBeenPwned",
          tags: ["breach", "hibp"],
          metadata: { breached: Array.isArray(breaches) && breaches.length > 0 },
        },
      ],
    };
  },
};
