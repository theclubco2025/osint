import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createInvestigation } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Globe, Mail, User, ShieldAlert, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useApp } from '@/lib/store';

export default function NewInvestigation() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setActiveInvestigationId } = useApp();
  const [targetType, setTargetType] = useState('domain');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');

  const createMutation = useMutation({
    mutationFn: createInvestigation,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['investigations'] });
      setActiveInvestigationId(data.id);
      toast({
        title: "Investigation Initialized",
        description: "Kimi K2 Agent is ready to assist.",
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
      title: title || `Investigation: ${target}`,
      target,
      targetType,
      status: 'active',
      phase: 'Phase 1: Enrichment',
      riskScore: 0,
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
            <CardTitle>Target Definition</CardTitle>
            <CardDescription>Specify the primary entity for this investigation</CardDescription>
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
              <Label>Target Type</Label>
              <div className="grid grid-cols-3 gap-4">
                <div 
                  className={`cursor-pointer rounded-md border p-4 flex flex-col items-center gap-2 hover:bg-muted/50 transition-all ${targetType === 'domain' ? 'border-primary bg-primary/5 text-primary' : 'border-input'}`}
                  onClick={() => setTargetType('domain')}
                >
                  <Globe className="h-6 w-6" />
                  <span className="text-xs font-bold">DOMAIN</span>
                </div>
                <div 
                  className={`cursor-pointer rounded-md border p-4 flex flex-col items-center gap-2 hover:bg-muted/50 transition-all ${targetType === 'email' ? 'border-primary bg-primary/5 text-primary' : 'border-input'}`}
                  onClick={() => setTargetType('email')}
                >
                  <Mail className="h-6 w-6" />
                  <span className="text-xs font-bold">EMAIL</span>
                </div>
                <div 
                  className={`cursor-pointer rounded-md border p-4 flex flex-col items-center gap-2 hover:bg-muted/50 transition-all ${targetType === 'username' ? 'border-primary bg-primary/5 text-primary' : 'border-input'}`}
                  onClick={() => setTargetType('username')}
                >
                  <User className="h-6 w-6" />
                  <span className="text-xs font-bold">USERNAME</span>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="target">Target Identifier *</Label>
              <div className="relative">
                 <Input 
                   id="target" 
                   placeholder={targetType === 'domain' ? "example.com" : targetType === 'email' ? "target@example.com" : "username123"} 
                   required 
                   className="pl-10 font-mono" 
                   value={target}
                   onChange={(e) => setTarget(e.target.value)}
                 />
                 <div className="absolute left-3 top-2.5 text-muted-foreground">
                    {targetType === 'domain' ? <Globe className="h-4 w-4" /> : targetType === 'email' ? <Mail className="h-4 w-4" /> : <User className="h-4 w-4" />}
                 </div>
              </div>
            </div>

          </CardContent>
          <CardFooter className="flex justify-between border-t border-border pt-6">
            <Button variant="ghost" type="button" onClick={() => setLocation('/')}>Cancel</Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={createMutation.isPending || !target}>
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
