// API client for backend

export interface Investigation {
  id: string;
  title: string;
  target: string;
  targetType: string;
  status: string;
  phase: string;
  riskScore: number;
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

export interface InvestigationTask {
  id: string;
  investigationId: string;
  type: string;
  phase: string;
  status: string;
  payload: any;
  result: any;
  error?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface AuditLog {
  id: string;
  investigationId?: string | null;
  action: string;
  actor: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata: any;
  createdAt: string;
}

export interface ConnectorInfo {
  name: string;
  description: string;
  supportedTargetTypes: string[];
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
  riskScore?: number;
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

// Entities / Timeline
export async function getEntities(investigationId: string): Promise<any[]> {
  const res = await fetch(`/api/investigations/${investigationId}/entities`);
  if (!res.ok) throw new Error('Failed to fetch entities');
  return res.json();
}

export async function getTimeline(investigationId: string): Promise<any[]> {
  const res = await fetch(`/api/investigations/${investigationId}/timeline`);
  if (!res.ok) throw new Error('Failed to fetch timeline');
  return res.json();
}

// Connectors
export async function listConnectors(): Promise<ConnectorInfo[]> {
  const res = await fetch('/api/connectors');
  if (!res.ok) throw new Error('Failed to fetch connectors');
  return res.json();
}

// Tasks
export async function createTask(investigationId: string, data: { type?: string; phase?: string; payload: any }): Promise<InvestigationTask> {
  const res = await fetch(`/api/investigations/${investigationId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create task');
  return res.json();
}

export async function listTasks(investigationId: string): Promise<InvestigationTask[]> {
  const res = await fetch(`/api/investigations/${investigationId}/tasks`);
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

// Report
export async function getReport(investigationId: string): Promise<any> {
  const res = await fetch(`/api/investigations/${investigationId}/report`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

// Audit Logs
export async function getAuditLogs(params?: { investigationId?: string; limit?: number; offset?: number }): Promise<AuditLog[]> {
  const url = new URL('/api/audit-log', window.location.origin);
  if (params?.investigationId) url.searchParams.set('investigationId', params.investigationId);
  if (typeof params?.limit === 'number') url.searchParams.set('limit', String(params.limit));
  if (typeof params?.offset === 'number') url.searchParams.set('offset', String(params.offset));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  return res.json();
}
