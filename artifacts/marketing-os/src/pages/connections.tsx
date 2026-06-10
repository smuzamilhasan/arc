import { useState } from "react";
import { 
  useListMarketingConnections, 
  useListMarketingConnectors,
  useSaveMarketingConnection, 
  useDeleteMarketingConnection,
  useResetMarketingData,
  useGetTypeformStatus,
  useListTypeformForms,
  useListTypeformFields,
  useListMarketingFormSources,
  useSaveMarketingFormSource,
  useDeleteMarketingFormSource,
  useSyncMarketingFormSource,
  getListMarketingConnectionsQueryKey,
  getListMarketingConnectorsQueryKey,
  getGetMarketingDashboardQueryKey,
  getListMarketingLeadsQueryKey,
  getListMarketingActionsQueryKey,
  getListMarketingActivityQueryKey,
  getListMarketingFormSourcesQueryKey,
  getListTypeformFormsQueryKey,
  getListTypeformFieldsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, AlertCircle, Link as LinkIcon, Mail, Trash2, FileText, RefreshCw, Plug } from "lucide-react";

export default function Connections() {
  const { data: connections, isLoading } = useListMarketingConnections();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const resendConn = connections?.find(c => c.provider === 'resend');
  const calendlyConn = connections?.find(c => c.provider === 'calendly');

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1">Connect external services to power the Marketing OS pipeline.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ResendConnectionCard connection={resendConn} />
        <CalendlyConnectionCard connection={calendlyConn} />
      </div>

      <MarketingToolsSection />

      <LeadSourcesSection />

      <DangerZoneCard />
    </div>
  );
}

function DangerZoneCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const resetData = useResetMarketingData();

  const handleReset = () => {
    resetData.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Marketing data reset", description: "All leads, proposals, and activity have been removed." });
        qc.invalidateQueries({ queryKey: getGetMarketingDashboardQueryKey() });
        qc.invalidateQueries({ queryKey: getListMarketingLeadsQueryKey() });
        qc.invalidateQueries({ queryKey: getListMarketingActionsQueryKey() });
        qc.invalidateQueries({ queryKey: getListMarketingActivityQueryKey() });
        qc.invalidateQueries({ queryKey: getListMarketingConnectionsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Reset failed", description: err.message, variant: "destructive" });
      },
    });
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Permanently remove all Marketing OS data — every lead, proposal, connection, and activity record. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardFooter className="bg-destructive/5 border-t border-destructive/20 px-6 py-4 flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 gap-2" disabled={resetData.isPending}>
              <Trash2 size={16} /> {resetData.isPending ? "Resetting..." : "Reset All Data"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all marketing data?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes every lead, proposal, connection, and activity record for the funnel. This action is permanent and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleReset}>
                Reset everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

function ResendConnectionCard({ connection }: { connection: any }) {
  const [apiKey, setApiKey] = useState("");
  const [isEditing, setIsEditing] = useState(!connection?.connected);
  
  const qc = useQueryClient();
  const { toast } = useToast();
  const saveConnection = useSaveMarketingConnection();
  const deleteConnection = useDeleteMarketingConnection();

  const handleSave = () => {
    if (!apiKey) return;
    saveConnection.mutate({
      data: { provider: 'resend', apiKey }
    }, {
      onSuccess: () => {
        toast({ title: "Resend connected successfully" });
        setApiKey("");
        setIsEditing(false);
        qc.invalidateQueries({ queryKey: getListMarketingConnectionsQueryKey() });
      },
      onError: (err: any) => {
        toast({ 
          title: "Connection failed", 
          description: err.message, 
          variant: "destructive" 
        });
      }
    });
  };

  const handleDisconnect = () => {
    deleteConnection.mutate({ provider: 'resend' }, {
      onSuccess: () => {
        toast({ title: "Resend disconnected" });
        setIsEditing(true);
        qc.invalidateQueries({ queryKey: getListMarketingConnectionsQueryKey() });
      }
    });
  };

  return (
    <Card className={connection?.connected ? "border-primary/20 shadow-sm" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-white">
              <Mail size={20} />
            </div>
            <div>
              <CardTitle className="text-lg">Resend</CardTitle>
              <CardDescription>Email delivery</CardDescription>
            </div>
          </div>
          {connection?.connected ? (
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1.5">
              <CheckCircle2 size={12} /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
              <AlertCircle size={12} /> Not Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-6">
          Marketing OS uses Resend to deliver approved outreach emails. We securely store your API key and never display it.
        </p>
        
        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resend-api">API Key</Label>
              <Input 
                id="resend-api" 
                type="password" 
                placeholder="re_..." 
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="bg-muted/30 rounded-lg p-4 flex items-center justify-between border border-border/50">
            <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
              <span>re_</span>
              <span>••••••••••••••••••••••••</span>
            </div>
            <span className="text-xs text-muted-foreground">Encrypted</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="bg-muted/10 border-t border-border/50 px-6 py-4 flex justify-between">
        {isEditing ? (
          <>
            {connection?.connected ? (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
            ) : <div />}
            <Button size="sm" onClick={handleSave} disabled={!apiKey || saveConnection.isPending}>
              {saveConnection.isPending ? "Connecting..." : "Connect Account"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDisconnect} disabled={deleteConnection.isPending}>
              Disconnect
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Update Key
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

function CalendlyConnectionCard({ connection }: { connection: any }) {
  const [bookingUrl, setBookingUrl] = useState(connection?.bookingUrl || "");
  const [isEditing, setIsEditing] = useState(!connection?.connected);
  
  const qc = useQueryClient();
  const { toast } = useToast();
  const saveConnection = useSaveMarketingConnection();
  const deleteConnection = useDeleteMarketingConnection();

  const handleSave = () => {
    if (!bookingUrl) return;
    saveConnection.mutate({
      data: { provider: 'calendly', bookingUrl, apiKey: 'not_needed' }
    }, {
      onSuccess: () => {
        toast({ title: "Calendly connected successfully" });
        setIsEditing(false);
        qc.invalidateQueries({ queryKey: getListMarketingConnectionsQueryKey() });
      },
      onError: (err: any) => {
        toast({ 
          title: "Connection failed", 
          description: err.message, 
          variant: "destructive" 
        });
      }
    });
  };

  const handleDisconnect = () => {
    deleteConnection.mutate({ provider: 'calendly' }, {
      onSuccess: () => {
        toast({ title: "Calendly disconnected" });
        setBookingUrl("");
        setIsEditing(true);
        qc.invalidateQueries({ queryKey: getListMarketingConnectionsQueryKey() });
      }
    });
  };

  return (
    <Card className={connection?.connected ? "border-primary/20 shadow-sm" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
              <LinkIcon size={20} />
            </div>
            <div>
              <CardTitle className="text-lg">Calendly</CardTitle>
              <CardDescription>Meeting booking</CardDescription>
            </div>
          </div>
          {connection?.connected ? (
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1.5">
              <CheckCircle2 size={12} /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
              <AlertCircle size={12} /> Not Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-6">
          High-fit leads will receive this booking link automatically. Simply paste your public Calendly URL.
        </p>
        
        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="calendly-url">Booking URL</Label>
              <Input 
                id="calendly-url" 
                type="url" 
                placeholder="https://calendly.com/your-name/30min" 
                value={bookingUrl}
                onChange={e => setBookingUrl(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
            <div className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wider">Active Link</div>
            <a href={connection.bookingUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline font-medium break-all flex items-center gap-1.5">
              {connection.bookingUrl}
            </a>
          </div>
        )}
      </CardContent>
      <CardFooter className="bg-muted/10 border-t border-border/50 px-6 py-4 flex justify-between">
        {isEditing ? (
          <>
            {connection?.connected ? (
              <Button variant="ghost" size="sm" onClick={() => {
                setBookingUrl(connection.bookingUrl || "");
                setIsEditing(false);
              }}>Cancel</Button>
            ) : <div />}
            <Button size="sm" onClick={handleSave} disabled={!bookingUrl || saveConnection.isPending}>
              {saveConnection.isPending ? "Saving..." : "Save Link"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDisconnect} disabled={deleteConnection.isPending}>
              Disconnect
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Edit Link
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
function MarketingToolsSection() {
  // BYO-key tools the control plane orchestrates, beyond Resend (which has its
  // own card above). Driven by the connector registry so status, labels, and
  // account-ref requirements stay server-authoritative.
  const { data: connectors, isLoading } = useListMarketingConnectors();
  const tools = (connectors ?? []).filter(
    (c: any) => c.authType === "byokey" && c.id !== "resend",
  );

  if (isLoading) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-bold tracking-tight">Marketing stack</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Connect the tools the control plane provisions and orchestrates. Keys are encrypted and never displayed.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {tools.map((c: any) => (
          <ByoKeyConnectionCard key={c.id} connector={c} />
        ))}
      </div>
    </div>
  );
}

function ByoKeyConnectionCard({ connector }: { connector: any }) {
  const [apiKey, setApiKey] = useState("");
  const [accountRef, setAccountRef] = useState(connector?.accountRef || "");
  const [isEditing, setIsEditing] = useState(!connector?.connected);

  const qc = useQueryClient();
  const { toast } = useToast();
  const saveConnection = useSaveMarketingConnection();
  const deleteConnection = useDeleteMarketingConnection();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListMarketingConnectorsQueryKey() });
    qc.invalidateQueries({ queryKey: getListMarketingConnectionsQueryKey() });
  };

  const needsRef = Boolean(connector.accountRefRequired);

  const handleSave = () => {
    if (!apiKey && !connector.connected) return;
    if (needsRef && !accountRef) return;
    saveConnection.mutate(
      {
        data: {
          provider: connector.id,
          ...(apiKey ? { apiKey } : {}),
          ...(needsRef ? { accountRef } : {}),
        },
      },
      {
        onSuccess: () => {
          toast({ title: `${connector.label} connected` });
          setApiKey("");
          setIsEditing(false);
          invalidate();
        },
        onError: (err: any) =>
          toast({ title: "Connection failed", description: err.message, variant: "destructive" }),
      },
    );
  };

  const handleDisconnect = () => {
    deleteConnection.mutate(
      { provider: connector.id },
      {
        onSuccess: () => {
          toast({ title: `${connector.label} disconnected` });
          setApiKey("");
          setAccountRef("");
          setIsEditing(true);
          invalidate();
        },
      },
    );
  };

  return (
    <Card className={connector.connected ? "border-primary/20 shadow-sm" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white">
              <Plug size={20} />
            </div>
            <div>
              <CardTitle className="text-lg">{connector.label}</CardTitle>
              <CardDescription className="capitalize">{connector.category}</CardDescription>
            </div>
          </div>
          {connector.connected ? (
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1.5">
              <CheckCircle2 size={12} /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
              <AlertCircle size={12} /> Not Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-6">{connector.description}</p>

        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${connector.id}-api`}>API Key</Label>
              <Input
                id={`${connector.id}-api`}
                type="password"
                placeholder={connector.connected ? "Leave blank to keep current key" : "Paste your API key"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            {needsRef && (
              <div className="space-y-2">
                <Label htmlFor={`${connector.id}-ref`}>{connector.accountRefLabel || "Account reference"}</Label>
                <Input
                  id={`${connector.id}-ref`}
                  value={accountRef}
                  onChange={(e) => setAccountRef(e.target.value)}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="bg-muted/30 rounded-lg p-4 flex items-center justify-between border border-border/50">
            <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
              <span>••••••••••••••••••••••••</span>
            </div>
            <span className="text-xs text-muted-foreground">Encrypted</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="bg-muted/10 border-t border-border/50 px-6 py-4 flex justify-between">
        {isEditing ? (
          <>
            {connector.connected ? (
              <Button variant="ghost" size="sm" onClick={() => { setApiKey(""); setIsEditing(false); }}>
                Cancel
              </Button>
            ) : (
              <div />
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveConnection.isPending || (!apiKey && !connector.connected) || (needsRef && !accountRef)}
            >
              {saveConnection.isPending ? "Connecting..." : "Connect"}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDisconnect}
              disabled={deleteConnection.isPending}
            >
              Disconnect
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Update
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

function LeadSourcesSection() {
  const { data: status, isLoading: statusLoading } = useGetTypeformStatus();
  const { data: sources, isLoading: sourcesLoading } = useListMarketingFormSources();
  const connected = status?.connected ?? false;

  return (
    <Card className={connected ? "border-primary/20 shadow-sm" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white">
              <FileText size={20} />
            </div>
            <div>
              <CardTitle className="text-lg">Lead Sources</CardTitle>
              <CardDescription>Pull form submissions in as leads (Typeform)</CardDescription>
            </div>
          </div>
          {statusLoading ? (
            <Badge variant="secondary" className="gap-1.5 text-muted-foreground">Checking...</Badge>
          ) : connected ? (
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1.5">
              <CheckCircle2 size={12} /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
              <AlertCircle size={12} /> Not Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          When a Typeform form is connected, new submissions are pulled in one-way as leads and automatically scored and routed. Responses are read only; arc never edits or publishes to your forms.
        </p>

        {!connected && !statusLoading && (
          <div className="bg-muted/30 rounded-lg p-4 border border-border/50 text-sm text-muted-foreground">
            A Typeform account must be connected to this workspace before you can configure a lead source.
          </div>
        )}

        {connected && (
          <>
            <div className="space-y-3">
              {sourcesLoading ? (
                <div className="text-sm text-muted-foreground">Loading sources...</div>
              ) : sources && sources.length > 0 ? (
                sources.map((s) => <FormSourceRow key={s.id} source={s} />)
              ) : (
                <div className="text-sm text-muted-foreground">No form sources configured yet.</div>
              )}
            </div>
            <AddFormSource />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CaptureStatusBadge({
  status,
  enabled,
}: {
  status?: "registered" | "failed" | "none";
  enabled: boolean;
}) {
  // A disabled source is neither capturing instantly nor polling.
  if (!enabled) {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
        Paused
      </Badge>
    );
  }
  if (status === "registered") {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={12} />
        Instant
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 border-destructive/40 text-destructive">
        <AlertCircle size={12} />
        Instant capture failed
      </Badge>
    );
  }
  // "none": no webhook (e.g. no secret configured) — leads still arrive on the
  // periodic poll, just not instantly.
  return (
    <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
      Polling only
    </Badge>
  );
}

function FormSourceRow({ source }: { source: any }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const saveSource = useSaveMarketingFormSource();
  const deleteSource = useDeleteMarketingFormSource();
  const syncSource = useSyncMarketingFormSource();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListMarketingFormSourcesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMarketingDashboardQueryKey() });
    qc.invalidateQueries({ queryKey: getListMarketingLeadsQueryKey() });
    qc.invalidateQueries({ queryKey: getListMarketingActivityQueryKey() });
  };

  const handleSync = () => {
    syncSource.mutate({ id: source.id }, {
      onSuccess: (result: any) => {
        toast({
          title: "Sync complete",
          description: `${result.ingested} new lead${result.ingested === 1 ? "" : "s"} ingested (${result.skipped} skipped).`,
        });
        invalidate();
      },
      onError: (err: any) => {
        toast({ title: "Sync failed", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleToggle = (enabled: boolean) => {
    saveSource.mutate({
      data: {
        formId: source.formId,
        formTitle: source.formTitle ?? undefined,
        fieldMapping: source.fieldMapping,
        enabled,
      },
    }, {
      onSuccess: () => invalidate(),
      onError: (err: any) => {
        toast({ title: "Update failed", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleRemove = () => {
    deleteSource.mutate({ id: source.id }, {
      onSuccess: () => {
        toast({ title: "Source removed" });
        invalidate();
      },
      onError: (err: any) => {
        toast({ title: "Remove failed", description: err.message, variant: "destructive" });
      },
    });
  };

  const lastSynced = source.lastSyncedAt
    ? new Date(source.lastSyncedAt).toLocaleString()
    : "Never";

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium truncate">{source.formTitle || source.formId}</div>
            <CaptureStatusBadge status={source.webhookStatus} enabled={source.enabled} />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Maps to: {source.fieldMapping?.email ? "email" : "—"}
            {source.fieldMapping?.name ? ", name" : ""}
            {source.fieldMapping?.company ? ", company" : ""}
            {source.fieldMapping?.message ? ", message" : ""}
          </div>
          {source.webhookStatus === "failed" && source.enabled && (
            <div className="text-xs text-destructive mt-1">
              Instant capture failed to set up. Toggle this source off and on, or use "Sync now", to retry.
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-1">Last synced: {lastSynced}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Switch
              checked={source.enabled}
              onCheckedChange={handleToggle}
              disabled={saveSource.isPending}
              aria-label="Enable source"
            />
            <span className="text-xs text-muted-foreground">{source.enabled ? "On" : "Off"}</span>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSync} disabled={syncSource.isPending}>
            <RefreshCw size={14} className={syncSource.isPending ? "animate-spin" : ""} />
            {syncSource.isPending ? "Syncing..." : "Sync now"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleRemove}
            disabled={deleteSource.isPending}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddFormSource() {
  const [open, setOpen] = useState(false);
  const [formId, setFormId] = useState("");
  const [emailRef, setEmailRef] = useState("");
  const [nameRef, setNameRef] = useState("");
  const [companyRef, setCompanyRef] = useState("");
  const [messageRef, setMessageRef] = useState("");

  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: forms, isLoading: formsLoading } = useListTypeformForms({
    query: { enabled: open, queryKey: getListTypeformFormsQueryKey() },
  });
  const { data: fields, isLoading: fieldsLoading } = useListTypeformFields(formId, {
    query: { enabled: !!formId, queryKey: getListTypeformFieldsQueryKey(formId) },
  });
  const saveSource = useSaveMarketingFormSource();

  const NONE = "__none__";
  const selectedForm = forms?.find((f) => f.id === formId);

  const reset = () => {
    setFormId("");
    setEmailRef("");
    setNameRef("");
    setCompanyRef("");
    setMessageRef("");
  };

  const handleSave = () => {
    if (!formId || !emailRef) return;
    saveSource.mutate({
      data: {
        formId,
        formTitle: selectedForm?.title,
        fieldMapping: {
          email: emailRef,
          name: nameRef || null,
          company: companyRef || null,
          message: messageRef || null,
        },
        enabled: true,
      },
    }, {
      onSuccess: () => {
        toast({ title: "Lead source added" });
        qc.invalidateQueries({ queryKey: getListMarketingFormSourcesQueryKey() });
        reset();
        setOpen(false);
      },
      onError: (err: any) => {
        toast({ title: "Could not add source", description: err.message, variant: "destructive" });
      },
    });
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Add lead source
      </Button>
    );
  }

  const fieldOptions = fields ?? [];

  return (
    <div className="rounded-lg border border-border/50 p-4 space-y-4">
      <div className="space-y-2">
        <Label>Form</Label>
        <Select value={formId} onValueChange={(v) => { setFormId(v); setEmailRef(""); setNameRef(""); setCompanyRef(""); setMessageRef(""); }}>
          <SelectTrigger>
            <SelectValue placeholder={formsLoading ? "Loading forms..." : "Select a form"} />
          </SelectTrigger>
          <SelectContent>
            {forms?.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {formId && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Map form fields to lead attributes
          </div>
          {fieldsLoading ? (
            <div className="text-sm text-muted-foreground">Loading fields...</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldMap label="Email (required)" value={emailRef} onChange={setEmailRef} options={fieldOptions} noneValue={NONE} allowNone={false} />
              <FieldMap label="Name" value={nameRef} onChange={setNameRef} options={fieldOptions} noneValue={NONE} allowNone />
              <FieldMap label="Company" value={companyRef} onChange={setCompanyRef} options={fieldOptions} noneValue={NONE} allowNone />
              <FieldMap label="Message" value={messageRef} onChange={setMessageRef} options={fieldOptions} noneValue={NONE} allowNone />
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!formId || !emailRef || saveSource.isPending}>
          {saveSource.isPending ? "Saving..." : "Save source"}
        </Button>
      </div>
    </div>
  );
}

function FieldMap({
  label,
  value,
  onChange,
  options,
  noneValue,
  allowNone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ ref: string; title: string; type: string }>;
  noneValue: string;
  allowNone: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value === "" ? (allowNone ? noneValue : "") : value}
        onValueChange={(v) => onChange(v === noneValue ? "" : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select field" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={noneValue}>Not mapped</SelectItem>}
          {options.map((f) => (
            <SelectItem key={f.ref} value={f.ref}>{f.title}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
