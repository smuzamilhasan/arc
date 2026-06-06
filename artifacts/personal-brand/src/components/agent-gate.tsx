import type { ReactNode } from "react";
import {
  useGetClient,
  getGetClientQueryKey,
  useGetDashboard,
  getGetDashboardQueryKey,
  useGetPlatforms,
  getGetPlatformsQueryKey,
  useGetIndustryOverview,
  getGetIndustryOverviewQueryKey,
} from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import {
  PANEL_GATES,
  panelGatePrerequisites,
  isPanelUnlocked,
  type PanelGateContext,
} from "@/lib/blueprint";
import { LockedPanel } from "@/components/locked-panel";

// Computes the shared "agents" gate from the same queries the rest of the app
// uses, returning the gate context, whether the agents are unlocked, and a
// loading flag. Every agent (Strategist, Manager, Planner, Investigator/Dossier,
// Ghostwriter) reasons from the finished foundation, so none open until the
// entire foundation — Blueprint, Audit, Narrative, Platforms, and the Industry
// Overview capstone — is complete. The server mirrors this with a 403 on each
// agent's entry endpoint, so the lock is real, not cosmetic.
export function useAgentsGate(): {
  gateCtx: PanelGateContext;
  unlocked: boolean;
  isLoading: boolean;
} {
  const { data: client, isLoading: isClientLoading } = useGetClient({
    query: { queryKey: getGetClientQueryKey(), retry: false },
  });
  const { data: dashboard, isLoading: isDashboardLoading } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey(), retry: false },
  });
  const { data: platformStrategy, isLoading: isPlatformsLoading } = useGetPlatforms({
    query: { queryKey: getGetPlatformsQueryKey(), retry: false },
  });
  const { data: overview, isLoading: isOverviewLoading } = useGetIndustryOverview({
    query: { queryKey: getGetIndustryOverviewQueryKey(), retry: false },
  });

  const gateCtx: PanelGateContext = {
    client,
    hasAudit: Boolean(dashboard?.auditComplete),
    hasNarrative: Boolean(dashboard?.narrativeComplete),
    hasPlatformStrategy: Boolean(platformStrategy),
    hasIndustryOverview: Boolean(overview),
  };

  return {
    gateCtx,
    unlocked: isPanelUnlocked("agents", gateCtx),
    isLoading:
      isClientLoading || isDashboardLoading || isPlatformsLoading || isOverviewLoading,
  };
}

// Full-page wrapper for an agent surface: renders the shared locked state until
// the full foundation is complete, then the agent itself.
export function AgentGate({ children }: { children: ReactNode }) {
  const { gateCtx, unlocked, isLoading } = useAgentsGate();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <LockedPanel
        title={PANEL_GATES.agents.title}
        description={PANEL_GATES.agents.description}
        prerequisites={panelGatePrerequisites("agents", gateCtx)}
      />
    );
  }

  return <>{children}</>;
}
