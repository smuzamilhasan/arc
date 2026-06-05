import { useEffect, useRef, useState } from "react";
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
import type {
  PlannerMessage,
  PlannerAction,
  PlannerActionKind,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, Send, Check, X, ArrowRight, CalendarDays } from "lucide-react";

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

function DiffCard({
  action,
  messageId,
  groupBusy = false,
}: {
  action: PlannerAction;
  messageId: number;
  groupBusy?: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showReject, setShowReject] = useState(false);
  const [comment, setComment] = useState("");
  const messagesKey = getGetPlannerMessagesQueryKey();

  const confirm = useConfirmPlannerAction();
  const reject = useRejectPlannerAction();

  const busy = confirm.isPending || reject.isPending || groupBusy;
  const resolved = action.status !== "proposed";

  const refreshAfterApply = async () => {
    await queryClient.invalidateQueries({ queryKey: messagesKey });
    await invalidatePlanner(queryClient);
  };

  const handleConfirm = () => {
    confirm.mutate(
      { actionId: action.id },
      {
        onSuccess: async () => {
          await refreshAfterApply();
          toast({ title: "Change applied", description: action.title });
        },
        onError: () => {
          toast({
            title: "Could not apply",
            description: "This change could not be applied. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleReject = () => {
    reject.mutate(
      {
        actionId: action.id,
        data: comment.trim() ? { comment: comment.trim() } : undefined,
      },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: messagesKey });
          setShowReject(false);
          setComment("");
        },
        onError: () => {
          toast({
            title: "Could not send",
            description: "Something went wrong. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div
      className={cn(
        "mt-3 rounded-lg border bg-card/60 p-4 text-sm",
        action.status === "applied" && "border-primary/40 bg-primary/5",
        action.status === "rejected" && "border-border/60 opacity-70",
        action.status === "proposed" && "border-border",
      )}
      data-message-id={messageId}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {ACTION_LABELS[action.kind] ?? action.kind}
          </span>
        </div>
        {action.status === "applied" && (
          <span className="text-xs font-medium text-primary">Applied</span>
        )}
        {action.status === "rejected" && (
          <span className="text-xs font-medium text-muted-foreground">Dismissed</span>
        )}
      </div>

      <p className="mt-2 font-medium text-foreground">{action.title}</p>
      {action.rationale && (
        <p className="mt-1 text-xs text-muted-foreground">{action.rationale}</p>
      )}

      {action.diff.length > 0 && (
        <div className="mt-3 space-y-2">
          {action.diff.map((d, i) => (
            <div key={i} className="rounded-md border border-border/50 bg-background/50 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {d.label}
              </p>
              <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                <p className="whitespace-pre-wrap text-xs text-muted-foreground line-through decoration-destructive/40">
                  {d.before || "(empty)"}
                </p>
                <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:mt-0.5 sm:block" />
                <p className="whitespace-pre-wrap text-xs text-foreground">
                  {d.after || "(empty)"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {action.status === "rejected" && action.rejectionComment && (
        <p className="mt-2 text-xs italic text-muted-foreground">
          Your note: {action.rejectionComment}
        </p>
      )}

      {!resolved && !showReject && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={handleConfirm} disabled={busy}>
            {confirm.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Confirm
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowReject(true)}
            disabled={busy}
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      )}

      {!resolved && showReject && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional: tell the Planner what to change, and it will revise."
            rows={2}
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleReject} disabled={busy}>
              {reject.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              {comment.trim() ? "Reject & revise" : "Reject"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowReject(false);
                setComment("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionGroup({
  actions,
  messageId,
}: {
  actions: PlannerAction[];
  messageId: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messagesKey = getGetPlannerMessagesQueryKey();
  const confirmAll = useConfirmPlannerActions();
  const rejectAll = useRejectPlannerActions();

  const proposed = actions.filter((a) => a.status === "proposed");
  const showGroup = proposed.length >= 2;
  const busy = confirmAll.isPending || rejectAll.isPending;

  const handleConfirmAll = () => {
    const ids = proposed.map((a) => a.id);
    if (ids.length === 0) return;
    confirmAll.mutate(
      { data: { actionIds: ids } },
      {
        onSuccess: async (result) => {
          await queryClient.invalidateQueries({ queryKey: messagesKey });
          await invalidatePlanner(queryClient);
          const applied = result.actions.filter((a) => a.status === "applied").length;
          toast({
            title: "Changes applied",
            description:
              applied === ids.length
                ? `All ${applied} changes applied.`
                : `${applied} of ${ids.length} applied; the rest could not be.`,
          });
        },
        onError: () => {
          toast({
            title: "Could not apply",
            description: "These changes could not be applied. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleRejectAll = () => {
    const ids = proposed.map((a) => a.id);
    if (ids.length === 0) return;
    rejectAll.mutate(
      { data: { actionIds: ids } },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: messagesKey });
        },
        onError: () => {
          toast({
            title: "Could not dismiss",
            description: "Something went wrong. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="w-full max-w-[95%]">
      {showGroup && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/60 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {proposed.length} proposed changes
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleConfirmAll} disabled={busy}>
              {confirmAll.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Confirm all
            </Button>
            <Button size="sm" variant="outline" onClick={handleRejectAll} disabled={busy}>
              {rejectAll.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Reject all
            </Button>
          </div>
        </div>
      )}
      {actions.map((action) => (
        <DiffCard key={action.id} action={action} messageId={messageId} groupBusy={busy} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: PlannerMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary/50 text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
      </div>
      {!isUser && message.actions.length > 0 && (
        <ActionGroup actions={message.actions} messageId={message.id} />
      )}
    </div>
  );
}

function PlannerChat({ className }: { className?: string }) {
  const { data: messages, isLoading, isError } = useGetPlannerMessages({
    query: { queryKey: getGetPlannerMessagesQueryKey(), retry: false },
  });
  const send = useSendPlannerMessage();
  const markSeen = useMarkPlannerSeen();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesKey = getGetPlannerMessagesQueryKey();
  const markSeenMutate = markSeen.mutate;

  // Viewing the Planner clears any unread Manager hand-offs waiting here.
  useEffect(() => {
    markSeenMutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPlannerUnreadQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPlannerMessagesQueryKey() });
      },
    });
  }, [markSeenMutate, queryClient]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, send.isPending]);

  const handleSend = () => {
    const content = input.trim();
    if (!content || send.isPending) return;
    setInput("");
    send.mutate(
      { data: { content } },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: messagesKey });
        },
        onError: () => {
          toast({
            title: "Could not send",
            description: "The Planner could not respond. Please try again.",
            variant: "destructive",
          });
          setInput(content);
        },
      },
    );
  };

  const hasMessages = messages && messages.length > 0;

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex h-full flex-col gap-4 px-4 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading conversation
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-border bg-card/60 p-4 text-sm text-muted-foreground">
              Finish your Blueprint and create a content strategy first, then the Planner can
              build and adjust your calendar.
            </div>
          )}

          {!isLoading && !isError && !hasMessages && (
            <div className="rounded-lg border border-border bg-card/60 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Your content planner</p>
              <p className="mt-1">
                Ask me to build a weekly calendar, schedule your draft posts, reschedule or shift
                what is planned, or clear posts you no longer want. I will propose the changes for
                you to review and confirm before anything touches your calendar.
              </p>
            </div>
          )}

          {messages?.map((m) => <MessageBubble key={m.id} message={m} />)}

          {send.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border/60 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message your planner"
            rows={1}
            disabled={isError}
            className="max-h-32 min-h-[2.5rem] resize-none text-sm"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={send.isPending || !input.trim() || isError}
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

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
        <PlannerChat />
      </div>
    </div>
  );
}
