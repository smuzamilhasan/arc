import { Link, useLocation } from "wouter";
import { 
  Menu, 
  LayoutDashboard, 
  Search, 
  Telescope,
  BookOpen, 
  FileText,
  Lightbulb,
  Compass,
  Radio,
  Building2,
  CalendarDays,
  Layers,
  Lock,
  RotateCcw,
  LogOut,
  Loader2,
  Settings,
  Shield,
  Sparkles,
  MessagesSquare,
  Network,
  ChevronsUpDown,
  Check,
  X
} from "lucide-react";
import { useClerk, useUser } from "@clerk/react";
import { useActiveClient } from "@/lib/active-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useGetAdminAccess,
  useGetClient,
  getGetClientQueryKey,
  useGetPlatforms,
  getGetPlatformsQueryKey,
  useGetDashboard,
  getGetDashboardQueryKey,
  useGetAssistantUnread,
  getGetAssistantUnreadQueryKey,
  useAckFoundationConsolidation,
} from "@workspace/api-client-react";
import { useAssistantNotifications } from "@/hooks/use-assistant-notifications";
import {
  isPanelUnlocked,
  nextPillar,
  isFoundationComplete,
  type PanelGateId,
} from "@/lib/blueprint";
import { Logo } from "@/components/logo";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useResetClient } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { AssistantChat } from "@/components/assistant-chat";

interface LayoutProps {
  children: React.ReactNode;
}

function StartOver() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { mutate, isPending } = useResetClient();

  const handleReset = () => {
    mutate(undefined, {
      onSuccess: async () => {
        await queryClient.clear();
        setOpen(false);
        setLocation("/onboard");
      },
      onError: () => {
        toast({
          title: "Could not reset",
          description: "Something went wrong while starting over. Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button className="flex w-full items-center gap-3 px-4 py-2.5 rounded-none text-sm font-medium text-muted-foreground border-l-2 border-transparent transition-all duration-300 hover:text-destructive hover:bg-destructive/5 hover:border-destructive/40">
          <RotateCcw className="w-4 h-4 stroke-[1.5]" />
          Start over
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-2xl">Start over from scratch?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently erases your profile, presence audit, narrative, posts, and ideas.
            You will be returned to onboarding to begin again. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleReset();
            }}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Resetting
              </>
            ) : (
              "Erase everything"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();

  const name =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    "Account";

  return (
    <div className="flex flex-col gap-1">
      <div className="px-4 py-2 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          Signed in
        </p>
      </div>
      <Link href="/account">
        <div className="flex w-full items-center gap-3 px-4 py-2.5 rounded-none text-sm font-medium text-muted-foreground border-l-2 border-transparent transition-all duration-300 cursor-pointer hover:text-foreground hover:bg-secondary/30 hover:border-secondary-foreground/20">
          <Settings className="w-4 h-4 stroke-[1.5]" />
          Account settings
        </div>
      </Link>
      <button
        onClick={() => signOut({ redirectUrl: basePath || "/" })}
        className="flex w-full items-center gap-3 px-4 py-2.5 rounded-none text-sm font-medium text-muted-foreground border-l-2 border-transparent transition-all duration-300 hover:text-foreground hover:bg-secondary/30 hover:border-secondary-foreground/20"
      >
        <LogOut className="w-4 h-4 stroke-[1.5]" />
        Sign out
      </button>
    </div>
  );
}

function ClientSwitcher() {
  const [, setLocation] = useLocation();
  const { context, activeClientId, setActiveClient, hasAgency } =
    useActiveClient();
  const clients = context?.clients ?? [];

  // Only meaningful when the user can act on more than one client or runs an
  // agency; pure individuals never see it.
  if (!hasAgency && clients.length <= 1) return null;

  const active = clients.find((c) => c.id === activeClientId);
  const label = active ? active.fullName : "Select a client";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/30">
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">
              {label}
            </span>
            <span className="block text-xs text-muted-foreground">
              {active?.isOwn ? "Your profile" : "Managed client"}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Switch client</DropdownMenuLabel>
        {clients.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onClick={() => {
              if (c.id !== activeClientId) setActiveClient(c.id);
              setLocation("/dashboard");
            }}
            className="flex items-center justify-between gap-2"
          >
            <span className="min-w-0 truncate">{c.fullName}</span>
            {c.id === activeClientId ? (
              <Check className="h-4 w-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
        {hasAgency ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation("/agency")}>
              <Building2 className="mr-2 h-4 w-4" /> Manage agency
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  gate?: PanelGateId;
};

const navItems: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/blueprint", icon: Compass, label: "Blueprint" },
  { href: "/audit", icon: Search, label: "Audit" },
  { href: "/dossier", icon: Telescope, label: "Investigator" },
  { href: "/narrative", icon: BookOpen, label: "Narrative" },
  { href: "/platforms", icon: Radio, label: "Platforms", gate: "platforms" },
  { href: "/industry-overview", icon: Building2, label: "Industry Overview", gate: "industry" },
  { href: "/calendar", icon: CalendarDays, label: "Content Calendar", gate: "content" },
  { href: "/content", icon: FileText, label: "Content", gate: "content" },
  { href: "/ideas", icon: Lightbulb, label: "Ideas" },
  { href: "/manager", icon: Network, label: "Manager" },
  { href: "/assistant", icon: MessagesSquare, label: "Strategist" },
];

function AssistantPanel({ unreadCount }: { unreadCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label={unreadCount > 0 ? "Open strategist (new suggestion)" : "Open strategist"}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-300 hover:scale-105"
        >
          <Sparkles className="h-6 w-6 stroke-[1.75]" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-background bg-destructive" />
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-serif text-lg tracking-tight text-foreground">Strategist</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close strategist"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <AssistantChat />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { hasAgency } = useActiveClient();
  const { data: access } = useGetAdminAccess();
  const { data: client } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });
  const { data: platformStrategy } = useGetPlatforms({
    query: { queryKey: getGetPlatformsQueryKey(), retry: false },
  });
  const { data: dashboard } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey(), retry: false },
  });
  const { data: unread } = useGetAssistantUnread({
    query: {
      queryKey: getGetAssistantUnreadQueryKey(),
      retry: false,
      refetchInterval: 60000,
    },
  });
  const unreadCount = unread?.count ?? 0;
  const queryClient = useQueryClient();
  const { mutate: ackFoundation } = useAckFoundationConsolidation();
  const [celebrateOpen, setCelebrateOpen] = useState(false);

  useAssistantNotifications(Boolean(client));

  const gateCtx = {
    client,
    hasAudit: Boolean(dashboard?.auditComplete),
    hasNarrative: Boolean(dashboard?.narrativeComplete),
    hasPlatformStrategy: Boolean(platformStrategy),
  };

  // Once the Blueprint is fully complete, default the nav to the read-only
  // View overview; until then keep landing on Edit so it can be filled in.
  const blueprintComplete = nextPillar(client) === null;

  // Read foundation completeness from the same consolidated /dashboard summary
  // the Overview page uses, so the nav, modal, and dashboard always flip
  // together (and back, if data is lost). Computing it here from separate
  // audit/narrative queries let the nav disagree with the dashboard.
  const foundationComplete = isFoundationComplete({
    client,
    hasAudit: Boolean(dashboard?.auditComplete),
    hasNarrative: Boolean(dashboard?.narrativeComplete),
    hasPlatformStrategy: Boolean(platformStrategy),
  });

  // Show the one-time celebration the first time everything is complete and the
  // client hasn't acknowledged it yet.
  const needsCelebration = foundationComplete && client?.foundationConsolidatedAck === false;
  useEffect(() => {
    if (needsCelebration) setCelebrateOpen(true);
  }, [needsCelebration]);

  const dismissCelebration = () => {
    setCelebrateOpen(false);
    ackFoundation(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey() });
      },
    });
    setLocation("/foundation");
  };

  const expandedItems: NavItem[] = navItems.map((item) =>
    item.href === "/blueprint"
      ? { ...item, href: blueprintComplete ? "/blueprint/view" : "/blueprint" }
      : item,
  );

  // Until everything is done, keep the four separate entries. Once complete,
  // collapse Blueprint/Audit/Narrative/Platforms into a single Foundation hub
  // (inserted where Blueprint sat) while leaving the rest of the nav untouched.
  // Key off the stable label, not href: expandedItems rewrites Blueprint's href
  // to /blueprint/view once complete, and foundationComplete implies that, so an
  // href check would never match and the Foundation item would never be inserted.
  const foundationLabels = new Set([
    "Blueprint",
    "Audit",
    "Narrative",
    "Platforms",
    "Industry Overview",
  ]);
  const baseItems: NavItem[] = foundationComplete
    ? expandedItems.flatMap((item) =>
        item.label === "Blueprint"
          ? [{ href: "/foundation", icon: Layers, label: "Foundation" }]
          : foundationLabels.has(item.label)
          ? []
          : [item],
      )
    : expandedItems;

  // Only surface the Agency hub to users who actually belong to (or own) an
  // agency. Individuals opt in deliberately from Account settings; until they
  // create one, the nav stays clean.
  const withAgency: NavItem[] = hasAgency
    ? [...baseItems, { href: "/agency", icon: Building2, label: "Agency" }]
    : baseItems;
  const items: NavItem[] = access?.isAdmin
    ? [...withAgency, { href: "/admin", icon: Shield, label: "Admin" }]
    : withAgency;

  const NavLinks = () => (
    <div className="flex flex-col gap-1">
      {items.map((item) => {
        const locked = item.gate ? !isPanelUnlocked(item.gate, gateCtx) : false;
        // Keep the Blueprint nav highlighted across Edit, View, and pillar
        // pages (its href can point at either /blueprint or /blueprint/view),
        // and the Content nav highlighted across the Create + Strategy sub-routes.
        const active =
          item.label === "Foundation"
            ? [
                "/foundation",
                "/blueprint",
                "/audit",
                "/narrative",
                "/platforms",
                "/industry-overview",
              ].some((p) => location.startsWith(p))
            : item.label === "Blueprint"
            ? location.startsWith("/blueprint")
            : item.label === "Content"
            ? location.startsWith("/content")
            : location === item.href;

        // Locked items stay clickable: they navigate to the panel, which now
        // explains why it's locked and exactly what's left to unlock it. We keep
        // the lock icon and a dimmed treatment so it still reads as locked.
        if (locked) {
          return (
            <Link key={item.href} href={item.href}>
              <div
                title="Locked — open to see what's needed to unlock it"
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-2.5 rounded-none border-l-2 text-sm font-medium cursor-pointer transition-all duration-300",
                  active
                    ? "text-foreground/70 border-primary/40 bg-primary/5"
                    : "text-muted-foreground/50 border-transparent hover:text-muted-foreground hover:bg-secondary/20 hover:border-secondary-foreground/20"
                )}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="w-4 h-4 stroke-[1.5]" />
                  {item.label}
                </span>
                <Lock className="w-3.5 h-3.5 stroke-[1.5]" />
              </div>
            </Link>
          );
        }

        return (
          <Link key={item.href} href={item.href}>
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-none transition-all duration-300 cursor-pointer text-sm font-medium",
                active
                  ? "text-primary border-l-2 border-primary bg-primary/5"
                  : "text-muted-foreground border-l-2 border-transparent hover:text-foreground hover:bg-secondary/30 hover:border-secondary-foreground/20"
              )}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <item.icon className="w-4 h-4 stroke-[1.5]" />
              {item.label}
              {item.label === "Strategist" && unreadCount > 0 && (
                <span className="ml-auto h-2 w-2 rounded-full bg-destructive" aria-hidden />
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background selection:bg-primary/20 selection:text-primary">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border/50 bg-background shrink-0">
        <div className="p-8 pb-4">
          <div className="flex flex-col gap-1 mb-6">
            <Logo className="text-3xl" />
            <span className="text-xs font-medium text-muted-foreground tracking-widest uppercase">Strategist</span>
          </div>
          <ClientSwitcher />
        </div>
        <div className="px-4 mt-4">
          <NavLinks />
          <div className="mt-6 pt-4 border-t border-border/50">
            <StartOver />
          </div>
        </div>
        <div className="mt-auto px-4 py-6 border-t border-border/50">
          <UserMenu />
        </div>
      </aside>

      {/* Mobile Header & Sidebar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b border-border/50 bg-background/80 backdrop-blur-md z-50 flex items-center justify-between px-6">
        <Logo className="text-2xl" />
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-background border-r-border/50">
            <div className="p-8 pb-4">
              <div className="flex flex-col gap-1 mb-6">
                <Logo className="text-3xl" />
                <span className="text-xs font-medium text-muted-foreground tracking-widest uppercase">Strategist</span>
              </div>
              <ClientSwitcher />
            </div>
            <div className="px-4 mt-4">
              <NavLinks />
            </div>
            <div className="px-4 mt-6 pt-4 border-t border-border/50">
              <StartOver />
            </div>
            <div className="px-4 mt-6 pt-4 border-t border-border/50">
              <UserMenu />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 pt-16 md:pt-0 overflow-y-auto bg-card/30">
        <div className="flex-1 p-6 md:p-12 lg:p-16 max-w-5xl w-full mx-auto animate-in fade-in duration-700 slide-in-from-bottom-4">
          {children}
        </div>
      </main>

      {location !== "/assistant" && <AssistantPanel unreadCount={unreadCount} />}

      <Dialog
        open={celebrateOpen}
        onOpenChange={(o) => {
          if (!o) dismissCelebration();
        }}
      >
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader className="items-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-7 w-7 text-primary stroke-[1.5]" />
            </div>
            <DialogTitle className="font-serif text-2xl">Your foundation is set</DialogTitle>
            <DialogDescription className="text-base leading-relaxed">
              Blueprint, Audit, Narrative, and Platforms are all complete. We've
              brought them together into a single Foundation hub so you can review
              or refine any of them anytime — and keep your focus on creating.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={dismissCelebration}>Go to Foundation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
