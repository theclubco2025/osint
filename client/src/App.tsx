import { Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { AppProvider } from '@/lib/store';
import { AppLayout } from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import NewInvestigation from '@/pages/NewInvestigation';
import InvestigationView from '@/components/investigation/InvestigationView';
import ReportView from '@/pages/ReportView';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <AppLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/new" component={NewInvestigation} />
            <Route path="/investigation/:id" component={InvestigationView} />
            <Route path="/investigation/:id/report" component={ReportView} />
            <Route>
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-foreground mb-2">404 Not Found</h1>
                  <p className="text-muted-foreground">The page you are looking for does not exist.</p>
                </div>
              </div>
            </Route>
          </Switch>
        </AppLayout>
        <Toaster />
      </AppProvider>
    </QueryClientProvider>
  );
}

export default App;
