import { 
  type Investigation, 
  type InsertInvestigation,
  type Message,
  type InsertMessage,
  type Evidence,
  type InsertEvidence,
  type Entity,
  type InsertEntity,
  type TimelineEvent,
  type InsertTimelineEvent,
} from "@shared/schema";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export type AuditEvent = {
  id: string;
  ts: Date;
  action:
    | "investigation.create"
    | "investigation.update"
    | "investigation.delete"
    | "investigation.run"
    | "investigation.export"
    | "message.create"
    | "evidence.create"
    | "entity.create"
    | "timeline.create";
  investigationId?: string;
  summary: string;
  details?: Record<string, any>;
};

export type SearchResult = {
  kind: "investigation" | "message" | "evidence" | "entity" | "timeline";
  investigationId: string;
  id: string;
  title: string;
  snippet?: string;
};

export interface IStorage {
  // Investigations
  createInvestigation(data: InsertInvestigation): Promise<Investigation>;
  getInvestigation(id: string): Promise<Investigation | undefined>;
  listInvestigations(): Promise<Investigation[]>;
  updateInvestigation(id: string, data: Partial<InsertInvestigation>): Promise<Investigation | undefined>;
  deleteInvestigation(id: string): Promise<boolean>;
  
  // Messages
  createMessage(data: InsertMessage): Promise<Message>;
  getMessagesByInvestigation(investigationId: string): Promise<Message[]>;
  
  // Evidence
  createEvidence(data: InsertEvidence): Promise<Evidence>;
  getEvidenceByInvestigation(investigationId: string): Promise<Evidence[]>;
  
  // Entities
  createEntity(data: InsertEntity): Promise<Entity>;
  getEntitiesByInvestigation(investigationId: string): Promise<Entity[]>;
  
  // Timeline
  createTimelineEvent(data: InsertTimelineEvent): Promise<TimelineEvent>;
  getTimelineByInvestigation(investigationId: string): Promise<TimelineEvent[]>;

  // Audit
  createAuditEvent(event: Omit<AuditEvent, "id" | "ts"> & { id?: string; ts?: Date }): Promise<AuditEvent>;
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;

  // Search
  search(query: string, limit?: number): Promise<SearchResult[]>;
}

class MemoryStorage implements IStorage {
  protected investigations = new Map<string, Investigation>();
  protected messages: Message[] = [];
  protected evidence: Evidence[] = [];
  protected entities: Entity[] = [];
  protected timeline: TimelineEvent[] = [];
  protected audit: AuditEvent[] = [];

  async createInvestigation(data: InsertInvestigation): Promise<Investigation> {
    const now = new Date();
    const inv: Investigation = {
      id: crypto.randomUUID(),
      title: data.title,
      target: data.target,
      targetType: (data as any).targetType ?? "case",
      status: (data as any).status ?? "active",
      phase: (data as any).phase ?? "Phase 1: Enrichment",
      confidence: (data as any).confidence ?? 0,
      totalTasks: (data as any).totalTasks ?? 0,
      completedTasks: (data as any).completedTasks ?? 0,
      metadata: (data as any).metadata ?? {},
      createdAt: now,
    };
    this.investigations.set(inv.id, inv);
    return inv;
  }

  async getInvestigation(id: string): Promise<Investigation | undefined> {
    return this.investigations.get(id);
  }

  async listInvestigations(): Promise<Investigation[]> {
    return Array.from(this.investigations.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async updateInvestigation(id: string, data: Partial<InsertInvestigation>): Promise<Investigation | undefined> {
    const existing = this.investigations.get(id);
    if (!existing) return undefined;
    const updated: Investigation = {
      ...existing,
      ...(data as any),
    };
    this.investigations.set(id, updated);
    await this.createAuditEvent({
      action: "investigation.update",
      investigationId: id,
      summary: "Investigation updated",
      details: { updates: data },
    });
    return updated;
  }

  async deleteInvestigation(id: string): Promise<boolean> {
    const exists = this.investigations.has(id);
    if (!exists) return false;
    this.investigations.delete(id);
    this.messages = this.messages.filter((m) => m.investigationId !== id);
    this.evidence = this.evidence.filter((e) => e.investigationId !== id);
    this.entities = this.entities.filter((e) => e.investigationId !== id);
    this.timeline = this.timeline.filter((t) => t.investigationId !== id);
    await this.createAuditEvent({
      action: "investigation.delete",
      investigationId: id,
      summary: "Investigation deleted",
    });
    return true;
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const msg: Message = {
      id: crypto.randomUUID(),
      investigationId: data.investigationId,
      role: data.role,
      content: data.content,
      citations: (data as any).citations ?? [],
      createdAt: new Date(),
    };
    this.messages.push(msg);
    await this.createAuditEvent({
      action: "message.create",
      investigationId: data.investigationId,
      summary: `Message created (${data.role})`,
    });
    return msg;
  }

  async getMessagesByInvestigation(investigationId: string): Promise<Message[]> {
    return this.messages
      .filter((m) => m.investigationId === investigationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createEvidence(data: InsertEvidence): Promise<Evidence> {
    const item: Evidence = {
      id: crypto.randomUUID(),
      investigationId: data.investigationId,
      type: data.type,
      title: data.title,
      content: data.content,
      source: data.source,
      hash: data.hash,
      tags: (data as any).tags ?? [],
      metadata: (data as any).metadata ?? {},
      createdAt: new Date(),
    };
    this.evidence.push(item);
    await this.createAuditEvent({
      action: "evidence.create",
      investigationId: data.investigationId,
      summary: `Evidence added (${data.source})`,
      details: { title: data.title, source: data.source },
    });
    return item;
  }

  async getEvidenceByInvestigation(investigationId: string): Promise<Evidence[]> {
    return this.evidence
      .filter((e) => e.investigationId === investigationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createEntity(data: InsertEntity): Promise<Entity> {
    const ent: Entity = {
      id: crypto.randomUUID(),
      investigationId: data.investigationId,
      entityType: data.entityType,
      value: data.value,
      riskLevel: (data as any).riskLevel ?? "low",
      metadata: (data as any).metadata ?? {},
      createdAt: new Date(),
    };
    this.entities.push(ent);
    await this.createAuditEvent({
      action: "entity.create",
      investigationId: data.investigationId,
      summary: `Entity added (${data.entityType})`,
      details: { entityType: data.entityType, value: data.value },
    });
    return ent;
  }

  async getEntitiesByInvestigation(investigationId: string): Promise<Entity[]> {
    return this.entities.filter((e) => e.investigationId === investigationId);
  }

  async createTimelineEvent(data: InsertTimelineEvent): Promise<TimelineEvent> {
    const event: TimelineEvent = {
      id: crypto.randomUUID(),
      investigationId: data.investigationId,
      title: data.title,
      description: data.description,
      eventDate: data.eventDate,
      tags: (data as any).tags ?? [],
      createdAt: new Date(),
    };
    this.timeline.push(event);
    await this.createAuditEvent({
      action: "timeline.create",
      investigationId: data.investigationId,
      summary: `Timeline event added`,
      details: { title: data.title },
    });
    return event;
  }

  async getTimelineByInvestigation(investigationId: string): Promise<TimelineEvent[]> {
    return this.timeline
      .filter((e) => e.investigationId === investigationId)
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
  }

  async createAuditEvent(event: Omit<AuditEvent, "id" | "ts"> & { id?: string; ts?: Date }): Promise<AuditEvent> {
    const e: AuditEvent = {
      id: event.id ?? crypto.randomUUID(),
      ts: event.ts ?? new Date(),
      action: event.action,
      investigationId: event.investigationId,
      summary: event.summary,
      details: event.details ?? {},
    };
    this.audit.push(e);
    return e;
  }

  async listAuditEvents(limit = 200): Promise<AuditEvent[]> {
    return this.audit
      .slice()
      .sort((a, b) => b.ts.getTime() - a.ts.getTime())
      .slice(0, limit);
  }

  async search(query: string, limit = 50): Promise<SearchResult[]> {
    const q = (query || "").trim().toLowerCase();
    if (!q) return [];

    const results: SearchResult[] = [];
    const push = (r: SearchResult) => {
      if (results.length >= limit) return;
      results.push(r);
    };

    for (const inv of Array.from(this.investigations.values())) {
      const hay = `${inv.title}\n${inv.target}\n${inv.targetType}\n${inv.status}`.toLowerCase();
      if (hay.includes(q)) {
        push({ kind: "investigation", investigationId: inv.id, id: inv.id, title: inv.title, snippet: inv.target });
      }
    }

    for (const m of this.messages) {
      if (results.length >= limit) break;
      if (m.content.toLowerCase().includes(q)) {
        push({ kind: "message", investigationId: m.investigationId, id: m.id, title: `Message (${m.role})`, snippet: m.content.slice(0, 160) });
      }
    }

    for (const e of this.evidence) {
      if (results.length >= limit) break;
      const hay = `${e.title}\n${e.source}\n${e.content}`.toLowerCase();
      if (hay.includes(q)) {
        push({ kind: "evidence", investigationId: e.investigationId, id: e.id, title: `${e.source}: ${e.title}`, snippet: e.content.slice(0, 160) });
      }
    }

    for (const ent of this.entities) {
      if (results.length >= limit) break;
      const hay = `${ent.entityType}\n${ent.value}`.toLowerCase();
      if (hay.includes(q)) {
        push({ kind: "entity", investigationId: ent.investigationId, id: ent.id, title: `${ent.entityType}: ${ent.value}`, snippet: ent.riskLevel });
      }
    }

    for (const t of this.timeline) {
      if (results.length >= limit) break;
      const hay = `${t.title}\n${t.description}`.toLowerCase();
      if (hay.includes(q)) {
        push({ kind: "timeline", investigationId: t.investigationId, id: t.id, title: `Timeline: ${t.title}`, snippet: t.description.slice(0, 160) });
      }
    }

    return results;
  }
}

type PortableSnapshot = {
  investigations: Investigation[];
  messages: Message[];
  evidence: Evidence[];
  entities: Entity[];
  timeline: TimelineEvent[];
  audit?: any[];
};

class PortableFileStorage extends MemoryStorage {
  private dataFile: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    const defaultPath = path.resolve(process.cwd(), "data", "karma-osint.json");
    this.dataFile = path.resolve(process.env.KARMA_OSINT_DATA_FILE || defaultPath);
    this.loadFromDisk();
  }

  private ensureDir() {
    const dir = path.dirname(this.dataFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private reviveDates(snapshot: PortableSnapshot): PortableSnapshot {
    const revive = <T extends { createdAt: any }>(items: T[]): T[] =>
      items.map((i) => ({
        ...i,
        createdAt: i.createdAt ? new Date(i.createdAt) : new Date(),
      }));

    const reviveTimeline = (items: any[]) =>
      items.map((i) => ({
        ...i,
        createdAt: i.createdAt ? new Date(i.createdAt) : new Date(),
        eventDate: i.eventDate ? new Date(i.eventDate) : new Date(),
      }));

    return {
      investigations: revive(snapshot.investigations || []),
      messages: revive(snapshot.messages || []),
      evidence: revive(snapshot.evidence || []),
      entities: revive(snapshot.entities || []),
      timeline: reviveTimeline(snapshot.timeline || []),
      audit: (snapshot.audit || []).map((a: any) => ({
        ...a,
        ts: a.ts ? new Date(a.ts) : new Date(),
      })),
    };
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(this.dataFile)) return;
      const raw = fs.readFileSync(this.dataFile, "utf-8");
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw) as PortableSnapshot;
      const snap = this.reviveDates(parsed);

      this.investigations = new Map(snap.investigations.map((i) => [i.id, i]));
      this.messages = snap.messages;
      this.evidence = snap.evidence;
      this.entities = snap.entities;
      this.timeline = snap.timeline;
      this.audit = (snap.audit as any) ?? [];
    } catch (e) {
      console.warn("[storage] Failed to load portable datastore; starting fresh:", e);
    }
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveToDisk();
    }, 250);
  }

  private saveToDisk() {
    try {
      this.ensureDir();
      const snapshot: PortableSnapshot = {
        investigations: Array.from(this.investigations.values()),
        messages: this.messages,
        evidence: this.evidence,
        entities: this.entities,
        timeline: this.timeline,
        audit: this.audit,
      };
      fs.writeFileSync(this.dataFile, JSON.stringify(snapshot, null, 2), "utf-8");
    } catch (e) {
      console.warn("[storage] Failed to write portable datastore:", e);
    }
  }

  override async createInvestigation(data: InsertInvestigation): Promise<Investigation> {
    const inv = await super.createInvestigation(data);
    this.scheduleSave();
    return inv;
  }

  override async updateInvestigation(id: string, data: Partial<InsertInvestigation>): Promise<Investigation | undefined> {
    const inv = await super.updateInvestigation(id, data);
    this.scheduleSave();
    return inv;
  }

  override async createMessage(data: InsertMessage): Promise<Message> {
    const msg = await super.createMessage(data);
    this.scheduleSave();
    return msg;
  }

  override async createEvidence(data: InsertEvidence): Promise<Evidence> {
    const ev = await super.createEvidence(data);
    this.scheduleSave();
    return ev;
  }

  override async createEntity(data: InsertEntity): Promise<Entity> {
    const ent = await super.createEntity(data);
    this.scheduleSave();
    return ent;
  }

  override async createTimelineEvent(data: InsertTimelineEvent): Promise<TimelineEvent> {
    const ev = await super.createTimelineEvent(data);
    this.scheduleSave();
    return ev;
  }

  override async deleteInvestigation(id: string): Promise<boolean> {
    const ok = await super.deleteInvestigation(id);
    this.scheduleSave();
    return ok;
  }

  override async createAuditEvent(event: Omit<AuditEvent, "id" | "ts"> & { id?: string; ts?: Date }): Promise<AuditEvent> {
    const e = await super.createAuditEvent(event);
    this.scheduleSave();
    return e;
  }
}

// Portable-only storage (USB-friendly)
export const storage: IStorage = new PortableFileStorage();
