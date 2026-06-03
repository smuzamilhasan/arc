// Ensure the AI integration client modules can be imported during tests.
// These modules throw at import time if the env vars are missing. The tests
// never make real AI calls, so placeholder values are sufficient when the
// real integration env vars are not present.
const aiEnvFallbacks: Record<string, string> = {
  AI_INTEGRATIONS_OPENAI_BASE_URL: "https://example.invalid/openai",
  AI_INTEGRATIONS_OPENAI_API_KEY: "test-openai-key",
  AI_INTEGRATIONS_ANTHROPIC_BASE_URL: "https://example.invalid/anthropic",
  AI_INTEGRATIONS_ANTHROPIC_API_KEY: "test-anthropic-key",
  AI_INTEGRATIONS_GEMINI_BASE_URL: "https://example.invalid/gemini",
  AI_INTEGRATIONS_GEMINI_API_KEY: "test-gemini-key",
};

for (const [key, value] of Object.entries(aiEnvFallbacks)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

// Keep request logging out of the test output.
if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = "silent";
}
