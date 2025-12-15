import type { Investigation } from "@shared/schema";

export type ConnectorName =
  | "github"
  | "wayback"
  | "web-scraper"
  | "ipinfo"
  | "shodan"
  | "hibp"
  | "serpapi"
  | "pastebin"
  | "telegram";

export type SupportedTargetType = "domain" | "email" | "username" | "ip" | "url";

export interface ConnectorRunContext {
  investigation: Investigation;
  // The input to run the connector against; defaults to investigation.target.
  input: string;
  targetType: SupportedTargetType;
  // Optional operator-supplied settings.
  options?: Record<string, any>;
}

export interface ConnectorEvidenceDraft {
  type: "text" | "html" | "json" | "network" | "image";
  title: string;
  // Content can be raw text or a file path; store metadata.storedPath when saved.
  content: string;
  source: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ConnectorRunResult {
  evidence: ConnectorEvidenceDraft[];
  notes?: string;
}

export interface Connector {
  name: ConnectorName;
  description: string;
  supportedTargetTypes: SupportedTargetType[];
  run(ctx: ConnectorRunContext): Promise<ConnectorRunResult>;
}
