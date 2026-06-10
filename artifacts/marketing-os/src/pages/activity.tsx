import { useListMarketingActivity } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Link } from "wouter";
import { Users, Sparkles, CheckCircle2, XCircle, Activity as ActivityIcon } from "lucide-react";

export default function Activity() {
  const { data: activities, isLoading } = useListMarketingActivity();

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="font-serif text-3xl font-bold tracking-tight">System Activity</h1>
        <p className="text-muted-foreground mt-1">Full historical log of funnel events and operator actions.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="flex gap-4 p-4">
                  <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0"></div>
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-1/3 rounded bg-muted animate-pulse"></div>
                    <div className="h-3 w-24 rounded bg-muted animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : !activities || activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="mb-4 rounded-full bg-secondary p-4 text-muted-foreground">
                <ActivityIcon size={32} />
              </div>
              <h3 className="text-lg font-semibold">No Activity Yet</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                System events will appear here as leads are captured and processed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activities.map((activity, i) => (
                <div key={activity.id} className="flex gap-4 p-4 hover:bg-muted/20 transition-colors">
                  <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full shrink-0
                    ${['email_sent', 'route_approved'].includes(activity.kind) ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
                    {activity.kind === 'lead_captured' && <Users size={14} />}
                    {activity.kind === 'lead_qualified' && <Sparkles size={14} />}
                    {activity.kind === 'route_approved' && <Sparkles size={14} />}
                    {activity.kind === 'email_sent' && <CheckCircle2 size={14} />}
                    {activity.kind === 'action_rejected' && <XCircle size={14} />}
                    {activity.kind === 'connection_saved' && <CheckCircle2 size={14} />}
                    {!['lead_captured', 'lead_qualified', 'route_approved', 'email_sent', 'action_rejected', 'connection_saved'].includes(activity.kind) && <ActivityIcon size={14} />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-relaxed text-foreground">
                      {activity.summary}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{format(new Date(activity.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                      {activity.leadId && (
                        <>
                          <span>•</span>
                          <Link href={`/leads/${activity.leadId}`} className="text-primary hover:underline">
                            View Lead #{activity.leadId}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}