// API client for backend

export interface Investigation {
  id: string;
  title: string;
  target: string;
  targetType: string;
  status: string;
  phase: string;
  confidence: number;
  totalTasks: number;
  completedTasks: number;
  metadata: any;
  createdAt: string;
}

export interface Message {
  id: string;
  investigationId: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  citations: string[];
  createdAt: string;
}

export interface Evidence {
  id: string;
  investigationId: string;
  type: string;
  title: string;
  content: string;
  source: string;
  hash: string;
  tags: string[];
  metadata: any;
  createdAt: string;
}

// Investigations
export async function listInvestigations(): Promise<Investigation[]> {
  const res = await fetch('/api/investigations');
  if (!res.ok) throw new Error('Failed to fetch investigations');
  return res.json();
}

export async function getInvestigation(id: string): Promise<Investigation> {
  const res = await fetch(`/api/investigations/${id}`);
  if (!res.ok) throw new Error('Failed to fetch investigation');
  return res.json();
}

export async function createInvestigation(data: {
  title: string;
  target: string;
  targetType: string;
  status?: string;
  phase?: string;
}): Promise<Investigation> {
  const res = await fetch('/api/investigations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create investigation');
  return res.json();
}

// Messages
export async function getMessages(investigationId: string): Promise<Message[]> {
  const res = await fetch(`/api/investigations/${investigationId}/messages`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function sendMessage(investigationId: string, message: string): Promise<{ userMessage: Message; agentMessage: Message }> {
  const res = await fetch(`/api/investigations/${investigationId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

export async function runInvestigation(investigationId: string): Promise<{ ok: boolean; evidenceAdded: number; entitiesAdded: number; confidence: number }> {
  const res = await fetch(`/api/investigations/${investigationId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to run investigation');
  return res.json();
}

export async function exportCaseFile(investigationId: string): Promise<Blob> {
  const res = await fetch(`/api/investigations/${investigationId}/export`);
  if (!res.ok) throw new Error('Failed to export case file');
  return res.blob();
}

export async function deleteInvestigation(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/investigations/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete investigation');
  return res.json();
}

export async function updateInvestigation(id: string, patch: { status?: string; title?: string; phase?: string; metadata?: any }): Promise<Investigation> {
  const res = await fetch(`/api/investigations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update investigation');
  return res.json();
}

export interface AuditEvent {
  id: string;
  ts: string;
  action: string;
  investigationId?: string;
  summary: string;
  details?: any;
}

export async function getAuditLog(): Promise<AuditEvent[]> {
  const res = await fetch('/api/audit-log');
  if (!res.ok) throw new Error('Failed to fetch audit log');
  return res.json();
}

export interface SearchResult {
  kind: 'investigation' | 'message' | 'evidence' | 'entity' | 'timeline';
  investigationId: string;
  id: string;
  title: string;
  snippet?: string;
}

export async function searchIntelligence(q: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}

export async function addProvidedFact(investigationId: string, fact: { relation: string; name: string; authorized?: boolean }) {
  const res = await fetch(`/api/investigations/${investigationId}/facts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fact),
  });
  if (!res.ok) throw new Error('Failed to add provided fact');
  return res.json();
}

// Evidence
export async function getEvidence(investigationId: string): Promise<Evidence[]> {
  const res = await fetch(`/api/investigations/${investigationId}/evidence`);
  if (!res.ok) throw new Error('Failed to fetch evidence');
  return res.json();
}

export async function addEvidence(investigationId: string, data: {
  type: string;
  title: string;
  content: string;
  source: string;
  tags?: string[];
}): Promise<Evidence> {
  const res = await fetch(`/api/investigations/${investigationId}/evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add evidence');
  return res.json();
}
