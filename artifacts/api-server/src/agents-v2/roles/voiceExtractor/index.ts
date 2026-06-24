// VoiceExtractor — public entry point.
//
// Importing this module registers the contract with the role registry. Side
// effect intentional: keeps each agent self-contained and prevents the registry
// from coupling to every agent's package.

import { registerContract } from "../registry";
import { voiceExtractorContract } from "./contract";

registerContract(voiceExtractorContract as Parameters<typeof registerContract>[0]);

export { voiceExtractorContract } from "./contract";
export { runVoiceExtractor } from "./pipeline";
export { extractDeterministicVoice } from "./deterministicPass";
