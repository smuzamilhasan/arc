import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Loader2, Send, Check, X, ArrowRight, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Shared, agent-agnostic chat shell used by both the Strategist and the Planner.
// The two surfaces are identical chat UIs that historically drifted apart; they
// now both render through this component so they can no longer diverge. Each
// agent supplies its own data hooks, copy, and query invalidations via config.

export type AgentActionStatus = "proposed" | "applied" | "rejected";

export interface AgentDiffItem {
  label: string;
  before: string;
  after: string;
}

export interface AgentAction {
  id: string;
  kind: string;
  title: string;
  rationale: string;
  status: AgentActionStatus;
  rejectionComment?: string | null;
  diff: AgentDiffItem[];
  payload?: { [key: string]: unknown } | null;
}

export interface AgentMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  actions: AgentAction[];
  seen: boolean;
  createdAt: string;
}

interface MutateOpts<TData> {
  onSuccess?: (data: TData) => void | Promise<void>;
  onError?: (err: unknown) => void;
}

export interface AgentMutation<TVars, TData = unknown> {
  mutate: (vars: TVars, opts?: MutateOpts<TData>) => void;
  isPending: boolean;
}

export interface AgentChatConfig {
  useMessages: () => {
    data: AgentMessage[] | undefined;
    isLoading: boolean;
    isError: boolean;
  };
  useSendMessage: () => AgentMutation<{ data: { content: string } }>;
  useConfirmAction: () => AgentMutation<{ actionId: string }>;
  useRejectAction: () => AgentMutation<{
    actionId: string;
    data?: { comment: string };
  }>;
  useConfirmActions: () => AgentMutation<
    { data: { actionIds: string[] } },
    { actions: AgentAction[] }
  >;
  useRejectActions: () => AgentMutation<{ data: { actionIds: string[] } }>;
  useMarkSeen: () => AgentMutation<void>;
  messagesQueryKey: readonly unknown[];
  unreadQueryKey: readonly unknown[];
  invalidateAfterAction: (
    queryClient: ReturnType<typeof useQueryClient>,
    action: AgentAction,
  ) => Promise<void>;
  invalidateAfterActions: (
    queryClient: ReturnType<typeof useQueryClient>,
    actions: AgentAction[],
  ) => Promise<void>;
  actionLabels: Record<string, string>;
  ActionIcon: LucideIcon;
  emptyTitle: string;
  emptyBody: string;
  errorBody: string;
  placeholder: string;
  rejectPlaceholder: string;
  sendErrorBody: string;
  topExtras?: React.ReactNode;
}

// Only the most recent exchange (user turn + reply) is shown by default; older
// history collapses behind a "Show earlier" toggle.
const RECENT_COUNT = 2;

function DiffCard({
  action,
  messageId,
  config,
  groupBusy = false,
}: {
  action: AgentAction;
  messageId: number;
  config: AgentChatConfig;
  groupBusy?: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showReject, setShowReject] = useState(false);
  const [comment, setComment] = useState("");
  const messagesKey = config.messagesQueryKey;

  const confirm = config.useConfirmAction();
  const reject = config.useRejectAction();

  const busy = confirm.isPending || reject.isPending || groupBusy;
  const resolved = action.status !== "proposed";

  const handleConfirm = () => {
    confirm.mutate(
      { actionId: action.id },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: messagesKey });
          await config.invalidateAfterAction(queryClient, action);
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

  const Icon = config.ActionIcon;

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
          <Icon className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {config.actionLabels[action.kind] ?? action.kind}
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
            placeholder={config.rejectPlaceholder}
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
  config,
}: {
  actions: AgentAction[];
  messageId: number;
  config: AgentChatConfig;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messagesKey = config.messagesQueryKey;
  const confirmAll = config.useConfirmActions();
  const rejectAll = config.useRejectActions();

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
          await config.invalidateAfterActions(queryClient, result.actions);
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
        <DiffCard
          key={action.id}
          action={action}
          messageId={messageId}
          config={config}
          groupBusy={busy}
        />
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  config,
}: {
  message: AgentMessage;
  config: AgentChatConfig;
}) {
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
        <ActionGroup actions={message.actions} messageId={message.id} config={config} />
      )}
    </div>
  );
}

export function AgentChat({
  config,
  className,
}: {
  config: AgentChatConfig;
  className?: string;
}) {
  const { data: messages, isLoading, isError } = config.useMessages();
  const send = config.useSendMessage();
  const markSeen = config.useMarkSeen();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [showEarlier, setShowEarlier] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const messagesKey = config.messagesQueryKey;
  const unreadKey = config.unreadQueryKey;
  const markSeenMutate = markSeen.mutate;

  // The chat clears any unread proactive/hand-off messages as soon as it is
  // viewed (page mount, or panel open since Radix unmounts panels on close).
  useEffect(() => {
    markSeenMutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: unreadKey });
        queryClient.invalidateQueries({ queryKey: messagesKey });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markSeenMutate, queryClient]);

  // Land on the newest content on mount and whenever a message/reply arrives.
  // Target the actual Radix ScrollArea viewport, not the inner content div, so
  // the view is pinned to the latest message instead of stuck at the top.
  useLayoutEffect(() => {
    const el = viewportRef.current;
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
            description: config.sendErrorBody,
            variant: "destructive",
          });
          setInput(content);
        },
      },
    );
  };

  const all = messages ?? [];
  const hasMessages = all.length > 0;
  const hasEarlier = all.length > RECENT_COUNT;
  const visible = showEarlier || !hasEarlier ? all : all.slice(-RECENT_COUNT);
  const earlierCount = all.length - visible.length;

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <ScrollArea className="flex-1" viewportRef={viewportRef}>
        <div className="flex min-h-full flex-col gap-4 px-4 py-4">
          {!isLoading && !isError && config.topExtras}

          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading conversation
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-border bg-card/60 p-4 text-sm text-muted-foreground">
              {config.errorBody}
            </div>
          )}

          {!isLoading && !isError && !hasMessages && (
            <div className="rounded-lg border border-border bg-card/60 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{config.emptyTitle}</p>
              <p className="mt-1">{config.emptyBody}</p>
            </div>
          )}

          {hasEarlier && !showEarlier && (
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground"
                onClick={() => setShowEarlier(true)}
              >
                <ChevronUp className="h-3.5 w-3.5" />
                Show earlier ({earlierCount})
              </Button>
            </div>
          )}

          {visible.map((m) => (
            <MessageBubble key={m.id} message={m} config={config} />
          ))}

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
            placeholder={config.placeholder}
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
