import { registerContract } from "../registry";
import { onboarderContract } from "./contract";

registerContract(onboarderContract as Parameters<typeof registerContract>[0]);

export { onboarderContract, renderConversationTail } from "./contract";
export type { OnboarderInput, SlotKey } from "./contract";
export {
  PLAYBOOK,
  chooseNextSlot,
  isCoverageComplete,
  aggregateConfidence,
} from "./playbook";
export type { SlotPlaybook } from "./playbook";
