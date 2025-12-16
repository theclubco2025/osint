import crypto from "crypto";
import type { Investigation, Message, Evidence, Entity, TimelineEvent } from "@shared/schema";

export type CaseFileV1 = {
  schemaVersion: "karma-osint.casefile.v1";
  exportedAt: string;
  investigation: Investigation;
  messages: Message[];
  evidence: Evidence[];
  entities: Entity[];
  timeline: TimelineEvent[];
  integrity: {
    evidenceHashes: { id: string; hash: string; title: string; source: string }[];
    bundleSha256: string;
  };
  kimiContext: {
    target: string;
    targetType: string;
    phase: string;
    confidence: number;
    evidenceTitles: string[];
    entitySummary: { entityType: string; value: string }[];
  };
};

export function buildCaseFileV1(args: {
  investigation: Investigation;
  messages: Message[];
  evidence: Evidence[];
  entities: Entity[];
  timeline: TimelineEvent[];
}): CaseFileV1 {
  const evidenceHashes = args.evidence.map((e) => ({
    id: e.id,
    hash: e.hash,
    title: e.title,
    source: e.source,
  }));

  const base: Omit<CaseFileV1, "integrity"> = {
    schemaVersion: "karma-osint.casefile.v1",
    exportedAt: new Date().toISOString(),
    investigation: args.investigation,
    messages: args.messages,
    evidence: args.evidence,
    entities: args.entities,
    timeline: args.timeline,
    kimiContext: {
      target: args.investigation.target,
      targetType: args.investigation.targetType,
      phase: args.investigation.phase,
      confidence: args.investigation.confidence,
      evidenceTitles: args.evidence.slice(0, 25).map((e) => `${e.source}: ${e.title}`),
      entitySummary: args.entities.slice(0, 50).map((e) => ({ entityType: e.entityType, value: e.value })),
    },
  };

  // Compute bundle hash without integrity.bundleSha256 (stable enough for portability)
  const preHash = JSON.stringify({ ...base, integrity: { evidenceHashes } });
  const bundleSha256 = crypto.createHash("sha256").update(preHash).digest("hex");

  return {
    ...base,
    integrity: {
      evidenceHashes,
      bundleSha256,
    },
  };
}


