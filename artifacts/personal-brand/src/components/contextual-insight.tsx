import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAssistantInsights,
  getGetAssistantInsightsQueryKey,
  useDismissAssistantInsight,
} from "@workspace/api-client-react";
import type { AssistantInsight } from "@workspace/api-client-react";
import { GraduationCap, X } from "lucide-react";
import { Link } from "wouter";
import { LEARN_PILLAR_BY_ID, fallbackInsightFor } from "@/lib/learn";
import { cn } from "@/lib/utils";

// A dismissible, journey-aware educational card that surfaces the strategist's
// live insights for a given page context. Falls back to a static, pillar-
// threaded note so a card always appears even before the scheduler has run.
// Live insights are dismissed server-side; the static fallback is dismissed
// locally for the session.
export function ContextualInsight({
  context,
  className,
}: {
  context: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [localDismissed, setLocalDismissed] = useState(false);
  const dismiss = useDismissAssistantInsight();

  const { data: insights } = useGetAssistantInsights({
    query: { queryKey: getGetAssistantInsightsQueryKey(), retry: false },
  });

  const match: AssistantInsight | undefined = useMemo(() => {
    if (!insights || insights.length === 0) return undefined;
    const relevant = insights.filter(
      (i) => i.contexts.includes(context as never) || i.contexts.includes("general"),
    );
    if (relevant.length === 0) return undefined;
    // Rotate by day so the same card does not show forever, but stays stable
    // within a session.
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    return relevant[dayIndex % relevant.length];
  }, [insights, context]);

  if (localDismissed) return null;

  const pillarId = match ? match.pillar : fallbackInsightFor(context).pillar;
  const pillar = LEARN_PILLAR_BY_ID[pillarId as keyof typeof LEARN_PILLAR_BY_ID];
  const fallback = fallbackInsightFor(context);
  const title = match ? match.title : fallback.title;
  const body = match ? match.body : fallback.body;

  const handleDismiss = () => {
    setLocalDismissed(true);
    if (match) {
      dismiss.mutate(
        { insightId: match.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getGetAssistantInsightsQueryKey(),
            });
          },
        },
      );
    }
  };

  return (
    <div
      className={cn(
        "relative rounded-xl border border-primary/30 bg-primary/5 p-5",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Dismiss insight"
        onClick={handleDismiss}
        className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 text-primary">
        <GraduationCap className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-widest">
          {pillar ? pillar.name : "Insight"}
        </span>
      </div>
      <p className="mt-2 pr-6 font-serif text-lg text-foreground">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <Link
        href="/learn"
        className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
      >
        Learn more in the Learn hub
      </Link>
    </div>
  );
}
