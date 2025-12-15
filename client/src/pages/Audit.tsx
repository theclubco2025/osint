import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLogs } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Audit() {
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => getAuditLogs({ limit: 200, offset: 0 }),
    refetchInterval: 5000,
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in-slide">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Audit Logs</h1>
        <p className="text-muted-foreground font-mono mt-1">Security + compliance trail (latest 200)</p>
      </div>

      <Card className="border-primary/10 bg-card/30">
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
          <CardDescription>Writes and sensitive actions are recorded here.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground">Loading audit logs...</div>
          ) : error ? (
            <div className="text-destructive">Failed to load audit logs</div>
          ) : logs.length === 0 ? (
            <div className="text-muted-foreground">No audit events yet.</div>
          ) : (
            <div className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className="flex flex-col gap-1 p-3 border border-border rounded-md bg-card/50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-[10px]">{l.action}</Badge>
                      {l.investigationId ? (
                        <span className="text-xs font-mono text-muted-foreground truncate">INV {l.investigationId.slice(0, 8)}</span>
                      ) : null}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">actor={l.actor}</span>
                    {l.ip ? <span className="ml-2 font-mono">ip={l.ip}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
