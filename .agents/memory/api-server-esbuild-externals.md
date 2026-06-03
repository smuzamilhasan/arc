---
name: api-server esbuild externals
description: Why some integration SDKs must be direct dependencies of the api-server artifact.
---

The api-server artifact builds with esbuild (`build.mjs`) and externalizes a long list of packages, including `@google/*`. Externalized packages are NOT bundled, so Node must resolve them from `node_modules` at runtime.

**Why:** `@google/genai` is a transitive dependency of `@workspace/integrations-gemini-ai`, not hoisted into the api-server's own `node_modules`, so the built `dist/index.mjs` threw `ERR_MODULE_NOT_FOUND: Cannot find package '@google/genai'`. (`openai` and `@anthropic-ai/sdk` are NOT in the externals list, so they get bundled and work fine.)

**How to apply:** If you import an integration whose SDK matches an esbuild `external` pattern (e.g. anything under `@google/*`), add that SDK as a direct dependency of `artifacts/api-server/package.json` so pnpm symlinks it into the artifact's node_modules. Then restart the workflow.
