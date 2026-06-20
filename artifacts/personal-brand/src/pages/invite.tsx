import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetInvitationPreview,
  getGetInvitationPreviewQueryKey,
  useAcceptInvitation,
  getGetAgencyContextQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useActiveClient } from "@/lib/active-client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { Loader2, Building2, AlertCircle } from "lucide-react";

export default function Invite() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token ?? "";
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { setActiveClient } = useActiveClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useGetInvitationPreview(token, {
    query: {
      queryKey: getGetInvitationPreviewQueryKey(token),
      retry: false,
      enabled: Boolean(token),
    },
  });
  const { mutate: accept, isPending } = useAcceptInvitation();

  const onAccept = () => {
    setError(null);
    accept(
      { token },
      {
        onSuccess: (result) => {
          qc.invalidateQueries({ queryKey: getGetAgencyContextQueryKey() });
          if (result.kind === "client" && result.clientId != null) {
            setActiveClient(result.clientId);
            setLocation("/dashboard");
          } else {
            setLocation("/agency");
          }
        },
        onError: (err) => {
          const msg =
            err instanceof ApiError &&
            err.data &&
            typeof err.data === "object" &&
            "error" in err.data
              ? String((err.data as { error: unknown }).error)
              : "Could not accept this invitation.";
          setError(msg);
        },
      },
    );
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 shadow-lg">
        <div className="mb-6 flex justify-center">
          <Logo className="text-3xl" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError || !data ? (
          <div className="text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <h1 className="font-serif text-xl">Invitation not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This invite link is invalid or has expired.
            </p>
            <Button
              className="mt-6"
              variant="outline"
              onClick={() => setLocation("/")}
            >
              Go home
            </Button>
          </div>
        ) : data.status !== "pending" ? (
          <div className="text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h1 className="font-serif text-xl">Invitation no longer active</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This invitation has already been {data.status}.
            </p>
            <Button
              className="mt-6"
              variant="outline"
              onClick={() => setLocation("/")}
            >
              Go home
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <h1 className="font-serif text-2xl">
              Join {data.agencyName}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.kind === "member"
                ? `You've been invited to join ${data.agencyName} as a team member.`
                : data.linkExisting
                ? `${data.agencyName} has invited you to connect your arc account so they can help manage your personal brand. Accept to link your existing profile.`
                : `${data.agencyName} has prepared a personal brand profile${
                    data.clientFullName ? ` for ${data.clientFullName}` : ""
                  }. Accept to claim it as your own.`}
            </p>
            {error ? (
              <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button className="mt-6 w-full" onClick={onAccept} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Accept invitation
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
