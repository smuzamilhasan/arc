import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAssistantMessages,
  getGetAssistantMessagesQueryKey,
  useSendAssistantMessage,
  useConfirmAssistantAction,
  useRejectAssistantAction,
  useConfirmAssistantActions,
  useRejectAssistantActions,
  useMarkAssistantSeen,
  getGetAssistantUnreadQueryKey,
  getGetClientQueryKey,
  getGetNarrativeQueryKey,
  getGetPlatformsQueryKey,
  getGetContentStrategyQueryKey,
  getGetDashboardQueryKey,
  useGetAssistantInsights,
  getGetAssistantInsightsQueryKey,
  useDismissAssistantInsight,
} from "@workspace/api-client-react";
import type { AssistantActionKind, AssistantInsight } from "@workspace/api-client-react";
import { LEARN_PILLAR_BY_ID } from "@/lib/learn";
import { GraduationCap, Loader2, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AgentChat,
  type AgentAction,
  type AgentChatConfig,
} from "@/components/agent-chat";

const ACTION_LABELS: Record<AssistantActionKind, string> = {
  update_profile: "Update profile",
  update_narrative: "Update narrative",
  regenerate_narrative: "Regenerate narrative",
  update_content_strategy: "Update content strategy",
  update_platforms: "Update platform strategy",
};

function queryKeysForKind(kind: string): readonly (readonly unknown[])[] {
  switch (kind) {
    case "update_profile":
      return [getGetClientQueryKey(), getGetDashboardQueryKey()];
    case "update_narrative":
    case "regenerate_narrative":
      return [getGetNarrativeQueryKey(), getGetDashboardQueryKey()];
    case "update_content_strategy":
      return [getGetContentStrategyQueryKey()];
    case "update_platforms":
      return [getGetPlatformsQueryKey()];
    default:
      return [];
  }
}

async function invalidateForKinds(
  queryClient: ReturnType<typeof useQueryClient>,
  kinds: string[],
) {
  const keys = new Map<string, readonly unknown[]>();
  for (const kind of kinds) {
    for (const key of queryKeysForKind(kind)) {
      keys.set(JSON.stringify(key), key);
    }
  }
  for (const key of keys.values()) {
    await queryClient.invalidateQueries({ queryKey: key });
  }
}

function InsightCard({ insight }: { insight: AssistantInsight }) {
  const queryClient = useQueryClient();
  const dismiss = useDismissAssistantInsight();
  const pillar = LEARN_PILLAR_BY_ID[insight.pillar as keyof typeof LEARN_PILLAR_BY_ID];

  const handleDismiss = () => {
    dismiss.mutate(
      { insightId: insight.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetAssistantInsightsQueryKey(),
          });
        },
      },
    );
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-primary">
          <GraduationCap className="h-3.5 w-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            {pillar ? pillar.name : "Insight"}
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground"
          onClick={handleDismiss}
          disabled={dismiss.isPending}
          aria-label="Dismiss insight"
        >
          {dismiss.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <p className="mt-1.5 font-medium text-foreground">{insight.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.body}</p>
    </div>
  );
}

function InsightsSection() {
  const { data: insights } = useGetAssistantInsights({
    query: { queryKey: getGetAssistantInsightsQueryKey(), retry: false },
  });

  if (!insights || insights.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Insights from your strategist
      </p>
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}

const strategistConfig: AgentChatConfig = {
  useMessages: () => {
    const { data, isLoading, isError } = useGetAssistantMessages({
      query: { queryKey: getGetAssistantMessagesQueryKey(), retry: false },
    });
    return { data, isLoading, isError };
  },
  useSendMessage: () => useSendAssistantMessage(),
  useConfirmAction: () => useConfirmAssistantAction(),
  useRejectAction: () => useRejectAssistantAction(),
  useConfirmActions: () => useConfirmAssistantActions(),
  useRejectActions: () => useRejectAssistantActions(),
  useMarkSeen: () => useMarkAssistantSeen(),
  messagesQueryKey: getGetAssistantMessagesQueryKey(),
  unreadQueryKey: getGetAssistantUnreadQueryKey(),
  invalidateAfterAction: async (queryClient, action: AgentAction) => {
    for (const key of queryKeysForKind(action.kind)) {
      await queryClient.invalidateQueries({ queryKey: key });
    }
  },
  invalidateAfterActions: async (queryClient, actions: AgentAction[]) => {
    await invalidateForKinds(
      queryClient,
      actions.map((a) => a.kind),
    );
  },
  actionLabels: ACTION_LABELS,
  ActionIcon: Sparkles,
  emptyTitle: "Your brand strategist",
  emptyBody:
    "Ask for feedback on your positioning, sharpen your narrative and point of view, or rethink your themes and platform strategy. I will propose changes you can review and confirm before anything is saved.",
  errorBody: "Complete your onboarding first to start talking with your strategist.",
  placeholder: "Message your strategist",
  rejectPlaceholder:
    "Optional: tell the assistant what to change, and it will revise.",
  sendErrorBody: "The assistant could not respond. Please try again.",
  topExtras: <InsightsSection />,
};

export function AssistantChat({ className }: { className?: string }) {
  return <AgentChat config={strategistConfig} className={className} />;
}
