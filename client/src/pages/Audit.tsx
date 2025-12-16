import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditLog } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Audit() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: getAuditLog,
    refetchInterval: 5000,
  });

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Audit Logs</h1>
        <p className="text-muted-foreground font-mono mt-1">Portable local audit trail (latest first)</p>
      </div>

      <Card className="bg-card/30 border-primary/10">
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>Case creation, runs, exports, updates, deletes</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Loading audit log...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No audit events yet.</div>
          ) : (
            <div className="space-y-3">
              {events.map((e) => (
                <div key={e.id} className="p-3 rounded-md border border-border bg-card/50 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-[10px]">{e.action}</Badge>
                      {e.investigationId && (
                        <span className="text-[10px] font-mono text-muted-foreground truncate">CASE: {e.investigationId}</span>
                      )}
                    </div>
                    <div className="text-sm text-foreground mt-1">{e.summary}</div>
                    {e.details && Object.keys(e.details).length > 0 && (
                      <pre className="mt-2 text-[10px] bg-muted/30 border border-border rounded p-2 overflow-auto max-h-40">
{JSON.stringify(e.details, null, 2)}
                      </pre>
                    )}
                  </div>
                  <div className="text-right text-[10px] font-mono text-muted-foreground shrink-0">
                    {new Date(e.ts).toLocaleString()}
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




