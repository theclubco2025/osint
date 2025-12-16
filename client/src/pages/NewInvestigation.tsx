import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createInvestigation } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ShieldAlert, Loader2, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useApp } from '@/lib/store';

export default function NewInvestigation() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setActiveInvestigationId } = useApp();
  const [title, setTitle] = useState('');
  const [targetDescription, setTargetDescription] = useState('');

  useEffect(() => {
    // Allow prefilling from /new?q=...
    const idx = location.indexOf('?');
    if (idx === -1) return;
    const params = new URLSearchParams(location.slice(idx));
    const q = (params.get('q') ?? '').trim();
    if (!q) return;
    setTargetDescription((prev) => (prev.trim() ? prev : q));
  }, [location]);

  const createMutation = useMutation({
    mutationFn: createInvestigation,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['investigations'] });
      setActiveInvestigationId(data.id);
      toast({
        title: "Investigation Initialized",
        description: "Kimi Agent is ready to assist.",
      });
      setLocation(`/investigation/${data.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create investigation",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title: title || `Investigation: ${targetDescription.slice(0, 48)}${targetDescription.length > 48 ? '…' : ''}`,
      target: targetDescription,
      targetType: 'case',
      status: 'active',
      phase: 'Phase 1: Enrichment',
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-8 animate-in-slide">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-foreground">New Operation</h1>
        <p className="text-muted-foreground font-mono">Initialize a new intelligence gathering task</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Case Intake</CardTitle>
            <CardDescription>Give Kimi the best possible description so it can correctly identify the target and key identifiers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="grid gap-2">
              <Label>Investigation Title (optional)</Label>
              <Input 
                placeholder="Operation Nightfall" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="target">Describe the target *</Label>
              <div className="relative">
                <div className="absolute left-3 top-3 text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <Textarea
                  id="target"
                  required
                  value={targetDescription}
                  onChange={(e) => setTargetDescription(e.target.value)}
                  className="min-h-[160px] pl-10 font-mono"
                  placeholder={`Example:\nName: Jane Doe\nPhone: +1 212 555 0123\nEmail: jane@example.com\nAddress: 1600 Pennsylvania Ave NW, Washington, DC\nKnown usernames: janedoe\nRelated domains: example.com\nNotes: possible alias 'J. Doe', works at ...`}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: include as many identifiers as you have (name, phone, email, domain, usernames, address). The system will extract indicators for safe OSINT collection.
              </p>
            </div>

          </CardContent>
          <CardFooter className="flex justify-between border-t border-border pt-6">
            <Button variant="ghost" type="button" onClick={() => setLocation('/')}>Cancel</Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={createMutation.isPending || !targetDescription.trim()}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Initializing...
                </>
              ) : (
                <>
                  <ShieldAlert className="mr-2 h-4 w-4" /> Start Operation
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
