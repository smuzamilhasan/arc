// Role registry — single map from AgentRole → RoleContract.
//
// Empty in the foundation PR. As each agent migration lands (Ghostwriter,
// Strategist, etc.), the agent's PR registers itself here. Code that needs a
// contract by name goes through `getContract`.

import type { AgentRole } from "../contracts/types";
import type { AnyRoleContract } from "../contracts/roleContract";

const REGISTRY = new Map<AgentRole, AnyRoleContract>();

export function registerContract(contract: AnyRoleContract): void {
  if (REGISTRY.has(contract.name)) {
    throw new Error(`RoleContract already registered for role: ${contract.name}`);
  }
  REGISTRY.set(contract.name, contract);
}

export function getContract(role: AgentRole): AnyRoleContract {
  const c = REGISTRY.get(role);
  if (!c) {
    throw new Error(
      `No RoleContract registered for role: ${role}. ` +
        `Did you import the role's module so its side-effectful registration runs?`
    );
  }
  return c;
}

export function listRegisteredRoles(): AgentRole[] {
  return Array.from(REGISTRY.keys());
}

export function isRoleRegistered(role: AgentRole): boolean {
  return REGISTRY.has(role);
}
