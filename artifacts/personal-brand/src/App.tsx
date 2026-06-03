import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import Entry from "@/pages/entry";
import Onboard from "@/pages/onboard";
import Dashboard from "@/pages/dashboard";
import Audit from "@/pages/audit";
import Narrative from "@/pages/narrative";
import Content from "@/pages/content";
import Ideas from "@/pages/ideas";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Entry} />
      <Route path="/onboard" component={Onboard} />
      
      {/* Routes that need the standard layout */}
      <Route path="/:rest*">
        <Layout>
          <Switch>
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/audit" component={Audit} />
            <Route path="/narrative" component={Narrative} />
            <Route path="/content" component={Content} />
            <Route path="/ideas" component={Ideas} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
