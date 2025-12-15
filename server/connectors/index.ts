import type { Connector, ConnectorName, SupportedTargetType } from "./types";
import { githubConnector } from "./github";
import { waybackConnector } from "./wayback";
import { webScraperConnector } from "./web_scraper";
import { ipinfoConnector } from "./ipinfo";
import { shodanConnector } from "./shodan";
import { hibpConnector } from "./hibp";
import { serpapiConnector } from "./serpapi";
import { pastebinConnector } from "./pastebin";
import { telegramConnector } from "./telegram";

const connectors: Connector[] = [
  githubConnector,
  waybackConnector,
  webScraperConnector,
  ipinfoConnector,
  shodanConnector,
  hibpConnector,
  serpapiConnector,
  pastebinConnector,
  telegramConnector,
];

export function listConnectors() {
  return connectors.map((c) => ({
    name: c.name,
    description: c.description,
    supportedTargetTypes: c.supportedTargetTypes,
  }));
}

export function getConnector(name: ConnectorName) {
  return connectors.find((c) => c.name === name) ?? null;
}

export function normalizeTargetType(input: string): SupportedTargetType {
  if (input === "domain" || input === "email" || input === "username" || input === "ip" || input === "url") return input;
  // Backwards compatible: this repo previously used only domain/email/username.
  return "domain";
}
