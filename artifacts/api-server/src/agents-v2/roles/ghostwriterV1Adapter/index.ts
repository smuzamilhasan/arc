// v1 Ghostwriter baseline adapter — public entry point.
//
// Registers under role name "ghostwriter_v1" so the eval harness picks it up
// alongside the v2 ghostwriter. There is NO route for this adapter and no
// service-level call site — it exists for eval baselining only.

import { registerContract } from "../registry";
import { ghostwriterV1AdapterContract } from "./contract";

registerContract(
  ghostwriterV1AdapterContract as Parameters<typeof registerContract>[0]
);

export { ghostwriterV1AdapterContract } from "./contract";
export { runGhostwriterV1Baseline } from "./pipeline";
