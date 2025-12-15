import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertInvestigationSchema, insertMessageSchema, insertEvidenceSchema } from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";
import { kimiClient } from "./lib/kimi";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check
  app.get("/api/health", async (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
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

  // Create new investigation
  app.post("/api/investigations", async (req, res) => {
    try {
      const validData = insertInvestigationSchema.parse(req.body);
      const investigation = await storage.createInvestigation(validData);
      
      // Create initial system message
      await storage.createMessage({
        investigationId: investigation.id,
        role: "system",
        content: `Investigation "${investigation.title}" initialized. Target: ${investigation.target}. Kimi K2 Agent online. Secure channel established.`,
        citations: [],
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
          riskScore: investigation.riskScore,
          existingEvidence: evidenceSummaries,
        });
      } catch (error) {
        console.error('Kimi API error:', error);
        // Fallback response if API fails
        agentContent = `I apologize, but I'm experiencing technical difficulties connecting to my knowledge base. Please try again in a moment.`;
      }
      
      const agentMessage = await storage.createMessage({
        investigationId,
        role: "agent",
        content: agentContent,
        citations: [],
      });

      res.json({ userMessage, agentMessage });
    } catch (error) {
      console.error("Error in chat:", error);
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
