import { db } from "./db";
import { 
  investigations, 
  messages, 
  evidence, 
  entities,
  timelineEvents,
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
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Investigations
  createInvestigation(data: InsertInvestigation): Promise<Investigation>;
  getInvestigation(id: string): Promise<Investigation | undefined>;
  listInvestigations(): Promise<Investigation[]>;
  updateInvestigation(id: string, data: Partial<InsertInvestigation>): Promise<Investigation | undefined>;
  
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
}

export class DatabaseStorage implements IStorage {
  // Investigations
  async createInvestigation(data: InsertInvestigation): Promise<Investigation> {
    const [investigation] = await db.insert(investigations).values(data).returning();
    return investigation;
  }

  async getInvestigation(id: string): Promise<Investigation | undefined> {
    const [investigation] = await db.select().from(investigations).where(eq(investigations.id, id));
    return investigation;
  }

  async listInvestigations(): Promise<Investigation[]> {
    return db.select().from(investigations).orderBy(desc(investigations.createdAt));
  }

  async updateInvestigation(id: string, data: Partial<InsertInvestigation>): Promise<Investigation | undefined> {
    const [updated] = await db.update(investigations).set(data).where(eq(investigations.id, id)).returning();
    return updated;
  }

  // Messages
  async createMessage(data: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }

  async getMessagesByInvestigation(investigationId: string): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.investigationId, investigationId)).orderBy(messages.createdAt);
  }

  // Evidence
  async createEvidence(data: InsertEvidence): Promise<Evidence> {
    const [item] = await db.insert(evidence).values(data).returning();
    return item;
  }

  async getEvidenceByInvestigation(investigationId: string): Promise<Evidence[]> {
    return db.select().from(evidence).where(eq(evidence.investigationId, investigationId)).orderBy(desc(evidence.createdAt));
  }

  // Entities
  async createEntity(data: InsertEntity): Promise<Entity> {
    const [entity] = await db.insert(entities).values(data).returning();
    return entity;
  }

  async getEntitiesByInvestigation(investigationId: string): Promise<Entity[]> {
    return db.select().from(entities).where(eq(entities.investigationId, investigationId));
  }

  // Timeline
  async createTimelineEvent(data: InsertTimelineEvent): Promise<TimelineEvent> {
    const [event] = await db.insert(timelineEvents).values(data).returning();
    return event;
  }

  async getTimelineByInvestigation(investigationId: string): Promise<TimelineEvent[]> {
    return db.select().from(timelineEvents).where(eq(timelineEvents.investigationId, investigationId)).orderBy(timelineEvents.eventDate);
  }
}

export const storage = new DatabaseStorage();
