// /app/console — the consultant Client Console (admin-only).
//
// The operator counterpart to the client Journey. For the *active client*
// (chosen via the sidebar client switcher), it lays out the 6 engagement
// phases, shows real status, tells you what to add, and deep-links into the
// existing editors to produce/tweak each deliverable. It reads the same data
// the client's Journey reads, so what you produce here is what they see there.
//
// v1 = guide + deep-link (no inline generation yet): every action opens the
// existing powerful page for that phase. See docs/reference/
// executive-consultation-delivery.md §7 for the slice plan.

import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  useGetDashboard,
  getGetDashboardQueryKey,
  type DashboardSummary,
} from "@workspace/api-client-react";
import { useActiveClient, getActiveClientId } from "@/lib/active-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  BookOpen,
  CalendarDays,
  Target,
  Send,
  PackageCheck,
  ArrowRight,
  Check,
  UserPlus,
  Mic,
  UserCircle,
  Eye,
  Loader2,
} from "lucide-react";

type Action = { label: string; href: string };
type PhaseDef = {
  key: string;
  label: string;
  blurb: string;
  icon: typeof Search;
  done: (d?: DashboardSummary) => boolean;
  actions: Action[];
  manual?: boolean;
};

const PHASES: PhaseDef[] = [
  {
    key: "audit",
    label: "Signal Audit",
    blurb: "Audit their track record, SERP & GEO, demographics, competitors.",
    icon: Search,
    done: (d) => Boolean(d?.auditComplete),
    actions: [
      { label: "Open Audit", href: "/audit" },
      { label: "Investigator", href: "/dossier" },
    ],
  },
  {
    key: "architecture",
    label: "Strategic Architecture",
    blurb: "Position, signature methodology, authority pillars, language kit.",
    icon: BookOpen,
    done: (d) => Boolean(d?.narrativeComplete),
    actions: [{ label: "Open Narrative", href: "/narrative" }],
  },
  {
    key: "blueprint",
    label: "Distribution Blueprint",
    blurb: "Platform strategy + the quarterly content calendar.",
    icon: CalendarDays,
    done: (d) => (d?.totalPosts ?? 0) > 0,
    actions: [
      { label: "Blueprint", href: "/blueprint" },
      { label: "Planner", href: "/planner" },
      { label: "Calendar", href: "/calendar" },
    ],
  },
  {
    key: "conversion",
    label: "Conversion Engine",
    blurb: "Funnel, offers, outreach, measurement. Captured with you — no generator yet.",
    icon: Target,
    done: () => false,
    manual: true,
    actions: [{ label: "Content strategy", href: "/content/strategy" }],
  },
  {
    key: "produce",
    label: "Produce + publish",
    blurb: "Draft 3–5 posts/week in their voice; review and schedule.",
    icon: Send,
    done: (d) => (d?.publishedCount ?? 0) > 0,
    actions: [
      { label: "Write (Ghostwriter)", href: "/ghostwriter-test" },
      { label: "Content", href: "/content" },
    ],
  },
  {
    key: "handover",
    label: "Handover",
    blurb: "Hand over the engine at week 12. Export coming.",
    icon: PackageCheck,
    done: () => false,
    manual: true,
    actions: [],
  },
];

export default function Console() {
  const { context, activeClientId } = useActiveClient();
  const { data: dashboard, isLoading } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey(), retry: false },
  });

  const [profilePct, setProfilePct] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const clientId = getActiveClientId();
        const res = await fetch(
          `${import.meta.env.BASE_URL}api/v2/profile/completeness`,
          { headers: clientId != null ? { "x-arc-client-id": String(clientId) } : {} },
        );
        if (res.ok && !cancelled) {
          const json = await res.json();
          if (typeof json?.overall_pct === "number") setProfilePct(json.overall_pct);
        }
      } catch {
        /* leave null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeClientId]);

  const active = context?.clients.find((c) => c.id === activeClientId);
  const clientName = active?.fullName ?? dashboard?.clientName ?? null;
  const onOwnProfile = active?.isOwn ?? false;

  const doneCount = PHASES.filter((p) => p.done(dashboard)).length;
  const currentIndex = PHASES.findIndex((p) => !p.done(dashboard));

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading the console
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl py-4 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Client console
          </p>
          <h1 className="mt-2 font-serif text-3xl font-medium text-foreground">
            {clientName ? `Running ${clientName}` : "Run a client"}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {onOwnProfile || !clientName
              ? "Use the client switcher in the sidebar to select a client, then drive them through the six phases below."
              : "Drive this client through the six phases. What you produce here is what they see on their Journey."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{doneCount}/{PHASES.length} phases</Badge>
          <Link href="/journey">
            <Button variant="outline" size="sm">
              <Eye className="mr-1.5 h-4 w-4" /> Preview client view
            </Button>
          </Link>
        </div>
      </div>

      {/* Add their information — the intake step */}
      <Card className="border-primary/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
              <UserPlus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">
                Add their information
                {profilePct != null && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {profilePct}% complete
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Ingest their public posts and fill the profile — this grounds every deliverable.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/onboard-v2">
              <Button size="sm" variant="outline">
                <UserPlus className="mr-1.5 h-4 w-4" /> Build profile
              </Button>
            </Link>
            <Link href="/calibrate">
              <Button size="sm" variant="outline">
                <Mic className="mr-1.5 h-4 w-4" /> Calibrate voice
              </Button>
            </Link>
            <Link href="/profile-v2">
              <Button size="sm" variant="outline">
                <UserCircle className="mr-1.5 h-4 w-4" /> Edit profile
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* The six phases */}
      <div className="space-y-3">
        {PHASES.map((p, i) => {
          const done = p.done(dashboard);
          const isCurrent = i === currentIndex;
          const Icon = p.icon;
          return (
            <Card
              key={p.key}
              className={done ? "border-primary/30" : isCurrent ? "border-primary/50" : ""}
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {done ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">0{i + 1}</span>
                      <span className="font-medium text-foreground">{p.label}</span>
                      {done ? (
                        <Badge className="h-5 px-1.5 text-[10px]">Done</Badge>
                      ) : isCurrent ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Next</Badge>
                      ) : p.manual ? (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Manual</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">{p.blurb}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.actions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Coming soon</span>
                  ) : (
                    p.actions.map((a, idx) => (
                      <Link key={a.href} href={a.href}>
                        <Button size="sm" variant={idx === 0 && !done ? "default" : "outline"}>
                          {a.label}
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
