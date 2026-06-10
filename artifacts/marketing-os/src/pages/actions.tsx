import { useState } from "react";
import { 
  useListMarketingActions,
  useApproveMarketingAction,
  useRejectMarketingAction,
  useUpdateMarketingAction,
  getListMarketingActionsQueryKey,
  getGetMarketingLeadQueryKey,
  getGetMarketingDashboardQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { CheckSquare, Send, XCircle, PencilLine, Mail, Clock, ExternalLink } from "lucide-react";

export default function Actions() {
  const { data: actions, isLoading } = useListMarketingActions({ status: "pending" });
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">Review Queue</h1>
          <p className="text-muted-foreground mt-1">Pending proposals awaiting human approval.</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-16 bg-muted/50"></CardHeader>
              <CardContent className="h-48"></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">Review Queue</h1>
          <p className="text-muted-foreground mt-1">
            {actions?.length === 0 
              ? "No pending approvals. The queue is clear." 
              : `${actions?.length} pending proposal${actions?.length === 1 ? '' : 's'} awaiting human approval.`}
          </p>
        </div>
      </div>

      {actions?.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed rounded-xl bg-card">
          <div className="mb-4 rounded-full bg-primary/10 p-5 text-primary">
            <CheckSquare size={40} />
          </div>
          <h3 className="text-xl font-semibold">All Caught Up</h3>
          <p className="mt-2 text-muted-foreground max-w-md">
            There are no pending actions in the queue. When AI qualifies new leads, their proposals will appear here.
          </p>
          <Button variant="outline" className="mt-6" asChild>
            <Link href="/leads">View All Leads</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {actions?.map((action, i) => (
            <ActionReviewCard key={action.id} action={action} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionReviewCard({ action, index }: { action: any, index: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  
  const approveAction = useApproveMarketingAction();
  const rejectAction = useRejectMarketingAction();
  const updateAction = useUpdateMarketingAction();

  const [isEditing, setIsEditing] = useState(false);
  const [editedSubject, setEditedSubject] = useState(action.emailSubject || "");
  const [editedBody, setEditedBody] = useState(action.emailBody || "");

  const handleApprove = () => {
    approveAction.mutate({ id: action.id }, {
      onSuccess: () => {
        toast({ title: "Email approved and sent" });
        qc.invalidateQueries({ queryKey: getListMarketingActionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMarketingLeadQueryKey(action.leadId) });
        qc.invalidateQueries({ queryKey: getGetMarketingDashboardQueryKey() });
      }
    });
  };

  const handleReject = () => {
    rejectAction.mutate({ id: action.id }, {
      onSuccess: () => {
        toast({ title: "Draft rejected" });
        qc.invalidateQueries({ queryKey: getListMarketingActionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMarketingLeadQueryKey(action.leadId) });
        qc.invalidateQueries({ queryKey: getGetMarketingDashboardQueryKey() });
      }
    });
  };

  const handleSaveEdit = () => {
    updateAction.mutate({ 
      id: action.id, 
      data: { emailSubject: editedSubject, emailBody: editedBody } 
    }, {
      onSuccess: () => {
        toast({ title: "Draft updated" });
        setIsEditing(false);
        qc.invalidateQueries({ queryKey: getListMarketingActionsQueryKey() });
      }
    });
  };

  return (
    <Card 
      className="overflow-hidden border-border/80 shadow-md transition-all hover:shadow-lg"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="bg-muted/30 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/50 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-mono font-bold border border-primary/20">
            {action.fitScore}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">Lead #{action.leadId}</span>
              <Link href={`/leads/${action.leadId}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                View Profile <ExternalLink size={10} />
              </Link>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <Clock size={12} /> {format(new Date(action.createdAt), "MMM d, h:mm a")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {action.fitTier === "high" && <Badge className="bg-primary">High Fit</Badge>}
          {action.fitTier === "medium" && <Badge className="bg-chart-4 text-black">Medium Fit</Badge>}
          {action.fitTier === "low" && <Badge variant="outline">Low Fit</Badge>}
          <Badge variant="secondary" className="capitalize">{action.route?.replace('_', ' ')}</Badge>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Rationale</h4>
            <p className="text-sm text-foreground/80 leading-relaxed bg-muted/20 p-3 rounded border border-border/50">
              {action.rationale}
            </p>
          </div>
          
          {action.bookingUrl && (
            <div className="bg-primary/5 border border-primary/20 p-3 rounded">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Booking Link</h4>
              <p className="text-xs text-muted-foreground truncate">{action.bookingUrl}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-8">
          <div className="rounded-md border border-border/80 overflow-hidden flex flex-col h-full">
            <div className="bg-muted/40 px-4 py-2 flex items-center justify-between border-b border-border/80">
              <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                <Mail size={14} /> Draft Email
              </span>
              {!isEditing && (
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="h-7 text-xs px-2 gap-1">
                  <PencilLine size={12} /> Edit
                </Button>
              )}
            </div>
            
            <div className="p-4 flex-1 bg-background">
              {isEditing ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Subject</label>
                    <Input 
                      value={editedSubject} 
                      onChange={e => setEditedSubject(e.target.value)} 
                      className="h-8 text-sm font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Body</label>
                    <Textarea 
                      value={editedBody} 
                      onChange={e => setEditedBody(e.target.value)} 
                      rows={8}
                      className="text-sm font-serif resize-y"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditedSubject(action.emailSubject || "");
                      setEditedBody(action.emailBody || "");
                      setIsEditing(false);
                    }}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={updateAction.isPending}>Save</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 h-full flex flex-col">
                  <div>
                    <span className="text-xs text-muted-foreground mr-2 font-medium">Subject:</span>
                    <span className="text-sm font-medium">{action.emailSubject}</span>
                  </div>
                  <Separator />
                  <div className="text-sm whitespace-pre-wrap font-serif leading-relaxed text-foreground/90 flex-1">
                    {action.emailBody}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted/20 px-6 py-4 border-t border-border/50 flex items-center justify-between">
        <Button 
          variant="outline" 
          className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive gap-2" 
          onClick={handleReject} 
          disabled={rejectAction.isPending || isEditing}
        >
          <XCircle size={16} /> Reject
        </Button>
        <Button 
          className="gap-2 px-8 shadow-sm" 
          onClick={handleApprove} 
          disabled={approveAction.isPending || isEditing}
        >
          <Send size={16} /> Approve & Send
        </Button>
      </div>
    </Card>
  );
}