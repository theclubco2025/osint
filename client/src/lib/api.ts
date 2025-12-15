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
