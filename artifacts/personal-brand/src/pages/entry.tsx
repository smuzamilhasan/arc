import { useLocation } from "wouter";
import { useEffect, useRef } from "react";
import {
  useGetClient,
  useAutoRefreshAudit,
  ApiError,
} from "@workspace/api-client-react";
import { getGetClientQueryKey } from "@workspace/api-client-react";
import {
  useActiveClient,
  consumeSignupIntent,
  consumePendingInvite,
} from "@/lib/active-client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Entry() {
  const [, setLocation] = useLocation();
  const { context, isLoading: ctxLoading } = useActiveClient();
  const {
    data: client,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useGetClient({
    query: {
      queryKey: getGetClientQueryKey(),
      // A confirmed 404 ("no profile yet") is a real answer — never retry it, so
      // genuinely new users fall through to onboarding promptly. Any other error
      // (network blip, a 401 from a session that isn't ready yet, or a 5xx) is
      // treated as transient and retried so a returning user is not bounced into
      // onboarding by a momentary hiccup.
      retry: (failureCount, err) => {
        if (err instanceof ApiError && err.status === 404) return false;
        return failureCount < 3;
      },
    },
  });

  // Distinguish "server confirms no profile (404)" from "couldn't load the
  // profile yet (transient/auth error)". Only the former should send the user to
  // onboarding; the latter shows a retry state.
  const noProfile = isError && error instanceof ApiError && error.status === 404;
  const loadFailed = isError && !noProfile;

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
    // A transient failure to load the profile must not be interpreted as "new
    // user". Hold here (showing a retry state) without consuming intents or
    // routing; once a retry succeeds this effect re-runs and routes correctly.
    if (loadFailed) return;
    if (routedRef.current) return;
    routedRef.current = true;

    // An invite deep-link that survived sign-in/up takes top priority: resume
    // the accept flow before any default routing.
    const pendingInvite = consumePendingInvite();
    if (pendingInvite) {
      setLocation(`/invite/${pendingInvite}`);
      return;
    }

    // Consume the pending sign-up intent exactly once.
    const intent = consumeSignupIntent();
    const hasAgency = Boolean(context && context.agencies.length > 0);

    // Agency operators (existing members/owners) without a personal brand land
    // on the agency hub.
    if (context && context.personalClientId == null && hasAgency) {
      setLocation("/agency");
      return;
    }

    // Anyone who came through the "For agencies" path and is not already in an
    // agency is sent straight to the create-agency surface — even if they
    // already have a personal profile. The explicit ?create=1 tells the hub to
    // show the create form instead of bouncing back to the dashboard.
    if (intent === "agency" && !hasAgency) {
      setLocation("/agency?create=1");
      return;
    }

    // Only route to onboarding when the server actually confirms there is no
    // profile (404) or returned an empty/incomplete one. Transient failures are
    // handled above and never reach here.
    if (noProfile || !client) {
      setLocation("/onboard");
    } else if (!client.onboardingComplete) {
      setLocation("/onboard");
    } else {
      setLocation("/dashboard");
    }
  }, [
    isLoading,
    ctxLoading,
    context,
    loadFailed,
    noProfile,
    client,
    setLocation,
  ]);

  if (loadFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="flex flex-col items-center gap-6 text-center max-w-sm">
          <span className="font-serif text-4xl">arc</span>
          <p className="text-muted-foreground">
            We couldn&apos;t load your account just now. This is usually
            temporary.
          </p>
          <Button onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Retrying
              </>
            ) : (
              "Try again"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 animate-pulse text-muted-foreground">
        <span className="font-serif text-4xl">arc</span>
        <Loader2 className="w-6 h-6 animate-spin opacity-50" />
      </div>
    </div>
  );
}
