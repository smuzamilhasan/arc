import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAssistantUnreadQueryKey,
  getGetAssistantMessagesQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getActiveClientId } from "@/lib/active-client";

// Subscribe to the assistant SSE stream so the unread indicator updates live
// when the background strategist posts a proactive suggestion. EventSource
// cannot attach the Clerk bearer token, so we consume the stream with
// fetch + ReadableStream (mirroring the audit SSE pattern).
export function useAssistantNotifications(enabled: boolean) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const controller = new AbortController();

    const onProactive = () => {
      queryClient.invalidateQueries({ queryKey: getGetAssistantUnreadQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAssistantMessagesQueryKey() });
      toast({
        title: "Your strategist has a suggestion",
        description: "Open the strategist to review the proposed change.",
      });
    };

    const run = async () => {
      try {
        const token = await getToken();
        const activeClientId = getActiveClientId();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (activeClientId != null) {
          headers["x-arc-client-id"] = String(activeClientId);
        }
        const response = await fetch(`${import.meta.env.BASE_URL}api/assistant/stream`, {
          headers,
          signal: controller.signal,
        });
        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";
          for (const event of events) {
            const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const data = JSON.parse(dataLine.slice(6));
              if (data.type === "proactive") onProactive();
            } catch {
              // ignore malformed events
            }
          }
        }
      } catch {
        // Connection dropped or aborted; the effect re-runs on remount.
      }
    };

    run();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
