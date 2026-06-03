import { Link } from "wouter";
import { useGetDashboard, getGetDashboardQueryKey, useGetClient, getGetClientQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  BookOpen,
  FileText,
  Lightbulb,
  CheckCircle2,
  CircleDashed,
  ArrowUpRight,
  Sparkles,
  Compass,
} from "lucide-react";
import { format } from "date-fns";
import { overallCompletion, nextPillar } from "@/lib/blueprint";

function ScoreDial({ label, score, hint }: { label: string; score: number | null | undefined; hint: string }) {
  const has = typeof score === "number";
  const value = has ? score! : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex items-center gap-5">
      <div className="relative w-32 h-32 shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={has ? offset : circumference}
            className="transition-all duration-1000 ease-out"
            style={{ transitionDelay: "200ms" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-4xl leading-none text-foreground">{has ? value : "--"}</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">/ 100</span>
        </div>
      </div>
      <div>
        <h3 className="font-serif text-2xl text-foreground">{label}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-[16rem] mt-1">{hint}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() },
  });
  const { data: client } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });

  if (isLoading) {
    return (
      <div className="space-y-10">
        <div className="space-y-3">
          <Skeleton className="h-12 w-80" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  if (!dashboard) return null;

  const blueprint = overallCompletion(client);
  const next = nextPillar(client);

  const stages = [
    { label: "Blueprint", done: blueprint.pct === 100, href: "/blueprint", desc: "Tell arc who you are" },
    { label: "Presence Audit", done: dashboard.auditComplete, href: "/audit", desc: "See how the world finds you" },
    { label: "Narrative", done: dashboard.narrativeComplete, href: "/narrative", desc: "Shape your point of view" },
    { label: "Content", done: dashboard.totalPosts > 0, href: "/content", desc: "Put the story to work" },
  ];

  const firstName = client?.fullName?.split(" ")[0];

  return (
    <div className="space-y-12 pb-10">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">Overview</p>
        <h1 className="font-serif text-4xl md:text-5xl text-foreground leading-tight">
          {firstName ? `Welcome back, ${firstName}.` : "Your story so far."}
        </h1>
        <p className="text-muted-foreground text-lg mt-3 max-w-2xl">
          {client?.headline || "A clear view of where your personal brand stands today, and what comes next."}
        </p>
      </header>

      {/* Presence scores */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <ScoreDial
              label="SEO"
              score={dashboard.seoScore}
              hint="How clearly you show up across Google search results."
            />
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <ScoreDial
              label="GEO"
              score={dashboard.geoScore}
              hint="Whether AI models actually know who you are."
            />
          </CardContent>
        </Card>
      </section>

      {next && (
        <Link href={`/blueprint/${next.id}`}>
          <div className="group flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 cursor-pointer transition-all hover:border-primary/40">
            <div className="flex items-start gap-4 flex-1">
              <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
                <Compass className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-serif text-xl text-foreground">
                    Build out your Blueprint
                  </h3>
                  <span className="text-sm font-medium text-muted-foreground shrink-0">
                    {blueprint.pct}% complete
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Next up: {next.title}. The more arc knows, the sharper your narrative.
                </p>
                <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden max-w-md">
                  <div
                    className="h-full bg-primary transition-all duration-700 ease-out"
                    style={{ width: `${blueprint.pct}%` }}
                  />
                </div>
              </div>
            </div>
            <ArrowUpRight className="w-5 h-5 text-primary shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </Link>
      )}

      {!dashboard.auditComplete && (
        <Link href="/audit">
          <div className="group flex items-center justify-between gap-4 rounded-xl border border-primary/30 bg-accent p-5 cursor-pointer transition-colors hover:border-primary/60">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-serif text-xl text-foreground">Run your first presence audit</h3>
                <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
                  arc will search the web and interview leading AI models to measure exactly how visible you are.
                </p>
              </div>
            </div>
            <ArrowUpRight className="w-5 h-5 text-primary shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </Link>
      )}

      {/* Journey */}
      <section>
        <h2 className="font-serif text-2xl text-foreground mb-5">Your arc</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stages.map((stage) => (
            <Link key={stage.label} href={stage.href}>
              <div className="group h-full rounded-xl border border-border bg-card p-5 cursor-pointer transition-all hover:border-primary/40 hover:-translate-y-0.5">
                <div className="flex items-center justify-between mb-3">
                  {stage.done ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <CircleDashed className="w-5 h-5 text-muted-foreground" />
                  )}
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground/0 transition-all group-hover:text-muted-foreground" />
                </div>
                <h3 className="font-serif text-xl text-foreground">{stage.label}</h3>
                <p className="text-sm text-muted-foreground mt-1">{stage.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Content metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Posts", value: dashboard.totalPosts, icon: BookOpen },
          { label: "Drafts", value: dashboard.draftCount, icon: FileText },
          { label: "Scheduled", value: dashboard.scheduledCount, icon: Search },
          { label: "Ideas", value: dashboard.ideaCount, icon: Lightbulb },
        ].map((m) => (
          <Card key={m.label} className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                {m.label}
              </CardTitle>
              <m.icon className="w-4 h-4 text-muted-foreground stroke-[1.5]" />
            </CardHeader>
            <CardContent>
              <div className="font-serif text-4xl text-foreground">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border bg-card">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Recent content</CardTitle>
            <CardDescription>Your latest drafts and published posts.</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard.recentPosts.length === 0 ? (
              <div className="text-center py-10 px-4">
                <div className="bg-secondary/40 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-serif text-lg mb-1">Nothing here yet</h3>
                <p className="text-sm text-muted-foreground">
                  Once your narrative is set, your first posts will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {dashboard.recentPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-background hover:border-primary/30 transition-colors"
                  >
                    <div className="space-y-1 mb-2 sm:mb-0">
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-lg">{post.title}</span>
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium bg-secondary text-secondary-foreground">
                          {post.status}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
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

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">By platform</CardTitle>
            <CardDescription>Where your content lives.</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard.postsByPlatform.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No platform data yet.</div>
            ) : (
              <div className="space-y-4">
                {dashboard.postsByPlatform.map((stat) => (
                  <div key={stat.platform} className="flex items-center justify-between">
                    <span className="capitalize font-medium text-muted-foreground">{stat.platform}</span>
                    <span className="font-serif text-xl">{stat.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
