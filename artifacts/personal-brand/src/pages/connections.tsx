import { useState } from "react";
import {
  useListConnections,
  useListSchedulerProviders,
  useSaveConnection,
  useDeleteConnection,
  getListConnectionsQueryKey,
  getListSchedulerProvidersQueryKey,
} from "@workspace/api-client-react";
import type { SchedulerConnection, SchedulerProviderMeta } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
} from "@/components/ui/alert-dialog";
import { Loader2, Plug, CheckCircle2, ExternalLink, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

export default function Connections() {
  const { data: providers = [], isLoading: providersLoading } = useListSchedulerProviders({
    query: { queryKey: getListSchedulerProvidersQueryKey(), retry: false },
  });
  const { data: connections = [], isLoading: connectionsLoading } = useListConnections({
    query: { queryKey: getListConnectionsQueryKey(), retry: false },
  });

  const connectionByProvider = new Map(connections.map((c) => [c.provider, c]));
  const loading = providersLoading || connectionsLoading;

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Plug className="w-6 h-6 text-primary stroke-[1.5]" />
          <h1 className="font-serif text-4xl font-normal">Connections</h1>
        </div>
        <p className="text-muted-foreground max-w-2xl leading-relaxed">
          Connect your own scheduling tool to push planned posts into it. You paste your own API
          key; arc stores it encrypted and hands posts off to your account. arc never publishes on
          your behalf — your scheduler stays in control of going live.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
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
