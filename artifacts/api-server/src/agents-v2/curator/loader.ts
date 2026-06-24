// Drizzle implementation of CuratorLoader.
//
// Reads the v2 layers (JSONB) and the new tables (voice_samples, story_bank,
// reference_library, anti_examples) plus v1 surfaces still in use (audit,
// industry_overview, platforms, content_strategy, posts).
//
// Wiring v1 surfaces here keeps v2 agents from having to know about v1 service
// shapes — they just get the curated slice.

import {
  db,
  clientProfileTable,
  voiceSamplesTable,
  storyBankTable,
  referenceLibraryTable,
  antiExamplesTable,
  auditResultsTable,
  industryOverviewTable,
  platformStrategiesTable,
  contentStrategiesTable,
  narrativeProfilesTable,
  postsTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { readLayer } from "@workspace/db";
import type { CuratorLoader, CuratedContext } from "./contextCurator";

export const drizzleCuratorLoader: CuratorLoader = {
  async identity(clientId) {
    const rows = await db
      .select({
        fullName: clientProfileTable.fullName,
        headline: clientProfileTable.headline,
        currentRole: clientProfileTable.currentRole,
        location: clientProfileTable.location,
      })
      .from(clientProfileTable)
      .where(eq(clientProfileTable.id, clientId))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      full_name: row.fullName,
      headline: row.headline,
      role: row.currentRole,
      geography: row.location,
    };
  },

  async positioning(clientId) {
    return readLayerForClient(clientId, "positioning_v2") as Promise<CuratedContext["positioning"]>;
  },

  async icp(clientId) {
    return readLayerForClient(clientId, "icp_v2") as Promise<CuratedContext["icp"]>;
  },

  async voice(clientId) {
    return readLayerForClient(clientId, "voice_v2") as Promise<CuratedContext["voice"]>;
  },

  async voice_samples(clientId, limit) {
    const rows = await db
      .select({
        id: voiceSamplesTable.id,
        platform: voiceSamplesTable.platform,
        content: voiceSamplesTable.content,
      })
      .from(voiceSamplesTable)
      .where(eq(voiceSamplesTable.clientId, clientId))
      .orderBy(desc(voiceSamplesTable.ingestedAt))
      .limit(limit);
    return rows.map((r) => ({
      sample_id: r.id,
      platform: r.platform,
      excerpt: r.content.slice(0, 1200), // curator caps; voice_extractor pulls full via its own fetch
    }));
  },

  async narrative(clientId) {
    const rows = await db
      .select({
        coreNarrative: narrativeProfilesTable.coreNarrative,
        pointOfView: narrativeProfilesTable.pointOfView,
        themes: narrativeProfilesTable.themes,
      })
      .from(narrativeProfilesTable)
      .where(eq(narrativeProfilesTable.clientId, clientId))
      .orderBy(desc(narrativeProfilesTable.id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      core_narrative: row.coreNarrative ?? "",
      point_of_view: row.pointOfView ?? "",
      themes: Array.isArray(row.themes) ? row.themes.map((t) => t.title) : [],
    };
  },

  async worldview(clientId) {
    return readLayerForClient(clientId, "worldview_v2") as Promise<CuratedContext["worldview"]>;
  },

  async stories(clientId, limit) {
    const rows = await db
      .select({
        id: storyBankTable.id,
        summary: storyBankTable.summary,
        themes: storyBankTable.themes,
        lastUsedAt: storyBankTable.lastUsedAt,
      })
      .from(storyBankTable)
      .where(and(eq(storyBankTable.clientId, clientId), eq(storyBankTable.status, "confirmed")))
      .orderBy(desc(storyBankTable.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      story_id: r.id,
      summary: r.summary,
      themes: r.themes,
      last_used_at: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    }));
  },

  async references(clientId, limit) {
    const rows = await db
      .select({
        id: referenceLibraryTable.id,
        kind: referenceLibraryTable.kind,
        label: referenceLibraryTable.label,
        citationCount: referenceLibraryTable.citationCount,
      })
      .from(referenceLibraryTable)
      .where(and(eq(referenceLibraryTable.clientId, clientId), eq(referenceLibraryTable.status, "confirmed")))
      .orderBy(desc(referenceLibraryTable.citationCount))
      .limit(limit);
    return rows.map((r) => ({
      reference_id: r.id,
      kind: r.kind,
      label: r.label,
      citation_count: r.citationCount,
    }));
  },

  async negative_space(clientId) {
    return readLayerForClient(clientId, "negative_space_v2") as Promise<CuratedContext["negative_space"]>;
  },

  async anti_examples(clientId, limit) {
    const rows = await db
      .select({
        sampleText: antiExamplesTable.sampleText,
        whyNotThisVoice: antiExamplesTable.whyNotThisVoice,
      })
      .from(antiExamplesTable)
      .where(eq(antiExamplesTable.clientId, clientId))
      .orderBy(desc(antiExamplesTable.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      sample_text: r.sampleText,
      why_not_this_voice: r.whyNotThisVoice,
    }));
  },

  async audit(clientId) {
    const rows = await db
      .select()
      .from(auditResultsTable)
      .where(eq(auditResultsTable.clientId, clientId))
      .orderBy(desc(auditResultsTable.id))
      .limit(1);
    return rows[0] ?? null;
  },

  async industry_overview(clientId) {
    const rows = await db
      .select()
      .from(industryOverviewTable)
      .where(eq(industryOverviewTable.clientId, clientId))
      .orderBy(desc(industryOverviewTable.id))
      .limit(1);
    return rows[0] ?? null;
  },

  async platforms(clientId) {
    const rows = await db
      .select()
      .from(platformStrategiesTable)
      .where(eq(platformStrategiesTable.clientId, clientId));
    return rows;
  },

  async content_strategy(clientId) {
    const rows = await db
      .select()
      .from(contentStrategiesTable)
      .where(eq(contentStrategiesTable.clientId, clientId))
      .orderBy(desc(contentStrategiesTable.id))
      .limit(1);
    return rows[0] ?? null;
  },

  async recent_drafts(clientId, limit) {
    const rows = await db
      .select({
        id: postsTable.id,
        platform: postsTable.platform,
        status: postsTable.status,
        title: postsTable.title,
      })
      .from(postsTable)
      .where(eq(postsTable.clientId, clientId))
      .orderBy(desc(postsTable.updatedAt))
      .limit(limit);
    return rows;
  },

  async calendar_window(clientId, days) {
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        id: postsTable.id,
        platform: postsTable.platform,
        scheduledAt: postsTable.scheduledAt,
        title: postsTable.title,
      })
      .from(postsTable)
      .where(
        and(
          eq(postsTable.clientId, clientId),
          gte(postsTable.scheduledAt, now),
          lte(postsTable.scheduledAt, horizon)
        )
      )
      .orderBy(postsTable.scheduledAt);
    return rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : "",
      title: r.title,
    }));
  },
};

async function readLayerForClient(
  clientId: number,
  key: "positioning_v2" | "icp_v2" | "voice_v2" | "worldview_v2" | "negative_space_v2"
): Promise<unknown> {
  const columnMap = {
    positioning_v2: clientProfileTable.positioningV2,
    icp_v2: clientProfileTable.icpV2,
    voice_v2: clientProfileTable.voiceV2,
    worldview_v2: clientProfileTable.worldviewV2,
    negative_space_v2: clientProfileTable.negativeSpaceV2,
  } as const;
  const column = columnMap[key];
  const rows = await db
    .select({ value: column })
    .from(clientProfileTable)
    .where(eq(clientProfileTable.id, clientId))
    .limit(1);
  const value = rows[0]?.value;
  return readLayer(key, value);
}
