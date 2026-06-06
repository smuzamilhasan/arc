import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateAgency,
  getGetAgencyContextQueryKey,
  useGetAgencyMembers,
  getGetAgencyMembersQueryKey,
  useGetAgencyInvitations,
  getGetAgencyInvitationsQueryKey,
  useCreateInvitation,
  useRevokeInvitation,
  useRemoveAgencyMember,
  useRemoveAgencyClient,
} from "@workspace/api-client-react";
import { useActiveClient } from "@/lib/active-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Users,
  UserPlus,
  Loader2,
  Copy,
  Trash2,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function inviteLink(token: string): string {
  return `${window.location.origin}${basePath}/invite/${token}`;
}

function CreateAgency() {
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { mutate, isPending } = useCreateAgency();

  const submit = () => {
    if (!name.trim()) return;
    mutate(
      { data: { name: name.trim() } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetAgencyContextQueryKey() });
          toast({ title: "Agency created" });
          setName("");
        },
        onError: () =>
          toast({ title: "Could not create agency", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="max-w-md rounded-xl border border-border/60 bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 className="font-serif text-xl">Create an agency</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        An agency lets you manage multiple clients and invite teammates. You
        become the owner.
      </p>
      <div className="space-y-3">
        <div>
          <Label htmlFor="agencyName">Agency name</Label>
          <Input
            id="agencyName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Northbeam Studio"
          />
        </div>
        <Button onClick={submit} disabled={isPending || !name.trim()}>
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Create agency
        </Button>
      </div>
    </div>
  );
}

function InviteForm({ agencyId }: { agencyId: number }) {
  const [kind, setKind] = useState<"client" | "member">("client");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [headline, setHeadline] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { mutate, isPending } = useCreateInvitation();

  const submit = () => {
    if (!email.trim()) return;
    if (kind === "client" && !fullName.trim()) {
      toast({ title: "Client name is required", variant: "destructive" });
      return;
    }
    const data =
      kind === "member"
        ? { kind: "member" as const, email: email.trim() }
        : {
            kind: "client" as const,
            email: email.trim(),
            profile: {
              fullName: fullName.trim(),
              ...(headline.trim() ? { headline: headline.trim() } : {}),
            },
          };
    mutate(
      { agencyId, data },
      {
        onSuccess: (result) => {
          qc.invalidateQueries({
            queryKey: getGetAgencyInvitationsQueryKey(agencyId),
          });
          qc.invalidateQueries({ queryKey: getGetAgencyContextQueryKey() });
          if (result.emailSent) {
            toast({
              title: "Invitation sent",
              description: `We emailed the invite link to ${result.email}.`,
            });
          } else {
            toast({
              title: "Invitation created — email not sent",
              description:
                "We couldn't email the invite. Copy the invite link below and send it manually.",
              variant: "destructive",
            });
          }
          setEmail("");
          setFullName("");
          setHeadline("");
        },
        onError: () =>
          toast({ title: "Could not create invitation", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-primary" />
        <h2 className="font-serif text-xl">Invite</h2>
      </div>
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setKind("client")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            kind === "client"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary/40 text-muted-foreground hover:text-foreground"
          }`}
        >
          Client
        </button>
        <button
          onClick={() => setKind("member")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            kind === "member"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary/40 text-muted-foreground hover:text-foreground"
          }`}
        >
          Team member
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <Label htmlFor="inviteEmail">Email</Label>
          <Input
            id="inviteEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        {kind === "client" ? (
          <>
            <div>
              <Label htmlFor="clientName">Client full name</Label>
              <Input
                id="clientName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jordan Avery"
              />
            </div>
            <div>
              <Label htmlFor="clientHeadline">Headline (optional)</Label>
              <Input
                id="clientHeadline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Founder & operator"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              We will create the client's profile now so you can start building
              it. They claim it later with their own login and can edit
              everything.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Team members can see and manage every client in this agency.
          </p>
        )}
        <Button onClick={submit} disabled={isPending || !email.trim()}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create invitation
        </Button>
      </div>
    </div>
  );
}

function Invitations({ agencyId }: { agencyId: number }) {
  const { data } = useGetAgencyInvitations(agencyId, {
    query: { queryKey: getGetAgencyInvitationsQueryKey(agencyId), retry: false },
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const { mutate: revoke } = useRevokeInvitation();
  const invitations = data?.invitations ?? [];

  if (invitations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No pending invitations.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {invitations.map((inv) => (
        <li
          key={inv.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{inv.email}</span>
              <Badge variant="secondary" className="capitalize">
                {inv.kind}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {inviteLink(inv.token)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="Copy invite link"
              onClick={() => {
                navigator.clipboard.writeText(inviteLink(inv.token));
                toast({ title: "Invite link copied" });
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Revoke invitation"
              onClick={() =>
                revoke(
                  { agencyId, id: inv.id },
                  {
                    onSuccess: () =>
                      qc.invalidateQueries({
                        queryKey: getGetAgencyInvitationsQueryKey(agencyId),
                      }),
                  },
                )
              }
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Members({ agencyId, isOwner }: { agencyId: number; isOwner: boolean }) {
  const { data } = useGetAgencyMembers(agencyId, {
    query: { queryKey: getGetAgencyMembersQueryKey(agencyId), retry: false },
  });
  const qc = useQueryClient();
  const { mutate: remove } = useRemoveAgencyMember();
  const members = data?.members ?? [];

  return (
    <ul className="space-y-2">
      {members.map((m) => (
        <li
          key={m.userId}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {m.name || m.email || m.userId}
            </p>
            {m.email && m.name ? (
              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={m.role === "owner" ? "default" : "secondary"} className="capitalize">
              {m.role}
            </Badge>
            {isOwner && m.role !== "owner" ? (
              <Button
                variant="ghost"
                size="icon"
                title="Remove member"
                onClick={() =>
                  remove(
                    { agencyId, memberUserId: m.userId },
                    {
                      onSuccess: () =>
                        qc.invalidateQueries({
                          queryKey: getGetAgencyContextQueryKey(),
                        }),
                    },
                  )
                }
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Agency() {
  const { context, isLoading, setActiveClient } = useActiveClient();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { mutate: removeClient, isPending: removingClient } =
    useRemoveAgencyClient();

  const agencies = context?.agencies ?? [];
  // The create-agency surface is only reached deliberately: a fresh "For
  // agencies" sign-up (routed here with ?create=1) or an existing individual
  // opting in from Account settings (also ?create=1). A regular user who simply
  // types /agency with no agency is bounced back to their dashboard.
  const wantsCreate = new URLSearchParams(search).get("create") === "1";

  useEffect(() => {
    if (isLoading) return;
    if (agencies.length === 0 && !wantsCreate) {
      setLocation("/dashboard");
    }
  }, [isLoading, agencies.length, wantsCreate, setLocation]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (agencies.length === 0) {
    if (!wantsCreate) return null;
    return (
      <div className="space-y-8">
        <div>
          <h1 className="font-serif text-3xl">Agency</h1>
          <p className="mt-1 text-muted-foreground">
            Manage multiple clients and invite teammates.
          </p>
        </div>
        <CreateAgency />
      </div>
    );
  }

  // Single-agency model in the UI for now: operate the first agency.
  const agency = agencies[0];
  const isOwner = agency.role === "owner";
  const managedClients = (context?.clients ?? []).filter(
    (c) => c.agencyId === agency.id,
  );

  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <h1 className="font-serif text-3xl">{agency.name}</h1>
          <Badge variant="secondary" className="ml-1 capitalize">
            {agency.role}
          </Badge>
        </div>
        <p className="mt-1 text-muted-foreground">
          Manage your clients and team.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-serif text-xl">
          <Users className="h-5 w-5 text-primary" /> Clients
        </h2>
        {managedClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No clients yet. Invite one below to prebuild their profile.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {managedClients.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.headline || "No headline yet"}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {c.claimed ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Claimed
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600">Unclaimed</span>
                    )}
                    {c.onboardingComplete ? (
                      <span className="text-xs text-muted-foreground">
                        Onboarded
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActiveClient(c.id);
                      setLocation("/dashboard");
                    }}
                  >
                    Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={removingClient}
                    title={
                      c.claimed
                        ? "Remove client from this agency"
                        : "Delete client"
                    }
                    onClick={() => {
                      const ok = window.confirm(
                        c.claimed
                          ? `Remove ${c.fullName} from this agency? Their account stays, but the agency loses access.`
                          : `Permanently delete ${c.fullName} and all of their data? This cannot be undone.`,
                      );
                      if (!ok) return;
                      removeClient(
                        { agencyId: agency.id, clientId: c.id },
                        {
                          onSuccess: () => {
                            qc.invalidateQueries({
                              queryKey: getGetAgencyContextQueryKey(),
                            });
                            qc.invalidateQueries({
                              queryKey: getGetAgencyInvitationsQueryKey(
                                agency.id,
                              ),
                            });
                            toast({
                              title: c.claimed
                                ? "Client removed from agency"
                                : "Client deleted",
                            });
                          },
                          onError: () =>
                            toast({
                              title: "Could not remove client",
                              variant: "destructive",
                            }),
                        },
                      );
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <InviteForm agencyId={agency.id} />
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 flex items-center gap-2 font-serif text-xl">
              <Users className="h-5 w-5 text-primary" /> Team
            </h2>
            <Members agencyId={agency.id} isOwner={isOwner} />
          </div>
          <div>
            <h2 className="mb-3 font-serif text-xl">Pending invitations</h2>
            <Invitations agencyId={agency.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
