import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Investigations
export const investigations = pgTable("investigations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  target: text("target").notNull(),
  targetType: text("target_type").notNull(), // 'domain', 'email', 'username'
  status: text("status").notNull().default('active'), // 'active', 'archived', 'critical'
  phase: text("phase").notNull().default('Phase 1: Enrichment'),
  riskScore: integer("risk_score").notNull().default(0),
  totalTasks: integer("total_tasks").notNull().default(0),
  completedTasks: integer("completed_tasks").notNull().default(0),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`), // Additional flexible data
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInvestigationSchema = createInsertSchema(investigations).omit({
  id: true,
  createdAt: true,
});

export type Investigation = typeof investigations.$inferSelect;
export type InsertInvestigation = z.infer<typeof insertInvestigationSchema>;

// Chat Messages
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investigationId: varchar("investigation_id").notNull().references(() => investigations.id, { onDelete: 'cascade' }),
  role: text("role").notNull(), // 'user', 'agent', 'system'
  content: text("content").notNull(),
  citations: jsonb("citations").default(sql`'[]'::jsonb`), // Array of evidence IDs
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Evidence
export const evidence = pgTable("evidence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investigationId: varchar("investigation_id").notNull().references(() => investigations.id, { onDelete: 'cascade' }),
  type: text("type").notNull(), // 'image', 'text', 'html', 'network', 'json'
  title: text("title").notNull(),
  content: text("content").notNull(), // Actual data or path to file
  source: text("source").notNull(), // 'Shodan', 'Whois', 'GitHub', etc.
  hash: text("hash").notNull(), // SHA-256 hash for integrity
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEvidenceSchema = createInsertSchema(evidence).omit({
  id: true,
  createdAt: true,
});

export type Evidence = typeof evidence.$inferSelect;
export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;

// Entities (for graph)
export const entities = pgTable("entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investigationId: varchar("investigation_id").notNull().references(() => investigations.id, { onDelete: 'cascade' }),
  entityType: text("entity_type").notNull(), // 'ip', 'domain', 'email', 'person', 'org'
  value: text("value").notNull(),
  riskLevel: text("risk_level").notNull().default('low'), // 'low', 'medium', 'high', 'critical'
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEntitySchema = createInsertSchema(entities).omit({
  id: true,
  createdAt: true,
});

export type Entity = typeof entities.$inferSelect;
export type InsertEntity = z.infer<typeof insertEntitySchema>;

// Timeline Events
export const timelineEvents = pgTable("timeline_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investigationId: varchar("investigation_id").notNull().references(() => investigations.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  eventDate: timestamp("event_date").notNull(),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTimelineEventSchema = createInsertSchema(timelineEvents).omit({
  id: true,
  createdAt: true,
});

export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type InsertTimelineEvent = z.infer<typeof insertTimelineEventSchema>;

// Investigation Tasks (job queue backing store)
export const investigationTasks = pgTable("investigation_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investigationId: varchar("investigation_id")
    .notNull()
    .references(() => investigations.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'connector', 'analysis', 'report', 'custom'
  phase: text("phase").notNull(), // 'Phase 1: Enrichment', ...
  status: text("status").notNull().default("queued"), // 'queued' | 'running' | 'completed' | 'failed'
  payload: jsonb("payload").default(sql`'{}'::jsonb`),
  result: jsonb("result").default(sql`'{}'::jsonb`),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertInvestigationTaskSchema = createInsertSchema(investigationTasks).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

export type InvestigationTask = typeof investigationTasks.$inferSelect;
export type InsertInvestigationTask = z.infer<typeof insertInvestigationTaskSchema>;

// Audit Logs (security + compliance trail)
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investigationId: varchar("investigation_id").references(() => investigations.id, { onDelete: "set null" }),
  action: text("action").notNull(), // e.g. 'investigation.create', 'agent.message', 'evidence.add'
  actor: text("actor").notNull().default("system"), // 'system' | user id/identifier
  ip: text("ip"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
