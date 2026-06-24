// LLM adapter layer — concrete StructuredLLMClient implementations behind the
// interface declared by AgentRunner.
//
// One adapter ships at foundation: OpenAI via the workspace's openai
// integration. An Anthropic adapter can land in a follow-up; AgentRunner
// doesn't care which the caller wires in.

export {
  OpenAIStructuredClient,
  openaiStructuredClient,
  OpenAIAdapterError,
} from "./openaiAdapter";
export type { OpenAIAdapterOptions } from "./openaiAdapter";
