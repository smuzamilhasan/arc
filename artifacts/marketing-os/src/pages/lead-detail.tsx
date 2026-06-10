import { useState } from "react";
import { useRoute, Link } from "wouter";
import { 
  useGetMarketingLead, 
  getGetMarketingLeadQueryKey,
  useQualifyMarketingLead,
  useUpdateMarketingAction,
  useApproveMarketingAction,
  useRejectMarketingAction,
  getListMarketingLeadsQueryKey,
  getListMarketingActionsQueryKey,
  getGetMarketingDashboardQueryKey,
  getListMarketingActivityQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Sparkles, Send, XCircle, Clock, Building2, Mail, ExternalLink, Activity, PencilLine, CheckCircle2, Users } from "lucide-react";

export default function LeadDetail() {
  const [, params] = useRoute("/leads/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: detail, isLoading } = useGetMarketingLead(id, {
    query: { enabled: !!id, queryKey: getGetMarketingLeadQueryKey(id) }
  });

  const qc = useQueryClient();
  const { toast } = useToast();
  
  const qualifyLead = useQualifyMarketingLead();
  const updateAction = useUpdateMarketingAction();
  const approveAction = useApproveMarketingAction();
  const rejectAction = useRejectMarketingAction();

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedBody, setEditedBody] = useState("");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!detail || !detail.lead) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <h2 className="text-2xl font-bold">Lead not found</h2>
        <p className="text-muted-foreground mt-2 mb-6">The lead you are looking for does not exist or has been removed.</p>
        <Button asChild><Link href="/leads">Back to Leads</Link></Button>
      </div>
    );
  }

  const { lead, action, activity } = detail;
  const routeAction = (detail as any).routeAction ?? null;

  const routeLabel: Record<string, string> = {
    high: "Discovery call",
    medium: "Warm nurture",
    low: "Low-touch nurture",
  };

  const invalidateLead = () => {
    qc.invalidateQueries({ queryKey: getGetMarketingLeadQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListMarketingActionsQueryKey() });
    qc.invalidateQueries({ queryKey: getListMarketingLeadsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMarketingDashboardQueryKey() });
  };

  const handleApproveRoute = () => {
    if (!routeAction) return;
    approveAction.mutate({ id: routeAction.id }, {
      onSuccess: () => {
        toast({ title: "Route approved", description: "The lead has advanced to the next stage." });
        invalidateLead();
      },
    });
  };

  const handleRejectRoute = () => {
    if (!routeAction) return;
    rejectAction.mutate({ id: routeAction.id }, {
      onSuccess: () => {
        toast({ title: "Route rejected" });
        invalidateLead();
      },
    });
  };

  const handleQualify = () => {
    qualifyLead.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "AI Qualification Complete" });
        qc.invalidateQueries({ queryKey: getGetMarketingLeadQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListMarketingLeadsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMarketingDashboardQueryKey() });
        qc.invalidateQueries({ queryKey: getListMarketingActivityQueryKey() });
      },
      onError: (err: any) => {
        toast({ 
          title: "Qualification Failed", 
          description: err.message || "An error occurred during AI scoring.",
          variant: "destructive" 
        });
      }
    });
  };

  const handleSaveEmailEdit = () => {
    if (!action) return;
    updateAction.mutate({ 
      id: action.id, 
      data: { emailSubject: editedSubject, emailBody: editedBody } 
    }, {
      onSuccess: () => {
        toast({ title: "Draft updated" });
        setIsEditingEmail(false);
        qc.invalidateQueries({ queryKey: getGetMarketingLeadQueryKey(id) });
      }
    });
  };

  const handleApprove = () => {
    if (!action) return;
    approveAction.mutate({ id: action.id }, {
      onSuccess: () => {
        toast({ title: "Email approved and sent" });
        qc.invalidateQueries({ queryKey: getGetMarketingLeadQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListMarketingActionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMarketingDashboardQueryKey() });
      }
    });
  };

  const handleReject = () => {
    if (!action) return;
    rejectAction.mutate({ id: action.id }, {
      onSuccess: () => {
        toast({ title: "Draft rejected" });
        qc.invalidateQueries({ queryKey: getGetMarketingLeadQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListMarketingActionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMarketingDashboardQueryKey() });
      }
    });
  };

  const startEditing = () => {
    if (action) {
      setEditedSubject(action.emailSubject || "");
      setEditedBody(action.emailBody || "");
      setIsEditingEmail(true);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-full">
          <Link href="/leads"><ArrowLeft size={18} /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-serif text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
            {lead.name || lead.email}
            {lead.fitTier === "high" && <Badge className="bg-primary">High Fit</Badge>}
            {lead.fitTier === "medium" && <Badge className="bg-chart-4 text-black">Medium Fit</Badge>}
            {lead.fitTier === "low" && <Badge variant="outline">Low Fit</Badge>}
          </h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-4">
            <span className="flex items-center gap-1.5"><Mail size={14} /> {lead.email}</span>
            {lead.company && <span className="flex items-center gap-1.5"><Building2 size={14} /> {lead.company}</span>}
          </p>
        </div>
        <div className="text-right">
          <Badge variant="outline" className="text-xs uppercase tracking-wider">{lead.status}</Badge>
          <p className="text-xs text-muted-foreground mt-1">Captured {format(new Date(lead.createdAt), "MMM d, yyyy")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Lead Context & Proposal */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Clock size={16} /> Inbound Context
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/30 rounded-md p-4 text-sm whitespace-pre-wrap font-serif leading-relaxed">
                {lead.message ? `"${lead.message}"` : <span className="italic text-muted-foreground">No message provided.</span>}
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Source:</span> {lead.source}
              </div>
            </CardContent>
          </Card>

          {lead.status === "new" && !action && (
            <Card className="border-primary/30 bg-primary/5 shadow-sm">
              <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                <div className="rounded-full bg-primary/20 p-4 text-primary">
                  <Sparkles size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold">Ready for Qualification</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Run the AI qualification engine to score this lead, determine the optimal route, and draft a response.
                  </p>
                </div>
                <Button 
                  size="lg" 
                  className="mt-2 font-medium" 
                  onClick={handleQualify}
                  disabled={qualifyLead.isPending}
                >
                  {qualifyLead.isPending ? "Scoring Lead..." : "Run AI Qualification"}
                </Button>
              </CardContent>
            </Card>
          )}

          {routeAction && (
            <Card className={routeAction.status === "pending" ? "border-primary/30 shadow-sm" : ""}>
              <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Sparkles size={16} className="text-primary" /> Route Decision
                  </CardTitle>
                  <Badge variant={routeAction.status === "pending" ? "outline" : routeAction.status === "approved" ? "default" : "destructive"}>
                    {routeAction.status.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="bg-muted/20 p-4 rounded-lg border border-border/50">
                  <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Recommended Track</div>
                  <div className="text-lg font-medium">{routeLabel[routeAction.route] ?? routeAction.route}</div>
                </div>
                {routeAction.bookingUrl && (
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-primary">Booking Link</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {routeAction.status === "approved"
                        ? "Surfaced for this high-fit lead. Share to book a discovery call."
                        : "Will be surfaced for this high-fit lead once the route is approved."}
                    </p>
                    <a href={routeAction.bookingUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                      <ExternalLink size={12} /> {new URL(routeAction.bookingUrl).hostname}
                    </a>
                  </div>
                )}
                {routeAction.status === "pending" && (
                  <div className="flex items-center justify-between pt-2">
                    <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 gap-2" onClick={handleRejectRoute} disabled={rejectAction.isPending}>
                      <XCircle size={16} /> Reject
                    </Button>
                    <Button className="gap-2 px-8" onClick={handleApproveRoute} disabled={approveAction.isPending}>
                      <CheckCircle2 size={16} /> Approve Route
                    </Button>
                  </div>
                )}
                {routeAction.status === "approved" && (
                  <div className="text-center text-sm font-medium text-primary flex items-center justify-center gap-2 pt-1">
                    <CheckCircle2 size={16} /> Route approved — lead advanced
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {action && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3 border-b border-border/50 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Sparkles size={16} className="text-primary" /> AI Proposal
                    </CardTitle>
                    <Badge variant={action.status === "pending" ? "outline" : action.status === "approved" ? "default" : "destructive"}>
                      {action.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-muted/20 p-4 rounded-lg border border-border/50">
                      <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Score</div>
                      <div className="text-3xl font-bold font-mono text-primary">{action.fitScore}/100</div>
                    </div>
                    <div className="bg-muted/20 p-4 rounded-lg border border-border/50">
                      <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Recommended Route</div>
                      <div className="text-lg font-medium capitalize">{action.route?.replace('_', ' ')}</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-6">
                    <h4 className="text-sm font-semibold text-foreground">Rationale</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {action.rationale}
                    </p>
                  </div>

                  {action.bookingUrl && (
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-primary">Booking Link Included</h4>
                        <p className="text-xs text-muted-foreground mt-1">This high-fit lead will receive the Calendly link.</p>
                      </div>
                      <a href={action.bookingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                        <ExternalLink size={12} /> {new URL(action.bookingUrl).hostname}
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-border/60 shadow-md">
                <CardHeader className="bg-muted/30 border-b border-border/50 py-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Mail size={16} /> Draft Outreach
                    </CardTitle>
                    {action.status === "pending" && !isEditingEmail && (
                      <Button variant="ghost" size="sm" onClick={startEditing} className="h-8 gap-1.5 text-xs">
                        <PencilLine size={14} /> Edit
                      </Button>
                    )}
                  </div>
                </CardHeader>
                
                {isEditingEmail ? (
                  <div className="p-4 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Subject</label>
                      <Input 
                        value={editedSubject} 
                        onChange={e => setEditedSubject(e.target.value)} 
                        className="font-medium"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Body</label>
                      <Textarea 
                        value={editedBody} 
                        onChange={e => setEditedBody(e.target.value)} 
                        rows={10}
                        className="font-serif resize-y"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="ghost" size="sm" onClick={() => setIsEditingEmail(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleSaveEmailEdit} disabled={updateAction.isPending}>Save Changes</Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 space-y-4 bg-background">
                    <div className="pb-3 border-b border-border/40">
                      <div className="text-xs text-muted-foreground mb-1">Subject</div>
                      <div className="font-medium">{action.emailSubject}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-2">Body</div>
                      <div className="text-sm whitespace-pre-wrap font-serif leading-relaxed text-foreground/90">
                        {action.emailBody}
                      </div>
                    </div>
                  </div>
                )}
                
                {action.status === "pending" && !isEditingEmail && (
                  <div className="bg-muted/30 border-t border-border/50 p-4 flex items-center justify-between">
                    <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 gap-2" onClick={handleReject} disabled={rejectAction.isPending}>
                      <XCircle size={16} /> Reject & Discard
                    </Button>
                    <Button className="gap-2 px-8" onClick={handleApprove} disabled={approveAction.isPending}>
                      <Send size={16} /> Approve & Send
                    </Button>
                  </div>
                )}
                {action.status === "approved" && (
                  <div className="bg-primary/5 border-t border-primary/20 p-3 text-center text-sm font-medium text-primary flex items-center justify-center gap-2">
                    <CheckCircle2 size={16} /> Email has been sent
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>

        {/* Right Column: Timeline */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity size={16} /> Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet.</p>
              ) : (
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  {activity.map((act, i) => (
                    <div key={act.id} className="relative flex items-start gap-4">
                      <div className={`z-10 mt-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background ring-2 ring-background
                        ${['email_sent', 'route_approved'].includes(act.kind) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {act.kind === 'lead_captured' && <Users size={10} />}
                        {act.kind === 'lead_qualified' && <Sparkles size={10} />}
                        {act.kind === 'route_approved' && <Sparkles size={10} />}
                        {act.kind === 'email_sent' && <CheckCircle2 size={10} />}
                        {act.kind === 'action_rejected' && <XCircle size={10} />}
                        {act.kind === 'connection_saved' && <CheckCircle2 size={10} />}
                        {!['lead_captured', 'lead_qualified', 'route_approved', 'email_sent', 'action_rejected', 'connection_saved'].includes(act.kind) && <Activity size={10} />}
                      </div>
                      <div className="flex-1 pb-1">
                        <p className="text-sm font-medium leading-none text-foreground">{act.summary}</p>
                        <p className="text-xs text-muted-foreground mt-1.5">{format(new Date(act.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}