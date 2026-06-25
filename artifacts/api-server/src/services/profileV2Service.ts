// profileV2Service — read the full v2 operating profile for display/editing.
//
// Assembles every v2 layer + substrate table into one shape the profile viewer
// renders. Read-only; edits go through the existing apply/onboarder paths.

import {
  db,
  clientProfileTable,
  storyBankTable,
  referenceLibraryTable,
  voiceSamplesTable,
  antiExamplesTable,
  readLayer,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";

export type ProfileV2View = {
  client_id: number;
  identity: { full_name: string; headline: string };
  positioning: unknown | null;
  icp: unknown | null;
  voice: unknown | null;
  worldview: unknown | null;
  negative_space: unknown | null;
  stories: Array<{ id: number; summary: string; themes: string[]; status: string }>;
  references: Array<{ id: number; kind: string; label: string; status: string }>;
  anti_examples: Array<{ sample_text: string; why_not_this_voice: string }>;
  counts: { voice_samples: number; stories: number; references: number };
};

export async function getProfileV2(clientId: number): Promise<ProfileV2View | null> {
  const rows = await db
    .select()
    .from(clientProfileTable)
    .where(eq(clientProfileTable.id, clientId))
    .limit(1);
  const profile = rows[0];
  if (!profile) return null;

  const [stories, references, antiExamples, sampleCount] = await Promise.all([
    db
      .select({
        id: storyBankTable.id,
        summary: storyBankTable.summary,
        themes: storyBankTable.themes,
        status: storyBankTable.status,
      })
      .from(storyBankTable)
      .where(and(eq(storyBankTable.clientId, clientId), inArray(storyBankTable.status, ["confirmed", "candidate"])))
      .orderBy(desc(storyBankTable.createdAt))
      .limit(50),
    db
      .select({
        id: referenceLibraryTable.id,
        kind: referenceLibraryTable.kind,
        label: referenceLibraryTable.label,
        status: referenceLibraryTable.status,
      })
      .from(referenceLibraryTable)
      .where(and(eq(referenceLibraryTable.clientId, clientId), inArray(referenceLibraryTable.status, ["confirmed", "candidate"])))
      .orderBy(desc(referenceLibraryTable.citationCount))
      .limit(50),
    db
      .select({ sample_text: antiExamplesTable.sampleText, why_not_this_voice: antiExamplesTable.whyNotThisVoice })
      .from(antiExamplesTable)
      .where(eq(antiExamplesTable.clientId, clientId))
      .limit(10),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(voiceSamplesTable)
      .where(eq(voiceSamplesTable.clientId, clientId)),
  ]);

  return {
    client_id: clientId,
    identity: { full_name: profile.fullName, headline: profile.headline },
    positioning: safeLayer("positioning_v2", profile.positioningV2),
    icp: safeLayer("icp_v2", profile.icpV2),
    voice: safeLayer("voice_v2", profile.voiceV2),
    worldview: safeLayer("worldview_v2", profile.worldviewV2),
    negative_space: safeLayer("negative_space_v2", profile.negativeSpaceV2),
    stories,
    references,
    anti_examples: antiExamples,
    counts: {
      voice_samples: sampleCount[0]?.n ?? 0,
      stories: stories.length,
      references: references.length,
    },
  };
}

// Read a JSONB layer defensively — never let one corrupt layer 500 the whole
// profile view. On parse failure, return the raw value so the UI can still show
// something.
function safeLayer(key: Parameters<typeof readLayer>[0], raw: unknown): unknown {
  try {
    return readLayer(key, raw);
  } catch {
    return raw ?? null;
  }
}
