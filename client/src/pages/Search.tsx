import React from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { searchIntelligence } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowUpRight } from 'lucide-react';

function getQueryParam(url: string, key: string) {
  const idx = url.indexOf('?');
  if (idx === -1) return '';
  const params = new URLSearchParams(url.slice(idx));
  return params.get(key) ?? '';
}

export default function SearchPage() {
  const [location, setLocation] = useLocation();
  const q = getQueryParam(location, 'q').trim();

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['search', q],
    queryFn: () => searchIntelligence(q),
    enabled: !!q,
  });

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Search</h1>
        <p className="text-muted-foreground font-mono mt-1">Query: <span className="text-foreground">{q || '(empty)'}</span></p>
      </div>

      <Card className="bg-card/30 border-primary/10">
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          {!q ? (
            <div className="text-muted-foreground">Type in the top-right search bar and press Enter.</div>
          ) : isLoading ? (
            <div className="text-muted-foreground">Searching...</div>
          ) : results.length === 0 ? (
            <div className="space-y-3">
              <div className="text-muted-foreground">
                No local matches. This page searches your **collected case data** (messages/evidence/entities) only — it does not search the open web.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setLocation(`/new?q=${encodeURIComponent(q)}`)}>
                  Start a new operation with “{q}”
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((r) => (
                <div key={`${r.kind}:${r.id}`} className="p-3 rounded-md border border-border bg-card/50 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-muted-foreground uppercase">{r.kind}</div>
                    <div className="text-sm text-foreground truncate">{r.title}</div>
                    {r.snippet && <div className="text-xs text-muted-foreground mt-1 truncate">{r.snippet}</div>}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setLocation(`/investigation/${r.investigationId}`)}
                    title="Open case"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}




