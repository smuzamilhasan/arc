import { useState } from "react";
import { useLocation } from "wouter";
import { UserProfile, useClerk } from "@clerk/react";
import {
  Loader2,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Building2,
  ArrowRight,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveClient } from "@/lib/active-client";
import {
  useDeleteAccount,
  useListConnections,
  useListSchedulerProviders,
  useSaveConnection,
  useDeleteConnection,
  getListConnectionsQueryKey,
  getListSchedulerProvidersQueryKey,
} from "@workspace/api-client-react";
import type { SchedulerConnection, SchedulerProviderMeta } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function getApiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { data?: unknown })?.data;
  if (data && typeof data === "object" && "error" in data) {
    const msg = (data as { error?: unknown }).error;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

function ProviderCard({
  provider,
  connection,
}: {
  provider: SchedulerProviderMeta;
  connection?: SchedulerConnection;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const saveConnection = useSaveConnection();
  const deleteConnection = useDeleteConnection();
  const connected = Boolean(connection?.connected);

  const handleConnect = () => {
    if (!apiKey.trim()) return;
    saveConnection.mutate(
      { data: { provider: provider.id, apiKey: apiKey.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
          setApiKey("");
          toast({
            title: `Connected to ${provider.label}`,
            description: "Your API key was verified and stored securely.",
          });
        },
        onError: (err) => {
          toast({
            title: `Could not connect to ${provider.label}`,
            description: getApiErrorMessage(err, "Check the API key and try again."),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDisconnect = () => {
    deleteConnection.mutate(
      { provider: provider.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
          setConfirmDisconnect(false);
          toast({
            title: `Disconnected from ${provider.label}`,
            description: "Your stored API key has been removed.",
          });
        },
        onError: () => {
          toast({ title: "Could not disconnect", variant: "destructive" });
        },
      },
    );
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-serif text-2xl font-normal flex items-center gap-2">
              {provider.label}
              {connected && (
                <span className="inline-flex items-center gap-1 text-xs font-sans font-medium text-primary uppercase tracking-widest">
                  <CheckCircle2 className="w-4 h-4" />
                  Connected
                </span>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              {provider.supportsApi
                ? "Push planned posts straight into your own account. arc never publishes for you."
                : "No direct API — use the plan export to import posts manually."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected ? (
          <div className="flex flex-col gap-4">
            <div className="text-sm text-muted-foreground">
              {connection?.accountRef ? (
                <span>Linked account: {connection.accountRef}</span>
              ) : (
                <span>Your API key is stored securely and never shown again.</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                className="gap-2 text-destructive hover:text-destructive"
                onClick={() => setConfirmDisconnect(true)}
                disabled={deleteConnection.isPending}
              >
                {deleteConnection.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Disconnect
              </Button>
              <span className="text-xs text-muted-foreground">
                Disconnecting removes the stored key. You can reconnect anytime.
              </span>
            </div>
          </div>
        ) : provider.supportsApi ? (
          <div className="flex flex-col gap-3">
            <label className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              {provider.label} API key
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="password"
                autoComplete="off"
                placeholder="Paste your API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="bg-card border-border/50"
              />
              <Button
                onClick={handleConnect}
                disabled={!apiKey.trim() || saveConnection.isPending}
                className="gap-2 shrink-0"
              >
                {saveConnection.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Connect
              </Button>
            </div>
            {provider.apiKeyUrl && (
              <a
                href={provider.apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-fit"
              >
                Where do I find my API key?
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This tool has no public API. Use Export plan on the Content or Calendar pages to
            download your posts and import them manually.
          </p>
        )}
      </CardContent>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl">
              Disconnect {provider.label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes your stored API key from arc. Posts already sent to {provider.label}
              stay there — this only stops future hand-offs until you reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteConnection.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDisconnect();
              }}
              disabled={deleteConnection.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteConnection.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Disconnecting
                </>
              ) : (
                "Disconnect"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SchedulerConnections() {
  const { data: providers = [], isLoading: providersLoading } = useListSchedulerProviders({
    query: { queryKey: getListSchedulerProvidersQueryKey(), retry: false },
  });
  const { data: connections = [], isLoading: connectionsLoading } = useListConnections({
    query: { queryKey: getListConnectionsQueryKey(), retry: false },
  });

  const connectionByProvider = new Map(connections.map((c) => [c.provider, c]));
  const loading = providersLoading || connectionsLoading;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-foreground">Scheduler connection</h2>
        <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
          Connect your own scheduling tool to push planned posts into it. You paste your own API
          key; arc stores it encrypted and hands posts off to your account. arc never publishes on
          your behalf — your scheduler stays in control of going live.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-6">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              connection={connectionByProvider.get(provider.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StartAgency() {
  const [, setLocation] = useLocation();
  const { hasAgency } = useActiveClient();

  // Individuals can deliberately opt into the agency track from here. Once they
  // belong to an agency, this entry point disappears and the Agency nav takes
  // over.
  if (hasAgency) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 md:p-8">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary stroke-[1.5]" />
        <h2 className="font-serif text-2xl text-foreground">Start an agency</h2>
      </div>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground leading-relaxed">
        Managing brands for more than just yourself? Create an agency to manage
        multiple clients and invite teammates. Your individual profile stays
        exactly as it is.
      </p>
      <button
        onClick={() => setLocation("/agency?create=1")}
        className="group mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors duration-300 hover:bg-secondary/40"
      >
        Create an agency
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const { mutate, isPending } = useDeleteAccount();

  const handleDelete = () => {
    mutate(undefined, {
      onSuccess: async () => {
        await queryClient.clear();
        await signOut({ redirectUrl: basePath || "/" });
      },
      onError: () => {
        toast({
          title: "Could not delete account",
          description:
            "Something went wrong while deleting your account. Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 md:p-8">
      <h2 className="font-serif text-2xl text-foreground">Delete account</h2>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Permanently delete your account along with your profile, presence audit,
        narrative, posts, and ideas. This removes your sign-in entirely and
        cannot be undone.
      </p>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <button className="mt-5 inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-background px-4 py-2.5 text-sm font-medium text-destructive transition-colors duration-300 hover:bg-destructive/10">
            <Trash2 className="h-4 w-4 stroke-[1.5]" />
            Delete my account
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl">
              Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently erases your account and all associated data —
              profile, presence audit, narrative, posts, and ideas. You will be
              signed out immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting
                </>
              ) : (
                "Delete account"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Account() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-serif text-4xl tracking-tight text-foreground">
          Account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your email, password, and connected sign-in methods.
        </p>
      </div>

      <UserProfile
        routing="hash"
        appearance={{
          elements: {
            rootBox: "w-full",
            cardBox:
              "w-full max-w-full shadow-none border border-border/60 rounded-2xl bg-card",
            navbar: "border-r border-border/50",
          },
        }}
      />

      <SchedulerConnections />

      <StartAgency />

      <DeleteAccount />
    </div>
  );
}
