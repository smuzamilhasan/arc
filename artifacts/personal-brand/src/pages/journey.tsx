// /app/journey — the Executive Consultation client portal home.
//
// The 13-week engagement rendered as one screen: where the client is, what's
// done, and the single thing to do now. On-brand (Signal in the Deep Field —
// Deep Field canvas, one jade signal, Fraunces display, Bone text).
//
// Runs on real data: the consolidated /dashboard summary (audit/narrative
// status, SEO + GEO scores, post counts) plus /v2/profile/completeness. The
// six phases mirror docs/reference/executive-consultation-delivery.md:
//   Signal Audit → Strategic Architecture → Distribution Blueprint →
//   Conversion Engine → Produce & publish → Handover.
//
// Slice 1 of the portal: this page + nav entry. Still to come (see the doc):
// a role-gated scoped layout that hides the SaaS nav, the Airtable Engagements
// feed for real week-of-13 + Friday digest, and the Approve/Deliverables screens.

import { useEffect, useState } from "react";
import { Link, Redirect } from "wouter";
import { useUser } from "@clerk/react";
import {
  useGetDashboard,
  getGetDashboardQueryKey,
  useGetAdminAccess,
} from "@workspace/api-client-react";
import { getActiveClientId } from "@/lib/active-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  ArrowRight,
  Check,
  Mail,
  Search,
  BookOpen,
  CalendarDays,
  Target,
  Send,
  PackageCheck,
  Loader2,
} from "lucide-react";

type Phase = {
  key: string;
  label: string;
  blurb: string;
  href: string;
  icon: typeof Search;
  done: boolean;
  soon?: boolean;
};

export default function Journey() {
  // Portal access: consultation clients (Clerk publicMetadata) + admins only.
  // A non-client landing on /app/journey directly is bounced to the Studio.
  const { user, isLoaded: userLoaded } = useUser();
  const { data: access, isLoading: accessLoading } = useGetAdminAccess();
  const allowed =
    user?.publicMetadata?.consultationClient === true || Boolean(access?.isAdmin);

  const { data: dashboard, isLoading } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey(), retry: false },
  });

  // Profile completeness lives on a v2 route the generated client doesn't wrap;
  // fetch it directly with the active-client header, like the Studio page does.
  const [profilePct, setProfilePct] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const clientId = getActiveClientId();
        const res = await fetch(
          `${import.meta.env.BASE_URL}api/v2/profile/completeness`,
          {
            headers: clientId != null ? { "x-arc-client-id": String(clientId) } : {},
          },
        );
        if (res.ok && !cancelled) {
          const json = await res.json();
          if (typeof json?.overall_pct === "number") setProfilePct(json.overall_pct);
        }
      } catch {
        /* leave null — the profile card just hides the % */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const auditDone = Boolean(dashboard?.auditComplete);
  const archDone = Boolean(dashboard?.narrativeComplete);
  const hasPlan = (dashboard?.totalPosts ?? 0) > 0;
  const publishing = (dashboard?.publishedCount ?? 0) > 0;
  const draftCount = dashboard?.draftCount ?? 0;
  const scheduledCount = dashboard?.scheduledCount ?? 0;
  const publishedCount = dashboard?.publishedCount ?? 0;

  const phases: Phase[] = [
    {
      key: "audit",
      label: "Signal Audit",
      blurb: "What's working, what's noise, and how the market currently finds you.",
      href: "/audit",
      icon: Search,
      done: auditDone,
    },
    {
      key: "architecture",
      label: "Strategic Architecture",
      blurb: "Your defensible position, signature methodology, and authority pillars.",
      href: "/narrative",
      icon: BookOpen,
      done: archDone,
    },
    {
      key: "blueprint",
      label: "Distribution Blueprint",
      blurb: "The quarterly calendar and the systems that turn position into visibility.",
      href: "/blueprint",
      icon: CalendarDays,
      done: hasPlan,
    },
    {
      key: "conversion",
      label: "Conversion Engine",
      blurb: "The path from visibility to revenue — funnel, offers, and the metrics we track.",
      href: "/journey",
      icon: Target,
      done: false,
      soon: true,
    },
    {
      key: "produce",
      label: "Produce + publish",
      blurb: "3–5 posts a week in your voice. You approve; we schedule.",
      href: "/content",
      icon: Send,
      done: publishing,
    },
    {
      key: "handover",
      label: "Handover",
      blurb: "You keep the engine — prompts, templates, calendar, and dashboards.",
      href: "/journey",
      icon: PackageCheck,
      done: false,
    },
  ];

  const doneCount = phases.filter((p) => p.done).length;
  const currentIndex = phases.findIndex((p) => !p.done);
  const current = phases[currentIndex === -1 ? phases.length - 1 : currentIndex]!;
  const frac = doneCount / phases.length;

  // Progress arc — the self-drawing arc motif as the progress indicator.
  const ARC_LEN = 298; // ≈ π·95, a 95px-radius semicircle
  const theta = Math.PI - frac * Math.PI; // left (π) → right (0)
  const dotX = 130 + 95 * Math.cos(theta);
  const dotY = 130 - 95 * Math.sin(theta);

  if (!userLoaded || accessLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
      </div>
    );
  }
  if (!allowed) {
    return <Redirect to="/studio" />;
  }
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your engagement
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl py-4 space-y-8">
      {/* Hero — current phase + the self-drawing progress arc */}
      <div className="grid items-center gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Phase {Math.min(currentIndex === -1 ? phases.length : currentIndex + 1, phases.length)} of {phases.length}
            {currentIndex !== -1 && currentIndex < 4 ? " · strategy sprint" : " · execution"}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-medium leading-[1.05] text-foreground">
            {current.label}
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            {current.blurb}
          </p>
        </div>
        <div className="flex justify-center">
          <svg viewBox="0 0 260 150" className="w-full max-w-[240px]" role="img" aria-label={`${doneCount} of ${phases.length} phases complete`}>
            <path d="M 35 132 A 95 95 0 0 1 225 132" fill="none" stroke="hsl(var(--border))" strokeWidth="3" strokeLinecap="round" />
            <path d="M 35 132 A 95 95 0 0 1 225 132" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${frac * ARC_LEN} ${ARC_LEN}`} />
            {frac > 0 && frac < 1 && (
              <>
                <circle cx={dotX} cy={dotY} r="5" fill="hsl(var(--primary))" />
                <circle cx={dotX} cy={dotY} r="10" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.35" strokeWidth="1.5" />
              </>
            )}
            <text x="130" y="118" textAnchor="middle" className="font-serif" fontSize="30" fontWeight="500" fill="hsl(var(--foreground))">
              {doneCount}/{phases.length}
            </text>
            <text x="130" y="138" textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">
              phases installed
            </text>
          </svg>
        </div>
      </div>

      {/* Phase rail */}
      <div className="flex items-start justify-between gap-1">
        {phases.map((p, i) => {
          const isCurrent = i === currentIndex;
          return (
            <Link key={p.key} href={p.href} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full items-center">
                <span className={`h-px flex-1 ${i === 0 ? "opacity-0" : p.done || isCurrent ? "bg-primary/40" : "bg-border"}`} />
                {p.done ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                ) : isCurrent ? (
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/15" />
                ) : (
                  <span className="h-3 w-3 shrink-0 rounded-full border-[1.5px] border-muted-foreground/40" />
                )}
                <span className={`h-px flex-1 ${i === phases.length - 1 ? "opacity-0" : phases[i + 1]?.done ? "bg-primary/40" : "bg-border"}`} />
              </div>
              <span className={`text-center text-[11px] leading-tight ${isCurrent ? "font-medium text-foreground" : p.done ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                {p.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Primary action — the one thing to do now */}
      <Card className="border-primary/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">
                {draftCount > 0
                  ? `${draftCount} draft${draftCount === 1 ? "" : "s"} waiting for your approval`
                  : "You're all caught up"}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {draftCount > 0
                  ? "In your voice. Scheduled the moment you approve."
                  : "New drafts land here each week. We'll email you when they're ready."}
              </p>
            </div>
          </div>
          {draftCount > 0 && (
            <Link href="/content">
              <Button>
                Review drafts <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Live signal — real engagement data */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              This week's signal
            </p>
            <div className="mt-3 flex gap-6">
              <Stat value={publishedCount} label="published" />
              <Stat value={scheduledCount} label="queued" />
              <Stat value={draftCount} label="drafts" />
            </div>
          </CardContent>
        </Card>

        <Link href="/profile-v2">
          <Card className="h-full cursor-pointer transition-colors hover:border-primary/40">
            <CardContent className="py-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Your profile
              </p>
              <div className="mt-3 flex items-end justify-between">
                <Stat value={profilePct != null ? `${profilePct}%` : "—"} label="tuned to your voice" />
                <span className="mb-1 flex items-center gap-1 text-xs text-primary">
                  Sharpen <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/audit">
          <Card className="h-full cursor-pointer transition-colors hover:border-primary/40">
            <CardContent className="py-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Discoverability
              </p>
              <div className="mt-3 flex gap-6">
                <Stat value={dashboard?.seoScore ?? "—"} label="SEO" />
                <Stat value={dashboard?.geoScore ?? "—"} label="GEO" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Footer — the cadence promise */}
      <div className="flex items-center gap-2 border-t border-border/50 pt-4 text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5" />
        <span>Your Friday dashboard lands by email each week. Next milestone — handover, week 12.</span>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="font-serif text-[22px] font-medium leading-none text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
