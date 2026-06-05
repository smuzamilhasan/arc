import {
  useGetDashboard,
  getGetDashboardQueryKey,
  useGetPlatforms,
  getGetPlatformsQueryKey,
  useGetContentStrategy,
  getGetContentStrategyQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GraduationCap, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LEARN_PILLARS,
  LEARN_PILLAR_BY_ID,
  LEARN_CURRICULUM,
  deriveLearnStage,
  type LearnStage,
} from "@/lib/learn";

function PillarBadge({ pillarId }: { pillarId: string }) {
  const pillar = LEARN_PILLAR_BY_ID[pillarId as keyof typeof LEARN_PILLAR_BY_ID];
  if (!pillar) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-primary">
      {pillar.name}
    </span>
  );
}

export default function Learn() {
  const { data: dashboard } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey(), retry: false },
  });
  const { data: platforms } = useGetPlatforms({
    query: { queryKey: getGetPlatformsQueryKey(), retry: false },
  });
  const { data: contentStrategy } = useGetContentStrategy({
    query: { queryKey: getGetContentStrategyQueryKey(), retry: false },
  });

  const stage: LearnStage = deriveLearnStage({
    onboardingComplete: dashboard?.onboardingComplete,
    auditComplete: dashboard?.auditComplete,
    narrativeComplete: dashboard?.narrativeComplete,
    platformsComplete: Boolean(platforms),
    contentStrategyComplete: Boolean(contentStrategy),
    hasPosts: (dashboard?.totalPosts ?? 0) > 0,
  });

  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-primary">
          <GraduationCap className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-widest">Learn</span>
        </div>
        <h1 className="mt-3 font-serif text-4xl text-foreground sm:text-5xl">
          The craft of building your brand
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          arc is built on a simple belief: a world-class personal brand is a slow,
          authentic, compounding asset — and the tools should augment your judgement, never
          replace it. These are the ideas that guide every recommendation you will see.
        </p>
      </div>

      <section>
        <h2 className="font-serif text-2xl text-foreground">The five pillars</h2>
        <p className="mt-2 text-muted-foreground">
          Every piece of guidance arc gives you threads through these five ideas.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          {LEARN_PILLARS.map((pillar) => (
            <Card key={pillar.id} className="border-border/60">
              <CardHeader>
                <CardTitle className="font-serif text-xl">{pillar.name}</CardTitle>
                <CardDescription className="text-primary">{pillar.tagline}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {pillar.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h2 className="font-serif text-2xl text-foreground">Your journey</h2>
        </div>
        <p className="mt-2 text-muted-foreground">
          The arc unfolds in stages. Here is the lesson for where you are now, and a look at
          what comes next.
        </p>
        <div className="mt-6 space-y-5">
          {LEARN_CURRICULUM.map((module) => {
            const isCurrent = module.stage === stage;
            return (
              <Card
                key={module.stage}
                className={cn(
                  "border-border/60 transition-colors",
                  isCurrent && "border-primary/50 bg-primary/5",
                )}
              >
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {module.stageLabel}
                    </span>
                    {isCurrent && (
                      <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-primary-foreground">
                        You are here
                      </span>
                    )}
                  </div>
                  <CardTitle className="mt-1 font-serif text-2xl">{module.heading}</CardTitle>
                  <CardDescription className="text-base">{module.intro}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {module.lessons.map((lesson, i) => (
                    <div
                      key={i}
                      className="border-l-2 border-border/60 pl-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-foreground">{lesson.title}</h3>
                        <PillarBadge pillarId={lesson.pillar} />
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {lesson.body}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
