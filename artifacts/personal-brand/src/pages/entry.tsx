import { useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { useGetClient, useAutoRefreshAudit } from "@workspace/api-client-react";
import { getGetClientQueryKey } from "@workspace/api-client-react";
import { useActiveClient, consumeSignupIntent } from "@/lib/active-client";
import { Loader2 } from "lucide-react";

export default function Entry() {
  const [, setLocation] = useLocation();
  const { context, isLoading: ctxLoading } = useActiveClient();
  const { data: client, isLoading, isError } = useGetClient({
    query: {
      queryKey: getGetClientQueryKey(),
      retry: false,
    }
  });

  // Fire-and-forget staleness check on sign-in. The server only starts a fresh
  // audit if the latest one is 14+ days old; this never blocks the redirect.
  const autoRefresh = useAutoRefreshAudit();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (triggeredRef.current) return;
    if (client && client.onboardingComplete) {
      triggeredRef.current = true;
      autoRefresh.mutate(undefined, {
        onError: () => {
          // Best-effort only; never surfaced to the user.
        },
      });
    }
  }, [isLoading, client, autoRefresh]);

  const routedRef = useRef(false);

  useEffect(() => {
    if (isLoading || ctxLoading) return;
    if (routedRef.current) return;

    // Agency operators (existing members/owners) without a personal brand land
    // on the agency hub.
    if (
      context &&
      context.personalClientId == null &&
      context.agencies.length > 0
    ) {
      routedRef.current = true;
      setLocation("/agency");
      return;
    }

    // A fresh sign-up that came through the "For agencies" path, with no profile
    // or agency yet, goes to the agency hub to create one. The explicit
    // ?create=1 marks this as a deliberate create flow so the hub shows the
    // create-agency surface instead of bouncing back to the dashboard.
    if (
      context &&
      context.personalClientId == null &&
      context.agencies.length === 0 &&
      (isError || !client) &&
      consumeSignupIntent() === "agency"
    ) {
      routedRef.current = true;
      setLocation("/agency?create=1");
      return;
    }

    routedRef.current = true;
    if (isError || !client) {
      setLocation("/onboard");
    } else if (!client.onboardingComplete) {
      setLocation("/onboard");
    } else {
      setLocation("/dashboard");
    }
  }, [isLoading, ctxLoading, context, isError, client, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 animate-pulse text-muted-foreground">
        <span className="font-serif text-4xl">arc</span>
        <Loader2 className="w-6 h-6 animate-spin opacity-50" />
      </div>
    </div>
  );
}
