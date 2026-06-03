---
name: Gemini grounding for server-side web search
description: Using Gemini Google Search grounding through the Replit Gemini integration to get real web results server-side.
---

Gemini's `googleSearch` tool works through the Replit-managed Gemini integration proxy (`@workspace/integrations-gemini-ai`). Call `ai.models.generateContent({ model, contents, config: { tools: [{ googleSearch: {} }] } })`. The response `.text` is the grounded answer; `candidates[0].groundingMetadata.groundingChunks` holds the sources.

**Why:** External APIs like Exa are only reachable from the code_execution sandbox (via `externalApi__*` callbacks), NOT from server runtime code. Gemini grounding is the robust server-side path to real Google results without an API key.

**How to apply:** Grounding chunk `uri` values are opaque `vertexaisearch.cloud.google.com/grounding-api-redirect/...` redirect URLs — the real source domain is in the chunk `web.title` (e.g. "microsoft.com", "wikipedia.org"). Classify/label results by `title`, not by parsing the `uri` host. The redirect `uri` still works as a clickable link.
