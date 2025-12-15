import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertInvestigationSchema, insertEvidenceSchema } from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";
import { kimiClient } from "./lib/kimi";
import { listConnectors, getConnector, normalizeTargetType } from "./connectors";
import { enqueueTask } from "./jobs/queue";
import { publish } from "./realtime/bus";

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Optional operator API key gate for write endpoints (set ADMIN_API_KEY to enable).
  app.use("/api", (req, res, next) => {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) return next();

    const isWrite = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
    if (!isWrite) return next();

    const provided = String(req.header("x-api-key") ?? "");
    if (provided && provided.length === adminKey.length) {
      try {
        if (crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(adminKey))) return next();
      } catch {
        // ignore
      }
    }

    return res.status(401).json({ error: "Unauthorized" });
  });

  async function audit(req: Request, action: string, opts?: { investigationId?: string; metadata?: any; actor?: string }) {
    try {
      await storage.createAuditLog({
        investigationId: opts?.investigationId,
        action,
        actor: opts?.actor ?? "system",
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: opts?.metadata ?? {},
      });
    } catch (e) {
      // Never break primary flow due to audit logging failure.
      console.warn("Audit log failed:", e);
    }
  }

  async function handleChat(req: Request, res: Response, investigationId: string, message: string) {
    const investigation = await storage.getInvestigation(investigationId);
    if (!investigation) {
      return res.status(404).json({ error: "Investigation not found" });
    }

    const userMessage = await storage.createMessage({
      investigationId,
      role: "user",
      content: message,
      citations: [],
    });

    const evidenceList = await storage.getEvidenceByInvestigation(investigationId);
    const evidenceSummaries = evidenceList.slice(0, 5).map((e) => `${e.source}: ${e.title}`);

    let agentContent: string;
    try {
      if (!kimiClient) {
        return res.status(503).json({
          error: "Kimi K2 is not configured",
          details: "Set KIMI_API_KEY to enable agent responses.",
        });
      }

      // Stream chunks to WebSocket subscribers while building the final message.
      agentContent = "";
      const stream = kimiClient.generateOSINTResponseStream(message, {
        target: investigation.target,
        targetType: investigation.targetType,
        phase: investigation.phase,
        riskScore: investigation.riskScore,
        existingEvidence: evidenceSummaries,
      });
      for await (const chunk of stream) {
        agentContent += chunk;
        publish(investigationId, { type: "agent.chunk", payload: { chunk } });
      }
    } catch (error) {
      console.error("Kimi API error:", error);
      agentContent = "I apologize, but I'm experiencing technical difficulties connecting to my knowledge base. Please try again in a moment.";
    }

    const agentMessage = await storage.createMessage({
      investigationId,
      role: "agent",
      content: agentContent,
      citations: [],
    });

    await audit(req, "agent.message", {
      investigationId,
      metadata: { userMessageId: userMessage.id, agentMessageId: agentMessage.id },
    });

    publish(investigationId, { type: "message.new", payload: { userMessage, agentMessage } });

    return res.json({ userMessage, agentMessage });
  }

  // Health check
  app.get("/api/health", async (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      kimiConfigured: Boolean(process.env.KIMI_API_KEY),
    });
  });

  // List available connectors
  app.get("/api/connectors", async (_req, res) => {
    res.json(listConnectors());
  });

  // List all investigations
  app.get("/api/investigations", async (_req, res) => {
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

  // Create new investigation
  app.post("/api/investigations", async (req, res) => {
    try {
      const validData = insertInvestigationSchema.parse(req.body);
      const investigation = await storage.createInvestigation(validData);

      await storage.createMessage({
        investigationId: investigation.id,
        role: "system",
        content: `Investigation "${investigation.title}" initialized. Target: ${investigation.target}. Kimi K2 Agent online. Secure channel established.`,
        citations: [],
      });

      await audit(req, "investigation.create", {
        investigationId: investigation.id,
        metadata: { target: investigation.target, targetType: investigation.targetType },
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
      const { message } = req.body ?? {};
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }
      return await handleChat(req, res, req.params.id, message);
    } catch (error) {
      console.error("Error in chat:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Spec-compatible agent endpoint
  app.post("/api/agent/message", async (req, res) => {
    try {
      const { investigationId, message } = req.body ?? {};
      if (!investigationId || typeof investigationId !== "string") {
        return res.status(400).json({ error: "investigationId is required" });
      }
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "message is required" });
      }
      return await handleChat(req, res, investigationId, message);
    } catch (error) {
      console.error("Error in agent/message:", error);
      res.status(500).json({ error: "Failed to process message" });
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

      const hash = crypto.createHash("sha256").update(validData.content).digest("hex");

      const evidenceItem = await storage.createEvidence({
        ...validData,
        hash,
      });

      await audit(req, "evidence.add", {
        investigationId: req.params.id,
        metadata: { evidenceId: evidenceItem.id, source: evidenceItem.source, type: evidenceItem.type },
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

  // Create investigation task (queue)
  app.post("/api/investigations/:id/tasks", async (req, res) => {
    try {
      const investigationId = req.params.id;
      const investigation = await storage.getInvestigation(investigationId);
      if (!investigation) return res.status(404).json({ error: "Investigation not found" });

      const body = req.body ?? {};
      const type = String(body.type ?? "connector");
      const phase = String(body.phase ?? investigation.phase ?? "Phase 1: Enrichment");
      const payload = body.payload ?? {};

      if (type === "connector") {
        const connectorName = String(payload.connectorName ?? "");
        if (!connectorName) return res.status(400).json({ error: "payload.connectorName is required for connector tasks" });
        const connector = getConnector(connectorName as any);
        if (!connector) return res.status(400).json({ error: `Unknown connector: ${connectorName}` });

        payload.targetType = normalizeTargetType(payload.targetType ?? investigation.targetType);
        payload.input = String(payload.input ?? investigation.target);
      }

      const task = await storage.createTask({
        investigationId,
        type,
        phase,
        status: "queued",
        payload,
        result: {},
      } as any);

      await storage.updateInvestigation(investigationId, {
        totalTasks: (investigation.totalTasks ?? 0) + 1,
      });

      await audit(req, "task.create", {
        investigationId,
        metadata: { taskId: task.id, type, phase, payloadSummary: { connectorName: payload.connectorName } },
      });

      await enqueueTask(task.id);
      res.status(201).json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.get("/api/investigations/:id/tasks", async (req, res) => {
    try {
      const tasks = await storage.listTasksByInvestigation(req.params.id);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // Audit log endpoint
  app.get("/api/audit-log", async (req, res) => {
    try {
      const investigationId = typeof req.query.investigationId === "string" ? req.query.investigationId : undefined;
      const limit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
      const offset = typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : undefined;
      const logs = await storage.listAuditLogs({ investigationId, limit, offset });
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // Report endpoint (JSON by default; ?format=html)
  app.get("/api/investigations/:id/report", async (req, res) => {
    try {
      const investigationId = req.params.id;
      const investigation = await storage.getInvestigation(investigationId);
      if (!investigation) return res.status(404).json({ error: "Investigation not found" });

      const evidenceList = await storage.getEvidenceByInvestigation(investigationId);
      const entitiesList = await storage.getEntitiesByInvestigation(investigationId);
      const timeline = await storage.getTimelineByInvestigation(investigationId);
      const tasks = await storage.listTasksByInvestigation(investigationId);

      const report = {
        generatedAt: new Date().toISOString(),
        investigation,
        summary: {
          evidenceCount: evidenceList.length,
          entityCount: entitiesList.length,
          timelineCount: timeline.length,
          taskCount: tasks.length,
        },
        evidence: evidenceList,
        entities: entitiesList,
        timeline,
        tasks,
      };

      const format = typeof req.query.format === "string" ? req.query.format : "json";
      if (format === "html") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        const evidenceRows = evidenceList
          .slice(0, 50)
          .map((e) => {
            const created = escapeHtml(new Date(e.createdAt as any).toISOString());
            return `<tr><td>${created}</td><td>${escapeHtml(e.source)}</td><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.type)}</td><td><code>${escapeHtml(e.hash)}</code></td></tr>`;
          })
          .join("\n");

        const entityRows = entitiesList
          .slice(0, 200)
          .map((e) => `<tr><td>${escapeHtml(e.entityType)}</td><td>${escapeHtml(e.value)}</td><td>${escapeHtml(e.riskLevel)}</td></tr>`)
          .join("\n");

        const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Investigation Report</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 32px; }
    h1,h2 { margin: 0 0 8px 0; }
    .muted { color: #666; }
    pre { background: #f6f6f6; padding: 12px; overflow: auto; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ddd; padding: 8px; font-size: 12px; vertical-align: top; }
  </style>
</head>
<body>
  <h1>Intelligence Report</h1>
  <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>
  <h2>Case</h2>
  <pre>${escapeHtml(
    JSON.stringify(
      {
        id: investigation.id,
        title: investigation.title,
        target: investigation.target,
        targetType: investigation.targetType,
        phase: investigation.phase,
        riskScore: investigation.riskScore,
      },
      null,
      2,
    ),
  )}</pre>

  <h2>Summary</h2>
  <pre>${escapeHtml(JSON.stringify(report.summary, null, 2))}</pre>

  <h2>Evidence (latest)</h2>
  <table>
    <thead><tr><th>Created</th><th>Source</th><th>Title</th><th>Type</th><th>Hash</th></tr></thead>
    <tbody>
      ${evidenceRows}
    </tbody>
  </table>

  <h2>Entities</h2>
  <table>
    <thead><tr><th>Type</th><th>Value</th><th>Risk</th></tr></thead>
    <tbody>
      ${entityRows}
    </tbody>
  </table>

</body>
</html>`;

        return res.status(200).send(html);
      }

      res.json(report);
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  return httpServer;
}
