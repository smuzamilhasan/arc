import { useState } from "react";
import { useListMarketingLeads, useCreateMarketingLead, getListMarketingLeadsQueryKey, getGetMarketingDashboardQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Users, Filter, Plus, Search, ChevronRight } from "lucide-react";
import type { MarketingLeadFitTier, MarketingLeadStatus } from "@workspace/api-client-react";

export default function Leads() {
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  
  const params: any = {};
  // "unscored" is not a server-side tier; filter it client-side instead.
  if (tierFilter !== "all" && tierFilter !== "unscored") params.tier = tierFilter as MarketingLeadFitTier;
  if (statusFilter !== "all") params.status = statusFilter as MarketingLeadStatus;

  const { data: leads, isLoading } = useListMarketingLeads(params);
  
  const filteredLeads = leads?.filter(lead => {
    if (tierFilter === "unscored" && lead.fitTier != null) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (lead.name?.toLowerCase().includes(s) || lead.email.toLowerCase().includes(s) || lead.company?.toLowerCase().includes(s));
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">Leads Pipeline</h1>
          <p className="text-muted-foreground mt-1">All captured inbound inquiries.</p>
        </div>
        <AddLeadDialog />
      </div>

      <Card>
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search leads..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue placeholder="All Tiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="high">High Fit</SelectItem>
                <SelectItem value="medium">Medium Fit</SelectItem>
                <SelectItem value="low">Low Fit</SelectItem>
                <SelectItem value="unscored">Unscored</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="booking">Booking</SelectItem>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="nurturing">Nurturing</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center justify-between p-4">
                  <div className="space-y-2">
                    <div className="h-4 w-48 rounded bg-muted animate-pulse"></div>
                    <div className="h-3 w-32 rounded bg-muted animate-pulse"></div>
                  </div>
                  <div className="h-6 w-20 rounded bg-muted animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : !filteredLeads || filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="mb-4 rounded-full bg-secondary p-4 text-muted-foreground">
                <Users size={32} />
              </div>
              <h3 className="text-lg font-semibold">No leads found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {search || tierFilter !== "all" || statusFilter !== "all" 
                  ? "Try adjusting your filters or search." 
                  : "New inbound leads will appear here."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredLeads.map((lead, i) => (
                <Link 
                  key={lead.id} 
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors block"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex flex-1 items-center gap-4">
                    <div className="hidden sm:flex flex-col items-center justify-center h-10 w-10 rounded bg-secondary text-secondary-foreground font-mono text-xs">
                      {lead.fitScore ? lead.fitScore : "--"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{lead.name || lead.email}</span>
                        {lead.status === "new" && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">New</Badge>}
                        {lead.status === "qualified" && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary text-primary">Qualified</Badge>}
                        {lead.status === "booking" && <Badge className="text-[10px] px-1.5 py-0 bg-primary hover:bg-primary">Booking</Badge>}
                        {lead.status === "warm" && <Badge className="text-[10px] px-1.5 py-0 bg-chart-4 hover:bg-chart-4 text-black">Warm</Badge>}
                        {lead.status === "nurturing" && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Nurturing</Badge>}
                        {lead.status === "contacted" && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Contacted</Badge>}
                        {lead.status === "booked" && <Badge className="text-[10px] px-1.5 py-0 bg-primary hover:bg-primary">Booked</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        <span>{lead.company || "No company"}</span>
                        <span>•</span>
                        <span>{format(new Date(lead.createdAt), "MMM d, yyyy")}</span>
                        <span>•</span>
                        <span className="truncate max-w-[200px] sm:max-w-[400px]">{lead.source}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <div className="hidden md:flex items-center gap-2">
                      {lead.fitTier === "high" && <Badge className="bg-primary hover:bg-primary">High Fit</Badge>}
                      {lead.fitTier === "medium" && <Badge className="bg-chart-4 hover:bg-chart-4 text-black">Medium Fit</Badge>}
                      {lead.fitTier === "low" && <Badge variant="outline">Low Fit</Badge>}
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddLeadDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  
  const qc = useQueryClient();
  const { toast } = useToast();
  
  const createLead = useCreateMarketingLead();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    createLead.mutate({
      data: {
        email,
        name: name || undefined,
        company: company || undefined,
        message: message || undefined,
        source: "Manual Entry"
      }
    }, {
      onSuccess: () => {
        toast({ title: "Lead added successfully" });
        setOpen(false);
        setName("");
        setEmail("");
        setCompany("");
        setMessage("");
        qc.invalidateQueries({ queryKey: getListMarketingLeadsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetMarketingDashboardQueryKey() });
      },
      onError: (err: any) => {
        toast({ 
          title: "Failed to add lead", 
          description: err.message || "An error occurred",
          variant: "destructive" 
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus size={16} />
          Add Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Manual Lead</DialogTitle>
            <DialogDescription>
              Enter details for a new inbound lead to enter the pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Inc"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="message">Initial Message / Context</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How can we help?"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!email || createLead.isPending}>
              {createLead.isPending ? "Adding..." : "Add Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}