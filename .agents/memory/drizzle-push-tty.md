---
name: drizzle-kit push TTY conflict
description: Working around drizzle-kit push interactive prompts in the non-TTY agent shell.
---

`pnpm --filter @workspace/db run push` fails with "Interactive prompts require a TTY" when drizzle detects an ambiguous change — e.g. an old table dropped and new tables added, which triggers a "is this a rename?" prompt.

**Why:** The agent shell has no TTY. The `--force` flag (push-force) only auto-confirms data-loss, NOT the rename-vs-create schema-conflict prompt, so it fails the same way.

**How to apply:** Resolve the ambiguity before pushing. The simplest fix is to manually `DROP TABLE IF EXISTS <old_table> CASCADE;` (via the executeSql sandbox callback) so the remaining diff is only new tables to create, then run `push` normally.
