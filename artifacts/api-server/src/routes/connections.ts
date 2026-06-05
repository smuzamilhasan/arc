import { Router } from "express";
import { db, schedulerConnectionsTable } from "@workspace/db";
import { SaveConnectionBody, DeleteConnectionParams } from "@workspace/api-zod";
import { and, eq } from "drizzle-orm";
import { getClientForUser } from "./client";
import { externalApiRateLimit } from "../middlewares/aiRateLimit";
import { getProvider, listProviderMeta } from "../services/schedulers";
import { encryptSecret, isEncryptionConfigured } from "../lib/crypto";

const router = Router();

// Connection status returned to the client. Deliberately omits the stored API
// key — the raw key never leaves the server.
function serializeConnection(c: typeof schedulerConnectionsTable.$inferSelect) {
  return {
    provider: c.provider,
    connected: true,
    accountRef: c.accountRef,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// Static provider metadata for the Connections UI. No auth-sensitive data.
router.get("/connections/providers", (_req, res) => {
  res.json(listProviderMeta());
});

router.get("/connections", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(schedulerConnectionsTable)
    .where(eq(schedulerConnectionsTable.clientId, client.id));
  res.json(rows.map(serializeConnection));
});

// Connect (or update) a scheduler. We verify the key against the provider FIRST,
// then store it encrypted at rest. A bad key never gets persisted.
router.post("/connections", externalApiRateLimit, async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const parsed = SaveConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { provider: providerId, apiKey, accountRef } = parsed.data;

  const provider = getProvider(providerId);
  if (!provider) {
    res.status(400).json({ error: "Unsupported scheduler" });
    return;
  }
  if (!isEncryptionConfigured()) {
    req.log.error("APP_ENCRYPTION_KEY missing; cannot store scheduler key");
    res.status(500).json({ error: "Server is not configured to store scheduler keys." });
    return;
  }

  const verify = await provider.verifyCredentials(apiKey, accountRef ?? undefined);
  if (!verify.ok) {
    res.status(400).json({ error: verify.error });
    return;
  }

  const now = new Date();
  const encrypted = encryptSecret(apiKey);
  const resolvedAccountRef = accountRef ?? verify.accountLabel ?? null;

  const [saved] = await db
    .insert(schedulerConnectionsTable)
    .values({
      clientId: client.id,
      provider: providerId,
      apiKeyEncrypted: encrypted,
      accountRef: resolvedAccountRef,
    })
    .onConflictDoUpdate({
      target: [schedulerConnectionsTable.clientId, schedulerConnectionsTable.provider],
      set: { apiKeyEncrypted: encrypted, accountRef: resolvedAccountRef, updatedAt: now },
    })
    .returning();

  res.json(serializeConnection(saved));
});

router.delete("/connections/:provider", async (req, res) => {
  const client = await getClientForUser(req.userId!);
  if (!client) {
    res.status(404).json({ error: "Not connected" });
    return;
  }
  const parsed = DeleteConnectionParams.safeParse({ provider: req.params.provider });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid provider" });
    return;
  }
  const deleted = await db
    .delete(schedulerConnectionsTable)
    .where(
      and(
        eq(schedulerConnectionsTable.clientId, client.id),
        eq(schedulerConnectionsTable.provider, parsed.data.provider),
      ),
    )
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Not connected" });
    return;
  }
  res.status(204).send();
});

export default router;
