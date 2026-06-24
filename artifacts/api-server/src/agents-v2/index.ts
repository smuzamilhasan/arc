// v2 agent framework — public entry point.
//
// Foundation only. Concrete agent contracts (Ghostwriter, Strategist, etc.)
// land in subsequent PRs and register themselves with the registry.

export * from "./contracts/types";
export * from "./contracts/roleContract";
export * from "./contracts/profilePatch";
export * from "./contracts/outputs";
export * from "./curator/contextCurator";
export * from "./runner/agentRunner";
export * from "./roles/registry";
