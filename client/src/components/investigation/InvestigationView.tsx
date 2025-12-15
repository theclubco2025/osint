import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTask, getInvestigation, getEvidence, getEntities, getTimeline, listConnectors } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRoute, Link } from 'wouter';
import { AgentChat } from './AgentChat';
import { FileText, Globe, Image, Share2, Calendar, Hash, Lock, MoreHorizontal, User, ShieldAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function InvestigationView() {
  const [, params] = useRoute('/investigation/:id');
  const investigationId = params?.id || '';

  const { data: investigation, isLoading } = useQuery({
    queryKey: ['investigation', investigationId],
    queryFn: () => getInvestigation(investigationId),
    enabled: !!investigationId,
  });

  const { data: evidenceList = [] } = useQuery({
    queryKey: ['evidence', investigationId],
    queryFn: () => getEvidence(investigationId),
    enabled: !!investigationId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!investigation) return <div className="p-8 text-center">Investigation not found</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-6">
      {/* Investigation Header */}
      <div className="px-6 py-4 border-b border-border bg-card/30 flex items-center justify-between shrink-0">
         <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-bold font-mono text-xs">
               {investigation.id.substring(0, 8)}
            </div>
            <div>
               <h2 className="font-display font-bold text-lg flex items-center gap-2">
                 {investigation.title}
                 <Badge variant="outline" className="text-xs font-normal bg-primary/5 border-primary/20 text-primary">
                   {investigation.status}
                 </Badge>
               </h2>
               <p className="text-xs font-mono text-muted-foreground flex items-center gap-3">
                  <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {investigation.target}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(investigation.createdAt).toLocaleDateString()}</span>
               </p>
            </div>
         </div>
         <div className="flex items-center gap-3">
            <div className="text-right mr-4">
               <div className="text-xs text-muted-foreground uppercase tracking-wider">Risk Score</div>
               <div className="font-mono text-xl font-bold text-destructive">{investigation.riskScore}/100</div>
            </div>
            <Link href={`/investigation/${investigation.id}/report`}>
               <Button variant="outline" size="sm" className="gap-2">
                  <Share2 className="h-4 w-4" /> Export Report
               </Button>
            </Link>
            <Button size="sm" className="gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
               <Lock className="h-4 w-4" /> Close Case
            </Button>
         </div>
      </div>

      {/* Main Workspace */}
      <Tabs defaultValue="agent" className="flex-1 flex flex-col min-h-0">
        <div className="px-6 border-b border-border bg-background/50">
           <TabsList className="bg-transparent h-12 p-0 space-x-6">
              <TabsTrigger value="agent" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0">
                 Agent K2
              </TabsTrigger>
              <TabsTrigger value="evidence" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0">
                 Evidence Locker ({evidenceList.length})
              </TabsTrigger>
              <TabsTrigger value="graph" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0">
                 Entity Graph
              </TabsTrigger>
              <TabsTrigger value="timeline" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0">
                 Timeline
              </TabsTrigger>
           </TabsList>
        </div>

        <TabsContent value="agent" className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col">
           <AgentChat investigationId={investigationId} />
        </TabsContent>

        <TabsContent value="evidence" className="flex-1 overflow-auto p-6 m-0">
           <EvidenceBoard investigationId={investigationId} items={evidenceList} />
        </TabsContent>
        
        <TabsContent value="graph" className="flex-1 overflow-hidden relative m-0 bg-black">
           <GraphViewer investigationId={investigationId} />
        </TabsContent>

        <TabsContent value="timeline" className="flex-1 overflow-auto p-6 m-0">
           <TimelineView investigationId={investigationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EvidenceBoard({ investigationId, items }: { investigationId: string; items: any[] }) {
   const queryClient = useQueryClient();
   const { data: connectors = [] } = useQuery({
     queryKey: ['connectors'],
     queryFn: listConnectors,
   });

   const runTask = useMutation({
     mutationFn: (payload: any) => createTask(investigationId, { type: 'connector', payload }),
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['evidence', investigationId] });
       queryClient.invalidateQueries({ queryKey: ['entities', investigationId] });
     },
   });

   if (items.length === 0) {
     return (
        <div className="flex items-center justify-center h-full">
           <div className="text-center">
              <p className="text-muted-foreground mb-2">No evidence collected yet</p>
              <p className="text-xs text-muted-foreground">Chat with the agent to start gathering intelligence</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {connectors
                  .filter((c: any) => ['wayback', 'web-scraper', 'github'].includes(c.name))
                  .map((c: any) => (
                    <Button
                      key={c.name}
                      variant="outline"
                      size="sm"
                      onClick={() => runTask.mutate({ connectorName: c.name })}
                      disabled={runTask.isPending}
                      className="font-mono text-xs"
                    >
                      Run {c.name}
                    </Button>
                  ))}
              </div>
           </div>
        </div>
     );
   }

   return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in-slide">
         {items.map((item) => (
            <Card key={item.id} className="group hover:border-primary/50 transition-colors cursor-pointer bg-card/50">
               <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
                  <div className="p-2 bg-muted rounded-md group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                     {item.type === 'text' ? <FileText className="h-4 w-4" /> : 
                      item.type === 'image' ? <Image className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal className="h-3 w-3" /></Button>
               </CardHeader>
               <CardContent className="p-4 pt-0">
                  <h4 className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">{item.title}</h4>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                     <span>{item.source}</span>
                     <span>•</span>
                     <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                     {item.tags?.map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-[10px] h-5 px-1.5">{tag}</Badge>
                     ))}
                  </div>
               </CardContent>
            </Card>
         ))}
      </div>
   )
}

function GraphViewer({ investigationId }: { investigationId: string }) {
  const { data: entities = [], isLoading } = useQuery({
    queryKey: ['entities', investigationId],
    queryFn: () => getEntities(investigationId),
    enabled: !!investigationId,
    refetchInterval: 8000,
  });

   return (
      <div className="w-full h-full flex items-center justify-center relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900 via-black to-black">
         <svg className="w-full h-full absolute inset-0 pointer-events-none">
            <line x1="50%" y1="50%" x2="30%" y2="30%" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.3" />
            <line x1="50%" y1="50%" x2="70%" y2="40%" stroke="hsl(var(--primary))" strokeWidth="1" strokeOpacity="0.3" />
            <line x1="50%" y1="50%" x2="50%" y2="70%" stroke="hsl(var(--destructive))" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="5,5" />
         </svg>

         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center shadow-[0_0_30px_rgba(0,240,255,0.3)] animate-pulse">
               <Globe className="h-8 w-8 text-primary" />
            </div>
            <p className="mt-2 text-xs font-mono text-primary font-bold bg-black/50 px-2 rounded">TARGET</p>
         </div>

         <div className="absolute top-4 left-4 right-4 z-20">
            <div className="max-w-4xl mx-auto bg-black/60 border border-white/10 rounded-lg p-4 backdrop-blur">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase">Entities</p>
                  <p className="text-sm text-white/90">{isLoading ? 'Loading…' : `${entities.length} nodes discovered`}</p>
                </div>
              </div>
              {entities.length === 0 ? (
                <p className="text-xs text-muted-foreground">No entities yet. Run connector tasks or add evidence to extract entities.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-auto pr-2">
                  {entities.slice(0, 50).map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-md px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs text-white/90 font-mono truncate">{e.value}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{e.entityType}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-white/20 text-white/80">{e.riskLevel}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
         </div>
      </div>
   )
}

function TimelineView({ investigationId }: { investigationId: string }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['timeline', investigationId],
    queryFn: () => getTimeline(investigationId),
    enabled: !!investigationId,
    refetchInterval: 8000,
  });

   return (
      <div className="max-w-3xl mx-auto py-8">
         {isLoading ? (
           <div className="text-center text-muted-foreground">Loading timeline…</div>
         ) : events.length === 0 ? (
           <div className="text-center text-muted-foreground">
             <p className="mb-2">No timeline events yet</p>
             <p className="text-xs">Events will appear here as they're collected</p>
           </div>
         ) : (
           <div className="space-y-3">
             {events.map((ev: any) => (
               <Card key={ev.id} className="bg-card/50">
                 <CardHeader className="pb-2">
                   <CardTitle className="text-base">{ev.title}</CardTitle>
                   <p className="text-xs font-mono text-muted-foreground">{new Date(ev.eventDate).toLocaleString()}</p>
                 </CardHeader>
                 <CardContent className="text-sm text-muted-foreground">{ev.description}</CardContent>
               </Card>
             ))}
           </div>
         )}
      </div>
   )
}
