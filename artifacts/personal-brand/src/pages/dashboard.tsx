import { useGetDashboard } from "@workspace/api-client-react";
import { getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BookOpen, Calendar, CheckCircle2, CircleDashed, FileText, Lightbulb } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() }
  });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-10 pb-10">
      <header>
        <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight mb-2 text-primary">Command Center</h1>
        <p className="text-muted-foreground text-lg">Here's the current state of your personal brand.</p>
      </header>

      {/* Brand Health Alert */}
      {!dashboard.brandProfileComplete && (
        <div className="bg-secondary/50 border border-secondary-border rounded-xl p-5 flex items-start gap-4">
          <div className="bg-background rounded-full p-2 shrink-0">
            <CircleDashed className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold font-serif text-lg mb-1">Your brand profile is incomplete</h3>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
              A defined identity makes content creation easier. Head over to the Brand Profile section to articulate your mission, tone, and audience.
            </p>
          </div>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Posts</CardTitle>
            <BookOpen className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-serif font-bold text-foreground">{dashboard.totalPosts}</div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Drafts</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-serif font-bold text-foreground">{dashboard.draftCount}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled</CardTitle>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-serif font-bold text-foreground">{dashboard.scheduledCount}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ideas</CardTitle>
            <Lightbulb className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-serif font-bold text-foreground">{dashboard.ideaCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 shadow-sm border-border">
          <CardHeader>
            <CardTitle className="font-serif">Recent Content</CardTitle>
            <CardDescription>Your latest drafts and published posts.</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard.recentPosts.length === 0 ? (
              <div className="text-center py-10 px-4">
                <div className="bg-secondary/30 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium mb-1">No posts yet</h3>
                <p className="text-sm text-muted-foreground">Create your first piece of content to start building.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dashboard.recentPosts.map(post => (
                  <div key={post.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-background hover:border-primary/30 transition-colors group">
                    <div className="space-y-1 mb-3 sm:mb-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold font-serif text-lg">{post.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          post.status === 'published' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          post.status === 'scheduled' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                          'bg-secondary text-secondary-foreground'
                        }`}>
                          {post.status}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-3">
                        <span className="capitalize">{post.platform}</span>
                        <span className="w-1 h-1 rounded-full bg-border" />
                        <span>Updated {format(new Date(post.updatedAt), "MMM d")}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border">
          <CardHeader>
            <CardTitle className="font-serif">By Platform</CardTitle>
            <CardDescription>Where your content lives.</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard.postsByPlatform.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No platform data yet.
              </div>
            ) : (
              <div className="space-y-4">
                {dashboard.postsByPlatform.map(stat => (
                  <div key={stat.platform} className="flex items-center justify-between">
                    <span className="capitalize font-medium text-muted-foreground">{stat.platform}</span>
                    <span className="font-serif font-bold text-lg">{stat.count}</span>
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
