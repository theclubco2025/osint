import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Settings() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in-slide">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">System Config</h1>
        <p className="text-muted-foreground font-mono mt-1">Operational posture & environment checks</p>
      </div>

      <Card className="border-primary/10 bg-card/30">
        <CardHeader>
          <CardTitle>Security Controls</CardTitle>
          <CardDescription>These are enforced server-side.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Security headers (Helmet)</span>
            <Badge>enabled</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">API rate limiting</span>
            <Badge>enabled</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Write API key gate (ADMIN_API_KEY)</span>
            <Badge variant="secondary">optional</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Evidence store hashing (SHA-256)</span>
            <Badge>enabled</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">HTML snapshot sanitization</span>
            <Badge>enabled</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10 bg-card/30">
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Keys are never exposed to the client.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Configure secrets via environment variables on the server: <span className="font-mono">KIMI_API_KEY</span>, <span className="font-mono">DATABASE_URL</span>, and optional connector keys.
        </CardContent>
      </Card>
    </div>
  );
}
