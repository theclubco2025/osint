import type { Connector } from "./types";

export const pastebinConnector: Connector = {
  name: "pastebin",
  description: "Pastebin connector placeholder (public indexing/scraping is often restricted).",
  supportedTargetTypes: ["email", "username", "domain"],
  async run(ctx) {
    return {
      evidence: [
        {
          type: "text",
          title: "Pastebin connector disabled",
          content:
            "This connector is intentionally disabled by default to avoid ToS violations. If you have an approved data source or API, implement it here.",
          source: "Pastebin",
          tags: ["disabled"],
        },
      ],
      notes: "Disabled by default for compliance reasons.",
    };
  },
};
