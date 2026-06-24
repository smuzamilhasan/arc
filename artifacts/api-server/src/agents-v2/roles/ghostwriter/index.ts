import { registerContract } from "../registry";
import { ghostwriterContract } from "./contract";

registerContract(ghostwriterContract as Parameters<typeof registerContract>[0]);

export { ghostwriterContract } from "./contract";
export type { GhostwriterInput } from "./contract";
export { MIN_VOICE_CONFIDENCE_BY_PLATFORM, MAX_BODY_BY_PLATFORM } from "./contract";
