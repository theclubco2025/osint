import type { Connector } from "./types";

export const telegramConnector: Connector = {
  name: "telegram",
  description: "Telegram public channels connector placeholder (requires operator-provided integration).",
  supportedTargetTypes: ["username", "domain", "email"],
  async run() {
    return {
      evidence: [
        {
          type: "text",
          title: "Telegram connector not implemented",
          content:
            "Telegram collection requires an operator-provided integration and careful legal review. This is a placeholder to keep the plugin architecture consistent.",
          source: "Telegram",
          tags: ["placeholder"],
        },
      ],
    };
  },
};
