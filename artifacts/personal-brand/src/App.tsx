import { useEffect, useRef } from "react";
import {
  ClerkProvider,
  SignIn,
  SignUp,
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
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import Landing from "@/pages/landing";
import Entry from "@/pages/entry";
import Onboard from "@/pages/onboard";
import Dashboard from "@/pages/dashboard";
import Blueprint from "@/pages/blueprint";
import BlueprintView from "@/pages/blueprint-view";
import PillarPage from "@/pages/pillar";
import Audit from "@/pages/audit";
import Narrative from "@/pages/narrative";
import Platforms from "@/pages/platforms";
import Calendar from "@/pages/calendar";
import Content from "@/pages/content";
import Ideas from "@/pages/ideas";
import Assistant from "@/pages/assistant";
import Account from "@/pages/account";
import Admin from "@/pages/admin";
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
    colorPrimary: "hsl(20 80% 45%)",
    colorForeground: "hsl(220 30% 12%)",
    colorMutedForeground: "hsl(220 15% 45%)",
    colorDanger: "hsl(0 80% 50%)",
    colorBackground: "hsl(42 25% 98%)",
    colorInput: "hsl(42 25% 99%)",
    colorInputForeground: "hsl(220 30% 12%)",
    colorNeutral: "hsl(40 10% 85%)",
    fontFamily: "'Outfit', sans-serif",
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

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Entry />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
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

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to continue shaping your arc",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Start building your personal brand",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ApiAuthTokenBridge />
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/onboard">
              <RequireAuth>
                <Onboard />
              </RequireAuth>
            </Route>
            <Route path="/*">
              <RequireAuth>
                <Layout>
                  <Switch>
                    <Route path="/dashboard" component={Dashboard} />
                    <Route path="/blueprint" component={Blueprint} />
                    <Route path="/blueprint/view" component={BlueprintView} />
                    <Route path="/blueprint/:pillar" component={PillarPage} />
                    <Route path="/audit" component={Audit} />
                    <Route path="/narrative" component={Narrative} />
                    <Route path="/platforms" component={Platforms} />
                    <Route path="/calendar" component={Calendar} />
                    <Route path="/content" component={Content} />
                    <Route path="/ideas" component={Ideas} />
                    <Route path="/assistant" component={Assistant} />
                    <Route path="/account" component={Account} />
                    <Route path="/admin" component={Admin} />
                    <Route component={NotFound} />
                  </Switch>
                </Layout>
              </RequireAuth>
            </Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
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
