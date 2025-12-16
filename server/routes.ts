import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertInvestigationSchema, insertMessageSchema, insertEvidenceSchema } from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";
import { kimiClient } from "./lib/kimi";
import { runSafeOsintCollection } from "./lib/osint";
import { buildCaseFileV1 } from "./lib/caseExport";
import { buildIntelligenceBoardMarkdown, localAnswerFromEvidence } from "./lib/board";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check
  app.get("/api/health", async (req, res) => {
    const provider = String(process.env.OSINT_SEARCH_PROVIDER || "").trim().toLowerCase();
    const kimiConfigured = Boolean((process.env.KIMI_API_KEY || "").trim());
    const webSearchConfigured =
      provider === "brave"
        ? Boolean((process.env.BRAVE_SEARCH_API_KEY || "").trim())
        : provider === "routeway"
          ? Boolean((process.env.ROUTEWAY_API_KEY || "").trim()) && Boolean((process.env.ROUTEWAY_SEARCH_URL || "").trim())
          : false;

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      config: {
        kimiConfigured,
        webSearchProvider: provider || null,
        webSearchConfigured,
      },
    });
  });

  // Audit log (portable)
  app.get("/api/audit-log", async (_req, res) => {
    try {
      const events = await storage.listAuditEvents(500);
      res.json(events);
    } catch (error) {
      console.error("Error fetching audit log:", error);
      res.status(500).json({ error: "Failed to fetch audit log" });
    }
  });

  // Search across stored intelligence (portable)
  app.get("/api/search", async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q) return res.json([]);
      const results = await storage.search(q, 80);
      res.json(results);
    } catch (error) {
      console.error("Error searching:", error);
      res.status(500).json({ error: "Failed to search" });
    }
  });

  // List all investigations
  app.get("/api/investigations", async (req, res) => {
    try {
      const investigations = await storage.listInvestigations();
      res.json(investigations);
    } catch (error) {
      console.error("Error fetching investigations:", error);
      res.status(500).json({ error: "Failed to fetch investigations" });
    }
  });

  // Get single investigation
  app.get("/api/investigations/:id", async (req, res) => {
    try {
      const investigation = await storage.getInvestigation(req.params.id);
      if (!investigation) {
        return res.status(404).json({ error: "Investigation not found" });
      }
      res.json(investigation);
    } catch (error) {
      console.error("Error fetching investigation:", error);
      res.status(500).json({ error: "Failed to fetch investigation" });
    }
  });

  // (moved below) export endpoint now archives after download in portable workflow

  // Create new investigation
  app.post("/api/investigations", async (req, res) => {
    try {
      // Default to "case" so the UI can send a freeform target description.
      const withDefaults = {
        ...req.body,
        targetType: req.body?.targetType ?? "case",
      };
      const validData = insertInvestigationSchema.parse(withDefaults);
      const investigation = await storage.createInvestigation(validData);
      await storage.createAuditEvent({
        action: "investigation.create",
        investigationId: investigation.id,
        summary: `Investigation created (${investigation.status})`,
        details: { title: investigation.title, targetType: investigation.targetType },
      });
      
      // Create initial system message
      await storage.createMessage({
        investigationId: investigation.id,
        role: "system",
        content: `Investigation "${investigation.title}" initialized. Target: ${investigation.target}. Kimi Agent online. Secure channel established.`,
        citations: [],
      });

      // Auto-run a thorough foundation collection in the background (up to ~5 minutes)
      // This writes a visible work-log as system messages (no chain-of-thought).
      setImmediate(async () => {
        try {
          await storage.createMessage({
            investigationId: investigation.id,
            role: "system",
            content: `[Activity] Foundation run started (thorough, up to 5 minutes).`,
            citations: [],
          });

          const result = await runSafeOsintCollection(
            { target: investigation.target, targetType: investigation.targetType },
            {
              depth: "thorough",
              timeBudgetMs: 300_000,
              onStep: async (s) => {
                await storage.createMessage({
                  investigationId: investigation.id,
                  role: "system",
                  content: `[Activity] ${s}`,
                  citations: [],
                });
              },
            },
          );

          for (const ev of result.evidence) {
            const hash = crypto.createHash("sha256").update(ev.content).digest("hex");
            await storage.createEvidence({
              investigationId: investigation.id,
              type: ev.type,
              title: ev.title,
              content: ev.content,
              source: ev.source,
              hash,
              tags: ev.tags ?? [],
              metadata: ev.metadata ?? {},
            } as any);
          }

          for (const ent of result.entities) {
            await storage.createEntity({
              investigationId: investigation.id,
              entityType: ent.entityType,
              value: ent.value,
              riskLevel: ent.riskLevel ?? "low",
              metadata: ent.metadata ?? {},
            } as any);
          }

          const confidencePct = Math.max(0, Math.min(100, Math.round(result.confidence * 100)));
          await storage.updateInvestigation(investigation.id, {
            confidence: confidencePct,
            phase: "Phase 2: Foundation",
            metadata: {
              ...(investigation.metadata ?? {}),
              lastRunAt: new Date().toISOString(),
              lastRunConfidence: result.confidence,
              foundationRun: true,
            },
          } as any);

          await storage.createAuditEvent({
            action: "investigation.run",
            investigationId: investigation.id,
            summary: "Foundation run completed",
            details: { confidence: result.confidence, evidenceAdded: result.evidence.length, entitiesAdded: result.entities.length },
          });

          await storage.createMessage({
            investigationId: investigation.id,
            role: "system",
            content: `[Activity] Foundation run finished. Confidence: ${confidencePct}%. Evidence: ${result.evidence.length}, Entities: ${result.entities.length}.`,
            citations: [],
          });

          // Post a final "Intelligence Board" summary for easy review
          const evidenceList = await storage.getEvidenceByInvestigation(investigation.id);
          const entitiesList = await storage.getEntitiesByInvestigation(investigation.id);
          const invAfter = (await storage.getInvestigation(investigation.id)) ?? investigation;
          await storage.createMessage({
            investigationId: investigation.id,
            role: "system",
            content: buildIntelligenceBoardMarkdown({
              investigation: invAfter,
              evidence: evidenceList,
              entities: entitiesList,
            }),
            citations: [],
          });
        } catch (e) {
          console.error("Foundation run error:", e);
          await storage.createMessage({
            investigationId: investigation.id,
            role: "system",
            content: `[Activity] Foundation run failed: ${String((e as any)?.message ?? e)}`,
            citations: [],
          });
        }
      });
      
      res.status(201).json(investigation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error creating investigation:", error);
      res.status(500).json({ error: "Failed to create investigation" });
    }
  });

  // Update investigation (status/title/metadata)
  app.patch("/api/investigations/:id", async (req, res) => {
    try {
      const investigationId = req.params.id;
      const existing = await storage.getInvestigation(investigationId);
      if (!existing) return res.status(404).json({ error: "Investigation not found" });

      const allowed: any = {};
      if (typeof req.body?.status === "string") allowed.status = req.body.status;
      if (typeof req.body?.title === "string") allowed.title = req.body.title;
      if (typeof req.body?.phase === "string") allowed.phase = req.body.phase;
      if (typeof req.body?.metadata === "object") allowed.metadata = req.body.metadata;

      const updated = await storage.updateInvestigation(investigationId, allowed);
      res.json(updated);
    } catch (error) {
      console.error("Error updating investigation:", error);
      res.status(500).json({ error: "Failed to update investigation" });
    }
  });

  // Delete investigation (portable)
  app.delete("/api/investigations/:id", async (req, res) => {
    try {
      const ok = await storage.deleteInvestigation(req.params.id);
      if (!ok) return res.status(404).json({ error: "Investigation not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting investigation:", error);
      res.status(500).json({ error: "Failed to delete investigation" });
    }
  });

  // Get messages for investigation
  app.get("/api/investigations/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getMessagesByInvestigation(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Send message to agent (chat)
  app.post("/api/investigations/:id/chat", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }

      const investigationId = req.params.id;
      
      // Verify investigation exists
      const investigation = await storage.getInvestigation(investigationId);
      if (!investigation) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      // Save user message
      const userMessage = await storage.createMessage({
        investigationId,
        role: "user",
        content: message,
        citations: [],
      });

      // Get evidence for context
      const evidenceList = await storage.getEvidenceByInvestigation(investigationId);
      const evidenceSummaries = evidenceList.slice(0, 5).map(e => `${e.source}: ${e.title}`);

      // Get AI response from Kimi K2
      let agentContent: string;
      try {
        agentContent = await kimiClient.generateOSINTResponse(message, {
          target: investigation.target,
          targetType: investigation.targetType,
          phase: investigation.phase,
          confidence: investigation.confidence,
          existingEvidence: evidenceSummaries,
        });
      } catch (error) {
        console.error('Kimi API error:', error);
        // Local fallback: evidence-based answer + confidence (no hallucinations)
        const allEvidence = await storage.getEvidenceByInvestigation(investigationId);
        const allEntities = await storage.getEntitiesByInvestigation(investigationId);
        const local = await localAnswerFromEvidence({
          question: message,
          investigation,
          evidence: allEvidence,
          entities: allEntities,
        });
        agentContent = local.answerMarkdown;
      }
      
      const agentMessage = await storage.createMessage({
        investigationId,
        role: "agent",
        content: agentContent,
        // If we used local evidence answering, embed citations if any were included in the response.
        citations: [],
      });

      res.json({ userMessage, agentMessage });
    } catch (error) {
      console.error("Error in chat:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Run safe OSINT collection (public sources only) and store as evidence/entities
  app.post("/api/investigations/:id/run", async (req, res) => {
    try {
      const investigationId = req.params.id;
      const investigation = await storage.getInvestigation(investigationId);
      if (!investigation) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      await storage.createMessage({
        investigationId,
        role: "system",
        content: `Collection started (public OSINT only) for target: ${investigation.target}`,
        citations: [],
      });

      const depth = req.body?.depth === "thorough" ? "thorough" : "normal";
      const result = await runSafeOsintCollection(
        { target: investigation.target, targetType: investigation.targetType },
        {
          depth,
          timeBudgetMs: depth === "thorough" ? 300_000 : 90_000,
          onStep: async (s) => {
            await storage.createMessage({
              investigationId,
              role: "system",
              content: `[Activity] ${s}`,
              citations: [],
            });
          },
        },
      );

      await storage.createAuditEvent({
        action: "investigation.run",
        investigationId,
        summary: "Collection run executed",
        details: { targetType: investigation.targetType },
      });

      // Store evidence
      for (const ev of result.evidence) {
        const hash = crypto.createHash("sha256").update(ev.content).digest("hex");
        await storage.createEvidence({
          investigationId,
          type: ev.type,
          title: ev.title,
          content: ev.content,
          source: ev.source,
          hash,
          tags: ev.tags ?? [],
          metadata: ev.metadata ?? {},
        } as any);
      }

      // Store entities
      for (const ent of result.entities) {
        await storage.createEntity({
          investigationId,
          entityType: ent.entityType,
          value: ent.value,
          riskLevel: ent.riskLevel ?? "low",
          metadata: ent.metadata ?? {},
        } as any);
      }

      // Update investigation counters / risk
      const nextConfidence = Math.max(0, Math.min(100, Math.round(result.confidence * 100)));
      await storage.updateInvestigation(investigationId, {
        confidence: nextConfidence,
        phase: `Phase 2: Collection`,
        metadata: {
          ...(investigation.metadata ?? {}),
          lastRunAt: new Date().toISOString(),
          lastRunConfidence: result.confidence,
        },
      } as any);

      await storage.createMessage({
        investigationId,
        role: "system",
        content: `Collection finished. Evidence: ${result.evidence.length}, Entities: ${result.entities.length}.`,
        citations: [],
      });

      // Post a fresh "Intelligence Board" after the run
      const evidenceList = await storage.getEvidenceByInvestigation(investigationId);
      const entitiesList = await storage.getEntitiesByInvestigation(investigationId);
      const invAfter = (await storage.getInvestigation(investigationId)) ?? investigation;
      await storage.createMessage({
        investigationId,
        role: "system",
        content: buildIntelligenceBoardMarkdown({
          investigation: invAfter,
          evidence: evidenceList,
          entities: entitiesList,
        }),
        citations: [],
      });

      res.json({
        ok: true,
        evidenceAdded: result.evidence.length,
        entitiesAdded: result.entities.length,
        confidence: result.confidence,
      });
    } catch (error) {
      console.error("Error running collection:", error);
      res.status(500).json({ error: "Failed to run collection" });
    }
  });

  // Export a portable case file (JSON) and archive the case (no longer "active")
  app.get("/api/investigations/:id/export", async (req, res) => {
    try {
      const investigationId = req.params.id;
      const investigation = await storage.getInvestigation(investigationId);
      if (!investigation) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      const [messages, evidenceList, entities, timeline] = await Promise.all([
        storage.getMessagesByInvestigation(investigationId),
        storage.getEvidenceByInvestigation(investigationId),
        storage.getEntitiesByInvestigation(investigationId),
        storage.getTimelineByInvestigation(investigationId),
      ]);

      const bundle = buildCaseFileV1({
        investigation,
        messages,
        evidence: evidenceList,
        entities,
        timeline,
      });

      // Archive after export (portable workflow)
      await storage.updateInvestigation(investigationId, { status: "archived" } as any);
      await storage.createAuditEvent({
        action: "investigation.export",
        investigationId,
        summary: "Case exported (archived)",
      });

      const safeTitle = (investigation.title || "investigation")
        .replace(/[^a-z0-9\-_ ]/gi, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 80);
      const fileName = `karma_case_${safeTitle || investigation.id}_${investigationId.slice(0, 8)}.json`;

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(JSON.stringify(bundle, null, 2));
    } catch (error) {
      console.error("Error exporting case file:", error);
      res.status(500).json({ error: "Failed to export case file" });
    }
  });

  // Get evidence for investigation
  app.get("/api/investigations/:id/evidence", async (req, res) => {
    try {
      const evidenceList = await storage.getEvidenceByInvestigation(req.params.id);
      res.json(evidenceList);
    } catch (error) {
      console.error("Error fetching evidence:", error);
      res.status(500).json({ error: "Failed to fetch evidence" });
    }
  });

  // Add evidence to investigation
  app.post("/api/investigations/:id/evidence", async (req, res) => {
    try {
      const validData = insertEvidenceSchema.parse({
        ...req.body,
        investigationId: req.params.id,
      });
      
      // Generate hash for integrity
      const hash = crypto.createHash('sha256').update(validData.content).digest('hex');
      
      const evidenceItem = await storage.createEvidence({
        ...validData,
        hash,
      });
      
      res.status(201).json(evidenceItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error creating evidence:", error);
      res.status(500).json({ error: "Failed to create evidence" });
    }
  });

  // Add investigator-provided fact (stored as evidence). Intended for authorized facts the investigator already has.
  app.post("/api/investigations/:id/facts", async (req, res) => {
    try {
      const investigationId = req.params.id;
      const investigation = await storage.getInvestigation(investigationId);
      if (!investigation) return res.status(404).json({ error: "Investigation not found" });

      const relation = String(req.body?.relation ?? "").trim(); // e.g., "mother"
      const name = String(req.body?.name ?? "").trim();
      const authorized = Boolean(req.body?.authorized ?? true);
      if (!relation || !name) return res.status(400).json({ error: "relation and name are required" });

      const content = JSON.stringify({ relation: relation.toLowerCase(), name, authorized }, null, 2);
      const hash = crypto.createHash("sha256").update(content).digest("hex");

      const ev = await storage.createEvidence({
        investigationId,
        type: "json",
        title: `Provided fact: ${relation}`,
        content,
        source: "User Provided",
        hash,
        tags: ["provided", "relationship"],
        metadata: { confidence: authorized ? 0.85 : 0.5, authorized },
      } as any);

      await storage.createMessage({
        investigationId,
        role: "system",
        content: `[Activity] Added provided fact (${relation}): ${name}`,
        citations: [ev.id],
      });

      res.status(201).json(ev);
    } catch (error) {
      console.error("Error adding fact:", error);
      res.status(500).json({ error: "Failed to add fact" });
    }
  });

  // Get entities (graph data)
  app.get("/api/investigations/:id/entities", async (req, res) => {
    try {
      const entities = await storage.getEntitiesByInvestigation(req.params.id);
      res.json(entities);
    } catch (error) {
      console.error("Error fetching entities:", error);
      res.status(500).json({ error: "Failed to fetch entities" });
    }
  });

  // Get timeline events
  app.get("/api/investigations/:id/timeline", async (req, res) => {
    try {
      const events = await storage.getTimelineByInvestigation(req.params.id);
      res.json(events);
    } catch (error) {
      console.error("Error fetching timeline:", error);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });

  return httpServer;
}
