import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';

type Health = {
  status: string;
  timestamp: string;
  config?: {
    kimiConfigured?: boolean;
    webSearchProvider?: string | null;
    webSearchConfigured?: boolean;
  };
};

type WebSearchDiag = {
  ok: boolean;
  provider: string | null;
  resultsCount?: number;
  sample?: { title: string; url: string; snippet?: string } | null;
  error?: string;
};

export default function Settings() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<Health> => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('Failed to load health');
      return res.json();
    },
    staleTime: 10_000,
  });

  const kimiOk = Boolean(health?.config?.kimiConfigured);
  const provider = health?.config?.webSearchProvider ?? null;
  const webOk = Boolean(health?.config?.webSearchConfigured);

  const { data: webDiag } = useQuery({
    queryKey: ['web-search-diagnostics'],
    queryFn: async (): Promise<WebSearchDiag> => {
      const res = await fetch('/api/diagnostics/web-search');
      if (!res.ok) throw new Error('Failed to load web search diagnostics');
      return res.json();
    },
    staleTime: 10_000,
    enabled: Boolean(provider),
  });

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">System Config</h1>
        <p className="text-muted-foreground font-mono mt-1">Portable-first configuration</p>
      </div>

      <Card className="bg-card/30 border-primary/10">
        <CardHeader>
          <CardTitle>Connectivity</CardTitle>
          <CardDescription>Shows whether your API keys are loaded (secrets are never displayed).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Kimi API key</span>
            <Badge variant={kimiOk ? "secondary" : "destructive"} className="font-mono">
              {kimiOk ? "CONFIGURED" : "MISSING"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Web search provider</span>
            <Badge variant="secondary" className="font-mono">{provider ?? "NONE"}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Web search ready</span>
            <Badge variant={webOk ? "secondary" : "destructive"} className="font-mono">
              {webOk ? "CONFIGURED" : "MISSING"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Web search live test</span>
            <Badge
              variant={webDiag?.ok ? "secondary" : webDiag ? "destructive" : "secondary"}
              className="font-mono"
            >
              {webDiag?.ok ? "OK" : webDiag ? "FAIL" : "CHECKING"}
            </Badge>
          </div>
          {webDiag && !webDiag.ok && webDiag.error && (
            <p className="text-xs text-muted-foreground">
              Web search error: <span className="font-mono">{webDiag.error}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            If anything shows <span className="font-mono">MISSING</span>, open <span className="font-mono">.env</span> in the project folder, paste keys, then restart <span className="font-mono">npm run dev</span>.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card/30 border-primary/10">
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>All investigations are stored locally for portability and anonymity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Mode</span>
            <Badge variant="secondary" className="font-mono">PORTABLE_ONLY</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Data file</span>
            <span className="font-mono text-xs">data/karma-osint.json</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: to run from a USB drive, copy the whole folder. Your data stays inside <span className="font-mono">data/</span>.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card/30 border-primary/10">
        <CardHeader>
          <CardTitle>Collection Safety</CardTitle>
          <CardDescription>Thorough verification without uncontrolled scraping.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p className="text-muted-foreground">
            The system uses public sources and applies light rate limiting to avoid hammering services.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}




