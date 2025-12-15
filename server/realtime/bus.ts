export type RealtimeEvent =
  | { type: "task.update"; payload: any }
  | { type: "message.new"; payload: any }
  | { type: "agent.chunk"; payload: { messageId?: string; chunk: string } };

type Subscriber = (event: RealtimeEvent) => void;

const subsByInvestigation = new Map<string, Set<Subscriber>>();

export function subscribe(investigationId: string, cb: Subscriber) {
  const set = subsByInvestigation.get(investigationId) ?? new Set<Subscriber>();
  set.add(cb);
  subsByInvestigation.set(investigationId, set);

  return () => {
    const s = subsByInvestigation.get(investigationId);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) subsByInvestigation.delete(investigationId);
  };
}

export function publish(investigationId: string, event: RealtimeEvent) {
  const set = subsByInvestigation.get(investigationId);
  if (!set) return;
  for (const cb of set) cb(event);
}
