import { useState } from "react";
import { 
  useListMarketingConnections, 
  useSaveMarketingConnection, 
  useDeleteMarketingConnection,
  useResetMarketingData,
  getListMarketingConnectionsQueryKey,
  getGetMarketingDashboardQueryKey,
  getListMarketingLeadsQueryKey,
  getListMarketingActionsQueryKey,
  getListMarketingActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Link as LinkIcon, Mail, Trash2 } from "lucide-react";

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