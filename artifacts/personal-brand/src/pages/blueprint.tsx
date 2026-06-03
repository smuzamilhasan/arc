import { Link } from "wouter";
import {
  useGetClient,
  getGetClientQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import {
  PILLARS,
  pillarCompletion,
  overallCompletion,
  nextPillar,
} from "@/lib/blueprint";

export default function Blueprint() {
  const { data: client, isLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });

  if (isLoading) {
    return (
      <div className="space-y-10">
        <div className="space-y-3">
          <Skeleton className="h-12 w-80" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  const overall = overallCompletion(client);
  const next = nextPillar(client);

  return (
    <div className="space-y-12 pb-10">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium mb-3">
          Brand Blueprint
        </p>
        <h1 className="font-serif text-4xl md:text-5xl text-foreground leading-tight">
          Your strategy, built piece by piece.
        </h1>
        <p className="text-muted-foreground text-lg mt-3 max-w-2xl">
          Each pillar deepens what arc knows about you. Fill them in any order, in
          your own time. The more complete, the sharper your narrative and content.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-serif text-2xl text-foreground">Overall completeness</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {overall.filled} of {overall.total} key areas captured.
            </p>
          </div>
          <span className="font-serif text-4xl text-foreground">{overall.pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${overall.pct}%` }}
          />
        </div>
        {next && (
          <Link href={`/blueprint/${next.id}`}>
            <div className="group mt-5 flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-accent p-4 cursor-pointer transition-colors hover:border-primary/60">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2 shrink-0">
                  <next.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-primary font-medium">
                    Next best step
                  </p>
                  <p className="font-serif text-lg text-foreground">{next.title}</p>
                </div>
              </div>
              <ArrowUpRight className="w-5 h-5 text-primary shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </Link>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {PILLARS.map((pillar) => {
          const progress = pillarCompletion(pillar, client);
          const complete = progress.pct === 100;
          return (
            <Link key={pillar.id} href={`/blueprint/${pillar.id}`}>
              <Card className="group h-full border-border bg-card cursor-pointer transition-all hover:border-primary/40 hover:-translate-y-0.5">
                <CardContent className="pt-6 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className="rounded-lg bg-secondary/50 p-2.5">
                      <pillar.icon className="w-5 h-5 text-primary stroke-[1.5]" />
                    </div>
                    {complete ? (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                        <CheckCircle2 className="w-4 h-4" /> Complete
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        {progress.filled}/{progress.total}
                      </span>
                    )}
                  </div>
                  <h3 className="font-serif text-xl text-foreground">{pillar.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 flex-1">{pillar.blurb}</p>
                  <div className="mt-4 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-700 ease-out"
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
