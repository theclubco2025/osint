import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listInvestigations } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, ShieldAlert, Globe, Database, ArrowUpRight, Search } from 'lucide-react';
import { Link } from 'wouter';
import { useApp } from '@/lib/store';

export default function Dashboard() {
  const { setActiveInvestigationId } = useApp();
  const { data: investigations = [], isLoading } = useQuery({
    queryKey: ['investigations'],
    queryFn: listInvestigations,
  });
  const [filter, setFilter] = useState<'all' | 'active' | 'critical' | 'archived'>('all');

  const activeInvestigations = investigations.filter(i => i.status === 'active');
  const criticalInvestigations = investigations.filter(i => i.status === 'critical');
  const archivedInvestigations = investigations.filter(i => i.status === 'archived');

  const visible = useMemo(() => {
    if (filter === 'all') return investigations;
    return investigations.filter(i => i.status === filter);
  }, [investigations, filter]);

  return (
    <div className="space-y-6 animate-in-slide">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Command Center</h1>
          <p className="text-muted-foreground font-mono mt-1">Global Intelligence Overview</p>
        </div>
        <Link href="/new">
           <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
             <Activity className="mr-2 h-4 w-4" /> Initialize Operation
           </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-primary/20 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Operations</CardTitle>
            <ShieldAlert className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">{activeInvestigations.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Ongoing investigations</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 border-primary/20 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Critical Cases</CardTitle>
            <Globe className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">{criticalInvestigations.length}</div>
            <p className="text-xs text-muted-foreground mt-1">High priority alerts</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/20 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cases</CardTitle>
            <Database className="h-4 w-4 text-secondary-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">{investigations.length}</div>
            <p className="text-xs text-muted-foreground mt-1">All investigations</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/20 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">System Health</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-green-500">ONLINE</div>
            <p className="text-xs text-muted-foreground mt-1">Kimi operational</p>
          </CardContent>
        </Card>
      </div>

      {/* Investigations List */}
      <Card className="border-primary/10 bg-card/30">
        <CardHeader>
          <CardTitle>Recent Investigations</CardTitle>
          <CardDescription>Latest intelligence gathering operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>All</Button>
            <Button size="sm" variant={filter === 'active' ? 'default' : 'outline'} onClick={() => setFilter('active')}>Active</Button>
            <Button size="sm" variant={filter === 'critical' ? 'destructive' : 'outline'} onClick={() => setFilter('critical')}>Critical</Button>
            <Button size="sm" variant={filter === 'archived' ? 'secondary' : 'outline'} onClick={() => setFilter('archived')}>Archived</Button>
          </div>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading investigations...</div>
          ) : visible.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No investigations yet</p>
              <Link href="/new">
                <Button>Create First Investigation</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {visible.map((inv) => (
                <div 
                  key={inv.id} 
                  className="flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors group"
                  onClick={() => setActiveInvestigationId(inv.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center border ${
                      inv.status === 'critical' ? 'bg-destructive/10 border-destructive/30 text-destructive' : 
                      inv.status === 'active' ? 'bg-primary/10 border-primary/30 text-primary' : 
                      'bg-muted border-muted text-muted-foreground'
                    }`}>
                      {inv.status === 'critical' ? <ShieldAlert className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">{inv.title}</h4>
                      <p className="text-xs text-muted-foreground font-mono">{inv.target} • {inv.phase}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-mono font-bold text-foreground">{inv.confidence ?? 0}%</div>
                      <div className="text-[10px] text-muted-foreground uppercase">Confidence</div>
                    </div>
                    <Link href={`/investigation/${inv.id}`}>
                      <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </Link>
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
