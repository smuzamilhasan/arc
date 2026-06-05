import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPlannerMessages,
  getGetPlannerMessagesQueryKey,
  useSendPlannerMessage,
  useConfirmPlannerAction,
  useRejectPlannerAction,
  useConfirmPlannerActions,
  useRejectPlannerActions,
  useMarkPlannerSeen,
  getGetPlannerUnreadQueryKey,
  getListPostsQueryKey,
  getListIdeasQueryKey,
} from "@workspace/api-client-react";
import type { PlannerActionKind } from "@workspace/api-client-react";
import { CalendarDays } from "lucide-react";
import { AgentChat, type AgentChatConfig } from "@/components/agent-chat";

const ACTION_LABELS: Record<PlannerActionKind, string> = {
  generate_calendar: "Generate calendar",
  schedule_posts: "Schedule posts",
  reschedule_posts: "Reschedule posts",
  delete_posts: "Delete posts",
  shift_posts: "Shift posts",
};

// Every Planner action touches the calendar/posts and may add backlog ideas, so
// applying any of them should refresh both the posts and ideas queries.
const PLANNER_KEYS: readonly (readonly unknown[])[] = [
  getListPostsQueryKey(),
  getListIdeasQueryKey(),
];

async function invalidatePlanner(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of PLANNER_KEYS) {
    await queryClient.invalidateQueries({ queryKey: key });
  }
}

const plannerConfig: AgentChatConfig = {
  useMessages: () => {
    const { data, isLoading, isError } = useGetPlannerMessages({
      query: { queryKey: getGetPlannerMessagesQueryKey(), retry: false },
    });
    return { data, isLoading, isError };
  },
  useSendMessage: () => useSendPlannerMessage(),
  useConfirmAction: () => useConfirmPlannerAction(),
  useRejectAction: () => useRejectPlannerAction(),
  useConfirmActions: () => useConfirmPlannerActions(),
  useRejectActions: () => useRejectPlannerActions(),
  useMarkSeen: () => useMarkPlannerSeen(),
  messagesQueryKey: getGetPlannerMessagesQueryKey(),
  unreadQueryKey: getGetPlannerUnreadQueryKey(),
  invalidateAfterAction: async (queryClient) => {
    await invalidatePlanner(queryClient);
  },
  invalidateAfterActions: async (queryClient) => {
    await invalidatePlanner(queryClient);
  },
  actionLabels: ACTION_LABELS,
  ActionIcon: CalendarDays,
  emptyTitle: "Your content planner",
  emptyBody:
    "Ask me to build a weekly calendar, schedule your draft posts, reschedule or shift what is planned, or clear posts you no longer want. I will propose the changes for you to review and confirm before anything touches your calendar.",
  errorBody:
    "Finish your Blueprint and create a content strategy first, then the Planner can build and adjust your calendar.",
  placeholder: "Message your planner",
  rejectPlaceholder:
    "Optional: tell the Planner what to change, and it will revise.",
  sendErrorBody: "The Planner could not respond. Please try again.",
};

export default function Planner() {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col md:h-[calc(100vh-12rem)]">
      <div className="mb-6">
        <h1 className="font-serif text-3xl tracking-tight text-foreground">Planner</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan and adjust your content calendar in conversation. The Planner can build a weekly
          schedule, slot in drafts, reschedule, shift, or clear posts, and proposes every change
          for you to confirm before it is saved.
        </p>
      </div>
      <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-background">
        <AgentChat config={plannerConfig} />
      </div>
    </div>
  );
}
