import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAgencyContext,
  getGetAgencyContextQueryKey,
  setActiveClientGetter,
  type AgencyContext,
} from "@workspace/api-client-react";

const STORAGE_KEY = "arc.activeClientId";

// Module-level mirror of the selected client id so the shared fetch client can
// read it synchronously when stamping the x-arc-client-id header.
let currentActiveClientId: number | null = null;

// Synchronous accessor for raw fetch call sites (SSE streams, audit run) that
// bypass the generated client and must stamp the header themselves.
export function getActiveClientId(): number | null {
  return currentActiveClientId;
}

// Register the header getter at module load — before any component renders or
// query fires — so the very first request is already scoped. The getter always
// reads the latest module value.
setActiveClientGetter(() => currentActiveClientId);

function readStored(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

const INTENT_KEY = "arc.signupIntent";

export function setSignupIntent(kind: "individual" | "agency"): void {
  try {
    localStorage.setItem(INTENT_KEY, kind);
  } catch {
    // ignore storage failures
  }
}

export function consumeSignupIntent(): "individual" | "agency" | null {
  try {
    const v = localStorage.getItem(INTENT_KEY);
    if (v === "agency" || v === "individual") {
      localStorage.removeItem(INTENT_KEY);
      return v;
    }
    return null;
  } catch {
    return null;
  }
}

function persist(id: number | null): void {
  try {
    if (id == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // ignore storage failures
  }
}

type ActiveClientContextValue = {
  context: AgencyContext | undefined;
  isLoading: boolean;
  activeClientId: number | null;
  setActiveClient: (id: number | null) => void;
  hasAgency: boolean;
};

const ActiveClientContext = createContext<ActiveClientContextValue | null>(null);

export function ActiveClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { data: context, isLoading } = useGetAgencyContext({
    query: { queryKey: getGetAgencyContextQueryKey(), retry: false },
  });
  const [activeClientId, setActiveClientIdState] = useState<number | null>(() => {
    const initial = readStored();
    currentActiveClientId = initial;
    return initial;
  });
  const correctedRef = useRef(false);

  const setActiveClient = useCallback(
    (id: number | null) => {
      currentActiveClientId = id;
      setActiveClientIdState(id);
      persist(id);
      // Every data query is scoped to the active client; reset the cache so
      // everything refetches under the new scope.
      qc.clear();
    },
    [qc],
  );

  // Once the context loads, make sure the persisted selection is still one the
  // user can access; otherwise fall back to their own profile (or none).
  useEffect(() => {
    if (!context) return;
    const ids = new Set(context.clients.map((c) => c.id));
    if (activeClientId != null && ids.has(activeClientId)) return;
    const fallback = context.personalClientId ?? null;
    currentActiveClientId = fallback;
    setActiveClientIdState(fallback);
    persist(fallback);
    // If we had to correct a stale/invalid selection that may already have
    // driven a request, refetch everything once under the corrected scope.
    if (activeClientId != null && !correctedRef.current) {
      correctedRef.current = true;
      qc.clear();
    }
  }, [context, activeClientId, qc]);

  return (
    <ActiveClientContext.Provider
      value={{
        context,
        isLoading,
        activeClientId,
        setActiveClient,
        hasAgency: (context?.agencies.length ?? 0) > 0,
      }}
    >
      {children}
    </ActiveClientContext.Provider>
  );
}

export function useActiveClient(): ActiveClientContextValue {
  const ctx = useContext(ActiveClientContext);
  if (!ctx) {
    throw new Error("useActiveClient must be used within ActiveClientProvider");
  }
  return ctx;
}
