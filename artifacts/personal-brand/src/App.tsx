import { useEffect, useRef } from "react";
import {
  ClerkProvider,
  SignIn,
  Show,
  useClerk,
  useAuth,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import {
  Switch,
  Route,
  Redirect,
  useLocation,
  Router as WouterRouter,
} from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  setAuthTokenGetter,
  useGetAdminAccess,
  getGetAdminAccessQueryKey,
} from "@workspace/api-client-react";
import {
  ActiveClientProvider,
  setPendingInvite,
} from "@/lib/active-client";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import MarketingLanding from "@/pages/marketing";
import Entry from "@/pages/entry";
import Onboard from "@/pages/onboard";
import Dashboard from "@/pages/dashboard";
import Blueprint from "@/pages/blueprint";
import BlueprintView from "@/pages/blueprint-view";
import PillarPage from "@/pages/pillar";
import Audit from "@/pages/audit";
import Dossier from "@/pages/dossier";
import Narrative from "@/pages/narrative";
import Platforms from "@/pages/platforms";
import IndustryOverview from "@/pages/industry-overview";
import Foundation from "@/pages/foundation";
import Calendar from "@/pages/calendar";
import Content, { ContentStrategyPage } from "@/pages/content";
import Ideas from "@/pages/ideas";
import Manager from "@/pages/manager";
import Learn from "@/pages/learn";
import Assistant from "@/pages/assistant";
import Planner from "@/pages/planner";
import Account from "@/pages/account";
import CalibratePage from "@/pages/calibrate";
import GhostwriterTestPage from "@/pages/ghostwriter-test";
import OnboardV2Page from "@/pages/onboard-v2";
import ProfileV2Page from "@/pages/profile-v2";
import StudioPage from "@/pages/studio";
import Journey from "@/pages/journey";
import Console from "@/pages/console";
import Admin from "@/pages/admin";
import AgencyPage from "@/pages/agency";
import Invite from "@/pages/invite";
import NotFound from "@/pages/not-found";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(159 74% 52%)",
    colorForeground: "hsl(48 21% 91%)",
    colorMutedForeground: "hsl(208 7% 56%)",
    colorDanger: "hsl(350 84% 63%)",
    colorBackground: "hsl(200 21% 8%)",
    colorInput: "hsl(200 18% 13%)",
    colorInputForeground: "hsl(48 21% 91%)",
    colorNeutral: "hsl(200 18% 13%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg border border-border/60",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif text-2xl text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary font-medium hover:text-primary/80",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-foreground",
    alertText: "text-foreground",
    logoBox: "h-8",
    logoImage: "h-8",
    socialButtonsBlockButton: "border border-border bg-card hover:bg-secondary/40",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 normal-case font-medium",
    formFieldInput: "bg-background border border-input text-foreground",
    footerAction: "text-muted-foreground",
    dividerLine: "bg-border",
    alert: "border border-border bg-card",
    otpCodeFieldInput: "border border-input text-foreground",
    formFieldRow: "",
    main: "",
  },
};

// Invited founding members only — no public sign-up. The <SignIn> has no
// sign-up link; the production Clerk instance is restriction-gated (allowlist).
function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/login`}
        forceRedirectUrl={`${basePath}/app`}
      />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        {/* "~" escapes the /app router base so we land on the root /login. */}
        <Redirect to="~/login" />
      </Show>
    </>
  );
}

// Invitees are almost always signed-out new users. A bare RequireAuth would
// bounce them to /login and drop the token, so persist the invite first and
// resume it in Entry after auth. Invited members sign in via the magic link.
function InviteGate({ token }: { token: string }) {
  return (
    <>
      <Show when="signed-in">
        <Invite />
      </Show>
      <Show when="signed-out">
        <StashInviteAndRedirect token={token} />
      </Show>
    </>
  );
}

function StashInviteAndRedirect({ token }: { token: string }) {
  setPendingInvite(token);
  return <Redirect to="/login" />;
}

// Attach the Clerk session token as a Bearer header on every API request.
// Cookie-based auth alone fails when the app runs inside the embedded preview
// iframe, where the Clerk session cookie is a third-party cookie the browser
// blocks — so all API calls 401. The server's clerkMiddleware also accepts a
// Bearer token, so sending one makes auth work regardless of cookie context.
function ApiAuthTokenBridge() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    setAuthTokenGetter(() => getTokenRef.current());
    return () => setAuthTokenGetter(null);
  }, []);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// The walled-off platform. Rendered under the /app router base, so every
// existing page keeps its own path (/dashboard, /blueprint, …) and resolves
// under /app/* automatically. Auth is enforced here (client) and by the
// server-side /app/* gate in the API (app.ts) — defense in depth.
//
// BuildMyArc is in development: only admins (ADMIN_EMAILS) get the full
// product. Every other signed-in user — including anyone who joins via an
// agency invite, now or in future — is locked to the engagement Journey and
// nothing else. The gate is client-side; see notes for server-side hardening.
function AppRoutes() {
  return (
    <RequireAuth>
      <PlatformGate />
    </RequireAuth>
  );
}

function PlatformGate() {
  // Right after sign-in the Clerk session token can lag the first API request,
  // so the admin check 401s; because the whole app blocks on it, that surfaced
  // as a loader stuck until a manual refresh. Fix (mirrors Entry's handling):
  // wait for Clerk to finish loading, retry transient failures so the token
  // race self-heals, and never decide "non-admin" until we have a definitive
  // successful answer.
  const { isLoaded } = useAuth();
  const { data: access, isLoading, isError, refetch } = useGetAdminAccess({
    query: {
      queryKey: getGetAdminAccessQueryKey(),
      enabled: isLoaded,
      retry: (failureCount) => failureCount < 3,
    },
  });

  if (!isLoaded || isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <span>Couldn’t load your workspace.</span>
        <button
          onClick={() => refetch()}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary/30"
        >
          Retry
        </button>
      </div>
    );
  }

  // Non-admins: the engagement Journey is the only surface. Every other path
  // bounces back to it.
  if (!access?.isAdmin) {
    return (
      <Layout>
        <Switch>
          <Route path="/journey" component={Journey} />
          <Route>
            <Redirect to="/journey" />
          </Route>
        </Switch>
      </Layout>
    );
  }

  // Admins: the full platform.
  return (
      <Switch>
        <Route path="/" component={Entry} />
        <Route path="/onboard">
          <Onboard />
        </Route>
        <Route path="/*">
          <Layout>
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/agency" component={AgencyPage} />
              <Route path="/blueprint" component={Blueprint} />
              <Route path="/blueprint/view" component={BlueprintView} />
              <Route path="/blueprint/:pillar" component={PillarPage} />
              <Route path="/foundation" component={Foundation} />
              <Route path="/audit" component={Audit} />
              <Route path="/dossier" component={Dossier} />
              <Route path="/narrative" component={Narrative} />
              <Route path="/platforms" component={Platforms} />
              <Route path="/industry-overview" component={IndustryOverview} />
              <Route path="/calendar" component={Calendar} />
              <Route path="/content/strategy" component={ContentStrategyPage} />
              <Route path="/content" component={Content} />
              <Route path="/ideas" component={Ideas} />
              <Route path="/manager" component={Manager} />
              <Route path="/planner" component={Planner} />
              <Route path="/learn" component={Learn} />
              <Route path="/connections">
                <Redirect to="/account" />
              </Route>
              <Route path="/assistant" component={Assistant} />
              <Route path="/calibrate" component={CalibratePage} />
              <Route path="/ghostwriter-test" component={GhostwriterTestPage} />
              <Route path="/onboard-v2" component={OnboardV2Page} />
              <Route path="/profile-v2" component={ProfileV2Page} />
              <Route path="/studio" component={StudioPage} />
              <Route path="/journey" component={Journey} />
              <Route path="/console" component={Console} />
              <Route path="/account" component={Account} />
              <Route path="/admin" component={Admin} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </Route>
      </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/login`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to continue shaping your arc",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ApiAuthTokenBridge />
        <ClerkQueryClientCacheInvalidator />
        <ActiveClientProvider>
        <TooltipProvider>
          <Switch>
            {/* Public marketing landing — the front of the product. */}
            <Route path="/" component={MarketingLanding} />
            <Route path="/login/*?" component={SignInPage} />
            <Route path="/invite/:token">
              {(params) => <InviteGate token={params.token} />}
            </Route>
            {/* The platform, walled off under /app/* (nested router rebases all
                of its internal links/redirects, so the pages keep their paths). */}
            <Route path="/app" nest>
              <AppRoutes />
            </Route>
            {/* Unknown public path → the landing. */}
            <Route component={MarketingLanding} />
          </Switch>
          <Toaster />
        </TooltipProvider>
        </ActiveClientProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
