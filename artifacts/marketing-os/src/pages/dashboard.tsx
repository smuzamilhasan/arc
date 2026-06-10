import { useGetMarketingDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Users, Mail, CheckCircle2, TrendingUp, Inbox, Activity } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: dashboard, isLoading, error } = useGetMarketingDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">Funnel performance at a glance.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-destructive/10 p-3 text-destructive mb-4">
          <TrendingUp size={24} />
        </div>
        <h2 className="text-xl font-bold">Failed to load dashboard</h2>
        <p className="text-muted-foreground mt-2">There was an error fetching the funnel metrics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">Funnel performance at a glance.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.totalLeads}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-primary font-medium">{dashboard.newLeads}</span> new this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Fit Leads</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.highFit}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Top priority targets
            </p>
          </CardContent>
        </Card>

        <Card className={dashboard.pendingActions > 0 ? "border-primary/50 shadow-sm" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Inbox className={`h-4 w-4 ${dashboard.pendingActions > 0 ? "text-primary" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.pendingActions}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboard.pendingActions > 0 ? (
                <Link href="/actions" className="text-primary hover:underline">Review now →</Link>
              ) : (
                "Queue is clear"
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.emailsSent}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Outreach delivered
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Recent Leads</CardTitle>
            <CardDescription>Latest entries into the funnel</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {dashboard.recentLeads.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-8">
                <Users className="h-8 w-8 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No leads captured yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dashboard.recentLeads.map(lead => (
                  <Link key={lead.id} href={`/leads/${lead.id}`} className="flex items-center justify-between group rounded-lg p-2 hover:bg-muted/50 transition-colors -mx-2">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none group-hover:text-primary transition-colors">
                        {lead.name || lead.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lead.company || "Unknown company"} • {format(new Date(lead.createdAt), "MMM d")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {lead.fitTier === "high" && <span className="flex h-2 w-2 rounded-full bg-primary" />}
                      {lead.fitTier === "medium" && <span className="flex h-2 w-2 rounded-full bg-chart-4" />}
                      {lead.fitTier === "low" && <span className="flex h-2 w-2 rounded-full bg-muted-foreground" />}
                      {!lead.fitTier && <span className="flex h-2 w-2 rounded-full bg-border" />}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Activity Feed</CardTitle>
            <CardDescription>System and operator actions</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {dashboard.recentActivity.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-8">
                <Activity className="h-8 w-8 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dashboard.recentActivity.map(activity => (
                  <div key={activity.id} className="flex items-start gap-4">
                    <div className="mt-0.5 rounded-full bg-secondary p-1.5 text-secondary-foreground">
                      {activity.kind.includes('action') ? <CheckCircle2 size={14} /> : <Activity size={14} />}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {activity.summary}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(activity.createdAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Temporary icon component for Target since it wasn't imported from lucide-react in this file but was in layout
function Target(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}