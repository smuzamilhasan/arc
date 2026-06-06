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
} from "@workspace/api-client-react";
import type { AssistantActionKind } from "@workspace/api-client-react";
import { Sparkles } from "lucide-react";
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
};

export function AssistantChat({ className }: { className?: string }) {
  return <AgentChat config={strategistConfig} className={className} />;
}
