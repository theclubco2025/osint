import React, { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { 
  ShieldAlert, 
  LayoutDashboard, 
  PlusCircle, 
  FolderOpen, 
  Settings, 
  Search, 
  BrainCircuit, 
  Activity,
  Menu,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useQuery } from '@tanstack/react-query';
import { getInvestigation } from '@/lib/api';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const { activeInvestigationId } = useApp();
  const [search, setSearch] = useState('');
  
  // Fetch the active investigation from API if one is selected
  const { data: activeInv } = useQuery({
    queryKey: ['investigation', activeInvestigationId],
    queryFn: () => getInvestigation(activeInvestigationId!),
    enabled: !!activeInvestigationId,
  });

  const NavItem = ({ href, icon: Icon, label, active = false }: { href: string; icon: any; label: string; active?: boolean }) => (
    <Link href={href}>
      <Button
        variant="ghost"
        className={cn(
          "w-full justify-start gap-3 mb-1 font-medium transition-all duration-200",
          location === href || active 
            ? "bg-primary/10 text-primary border-r-2 border-primary rounded-r-none rounded-l-md" 
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Button>
    </Link>
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="p-6 flex items-center gap-3">
        <div className="h-8 w-8 bg-primary/20 rounded-md flex items-center justify-center border border-primary/50 shadow-[0_0_15px_rgba(0,240,255,0.3)]">
          <ShieldAlert className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display font-bold text-lg tracking-tight text-foreground">Dpt of <span className="text-primary">Karma</span> OSINT</h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">portable • secure • v0.1</p>
        </div>
      </div>

      <div className="px-3 py-2">
        <p className="px-4 text-xs font-mono text-muted-foreground mb-2 uppercase tracking-widest">Platform</p>
        <NavItem href="/" icon={LayoutDashboard} label="Dashboard" />
        <NavItem href="/new" icon={PlusCircle} label="New Investigation" />
        <NavItem href="/audit" icon={Activity} label="Audit Logs" />
      </div>

      <div className="px-3 py-2 mt-4 flex-1">
        <p className="px-4 text-xs font-mono text-muted-foreground mb-2 uppercase tracking-widest">Active Case</p>
        {activeInv ? (
          <div className="mb-2 px-2">
             <div className="p-3 bg-card border border-border rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-mono text-primary truncate">{activeInv.id}</span>
                </div>
                <p className="font-medium text-sm truncate text-foreground mb-1">{activeInv.title}</p>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{activeInv.phase.split(':')[0]}</span>
                  <span>{activeInv.confidence ?? 0}% Confidence</span>
                </div>
             </div>
             <div className="mt-2 space-y-1">
               <NavItem href={`/investigation/${activeInv.id}`} icon={BrainCircuit} label="Agent Overview" active={location.includes('/investigation/')} />
               <NavItem href={`/investigation/${activeInv.id}/graph`} icon={Activity} label="Entity Graph" />
               <NavItem href={`/investigation/${activeInv.id}/evidence`} icon={FolderOpen} label="Evidence Locker" />
             </div>
          </div>
        ) : (
          <div className="px-4 py-8 text-center border border-dashed border-border rounded-md m-2">
            <p className="text-xs text-muted-foreground">No active investigation selected</p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-sidebar-border mt-auto">
        <NavItem href="/settings" icon={Settings} label="System Config" />
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
      {/* Mobile Sidebar */}
      <div className="md:hidden absolute top-4 left-4 z-50">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon"><Menu className="h-4 w-4" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-r border-border">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 h-full shrink-0">
        <SidebarContent />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-14 border-b border-border bg-background/50 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
             <span className="flex items-center gap-1.5">
               <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
               Kimi Agent Online
             </span>
             <span className="text-border mx-2">|</span>
             <span className="font-mono text-xs">SYS_STATUS: OPTIMAL</span>
          </div>
          <div className="flex items-center gap-4">
             <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search intelligence database..." 
                  className="h-9 w-64 bg-muted/30 border border-input rounded-md pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50 font-mono"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const q = search.trim();
                      if (q) setLocation(`/search?q=${encodeURIComponent(q)}`);
                    }
                  }}
                />
             </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-grid-pattern relative">
          <div className="absolute inset-0 bg-background/90 pointer-events-none z-0" />
          <div className="relative z-10 p-6 h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
