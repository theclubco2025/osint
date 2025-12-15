import { storage } from "../storage";
import { getConnector, normalizeTargetType } from "../connectors";
import { storeEvidenceText } from "../evidence_store";
import { publish } from "../realtime/bus";

function now() {
  return new Date();
}

function extractEntities(text: string) {
  const entities: { entityType: string; value: string; riskLevel: string; metadata?: any }[] = [];

  const emails = new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []);
  for (const e of emails) entities.push({ entityType: "email", value: e.toLowerCase(), riskLevel: "low" });

  const ips = new Set(text.match(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g) ?? []);
  for (const ip of ips) entities.push({ entityType: "ip", value: ip, riskLevel: "medium" });

  const domains = new Set(text.match(/\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi) ?? []);
  for (const d of domains) entities.push({ entityType: "domain", value: d.toLowerCase(), riskLevel: "low" });

  const urls = new Set(text.match(/https?:\/\/[^\s)\]}]+/gi) ?? []);
  for (const u of urls) entities.push({ entityType: "url", value: u, riskLevel: "low" });

  return entities;
}

function computeRiskDelta(evidenceDraft: { source: string; tags?: string[]; metadata?: any }) {
  const source = evidenceDraft.source.toLowerCase();
  const tags = new Set((evidenceDraft.tags ?? []).map((t) => t.toLowerCase()));

  let delta = 0;
  if (source.includes("haveibeenpwned") || tags.has("breach")) {
    if (evidenceDraft.metadata?.breached) delta += 40;
  }
  if (source.includes("shodan")) delta += 15;
  if (tags.has("ports")) delta += 10;
  if (tags.has("blocked") || tags.has("robots")) delta += 0;

  return delta;
}

const running = new Set<string>();
const pending: string[] = [];
let pumpScheduled = false;

function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  setImmediate(async () => {
    pumpScheduled = false;
    const next = pending.shift();
    if (!next) return;
    try {
      await runTask(next);
    } finally {
      schedulePump();
    }
  });
}

export async function enqueueTask(taskId: string) {
  if (running.has(taskId)) return;
  pending.push(taskId);
  schedulePump();
}

export async function runTask(taskId: string) {
  if (running.has(taskId)) return;
  running.add(taskId);

  const task = await storage.getTask(taskId);
  if (!task) {
    running.delete(taskId);
    return;
  }

  if (task.status !== "queued") {
    running.delete(taskId);
    return;
  }

  await storage.updateTask(taskId, { status: "running", startedAt: now() });
  publish(task.investigationId, { type: "task.update", payload: { id: taskId, status: "running" } });

  try {
    const investigation = await storage.getInvestigation(task.investigationId);
    if (!investigation) throw new Error("Investigation not found");

    const payload = (task.payload ?? {}) as any;

    if (task.type === "connector") {
      const connectorName = payload.connectorName as any;
      const connector = getConnector(connectorName);
      if (!connector) throw new Error(`Unknown connector: ${connectorName}`);

      const targetType = normalizeTargetType(payload.targetType ?? investigation.targetType);
      const input = String(payload.input ?? investigation.target);

      const result = await connector.run({
        investigation,
        input,
        targetType,
        options: payload.options ?? {},
      });

      let riskDelta = 0;
      for (const ev of result.evidence) {
        // Store (and sanitize if needed) and keep pointer.
        const stored = await storeEvidenceText({
          investigationId: investigation.id,
          type: ev.type,
          content: ev.content,
          filenameHint: `${connector.name}-${ev.title}`,
        });

        const evidenceItem = await storage.createEvidence({
          investigationId: investigation.id,
          type: ev.type,
          title: ev.title,
          content: stored.storedPath,
          source: ev.source,
          hash: stored.hash,
          tags: ev.tags ?? [],
          metadata: {
            ...(ev.metadata ?? {}),
            storedPath: stored.storedPath,
            stored: true,
            sanitized: stored.sanitized,
            sizeBytes: stored.sizeBytes,
          },
        });

        // Entity extraction from saved content (best-effort for now).
        const entities = extractEntities(ev.content);
        const existing = await storage.getEntitiesByInvestigation(investigation.id);
        const existingKey = new Set(existing.map((e) => `${e.entityType}:${e.value}`));
        for (const ent of entities) {
          const k = `${ent.entityType}:${ent.value}`;
          if (existingKey.has(k)) continue;
          existingKey.add(k);
          await storage.createEntity({
            investigationId: investigation.id,
            entityType: ent.entityType,
            value: ent.value,
            riskLevel: ent.riskLevel,
            metadata: { fromEvidenceId: evidenceItem.id },
          } as any);
        }

        riskDelta += computeRiskDelta(ev);
      }

      if (riskDelta) {
        const newRisk = Math.max(0, Math.min(100, (investigation.riskScore ?? 0) + riskDelta));
        await storage.updateInvestigation(investigation.id, { riskScore: newRisk });
      }

      await storage.updateTask(taskId, {
        status: "completed",
        completedAt: now(),
        result: { evidenceCount: result.evidence.length, notes: result.notes },
      });
      publish(task.investigationId, { type: "task.update", payload: { id: taskId, status: "completed" } });

      await storage.updateInvestigation(investigation.id, {
        completedTasks: (investigation.completedTasks ?? 0) + 1,
      });

      return;
    }

    // Generic placeholder for non-connector tasks.
    await storage.updateTask(taskId, {
      status: "completed",
      completedAt: now(),
      result: { ok: true },
    });
    publish(task.investigationId, { type: "task.update", payload: { id: taskId, status: "completed" } });

    await storage.updateInvestigation(investigation.id, {
      completedTasks: (investigation.completedTasks ?? 0) + 1,
    });
  } catch (err: any) {
    await storage.updateTask(taskId, {
      status: "failed",
      completedAt: now(),
      error: err?.message ?? String(err),
    });
    publish(task.investigationId, { type: "task.update", payload: { id: taskId, status: "failed", error: err?.message ?? String(err) } });

    // Mark completion even on failure; tasks are no longer running.
    try {
      const investigation = await storage.getInvestigation(task.investigationId);
      if (investigation) {
        await storage.updateInvestigation(investigation.id, {
          completedTasks: (investigation.completedTasks ?? 0) + 1,
        });
      }
    } catch {
      // ignore
    }
  } finally {
    running.delete(taskId);
  }
}
