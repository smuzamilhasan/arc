#!/bin/bash
set -e
pnpm install --frozen-lockfile
# NOTE for Railway: do NOT run DB schema push automatically on every merge.
# On Railway, run migrations as a deliberate pre-deploy step:
#   DATABASE_URL=<railway_url> pnpm --filter @workspace/db run push
# The line below is kept for local development convenience only.
# pnpm --filter db push
