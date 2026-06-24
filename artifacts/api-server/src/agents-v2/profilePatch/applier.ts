// ProfilePatch applier — the deterministic write surface for v2 agents.
//
// Agents emit ProfilePatch operations as their output. This module is the only
// code that translates those operations into actual database writes. Two
// reasons it lives in one place:
//
//   1. Audit. Every mutation an agent makes flows through here. Easy to log,
//      easy to reverse, easy to deny.
//   2. Validation. The accessors re-validate each layer against the Zod schema
//      on write, so even a buggy agent can't corrupt the substrate.
//
// Applier is database-aware (Drizzle) but does NOT touch v1 string fields. v2
// agents only write to v2 columns + v2 tables.

import {
  db,
  clientProfileTable,
  storyBankTable,
  referenceLibraryTable,
  antiExamplesTable,
  voiceFeaturesTable,
  patchLayer,
  readLayer,
  type ProfileV2LayerKey,
  type LayerValueByKey,
  type VoiceV2,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ProfilePatch, ProfilePatchOp } from "../contracts/profilePatch";

export type ApplyProfilePatchResult = {
  client_id: number;
  ops_applied: number;
  new_story_ids: number[];
  new_reference_ids: number[];
  new_anti_example_ids: number[];
  voice_features_snapshot_id?: number;
  /** Per-op result for audit. */
  per_op: Array<{ op: string; status: "applied" | "skipped"; reason?: string }>;
};

export async function applyProfilePatch(patch: ProfilePatch): Promise<ApplyProfilePatchResult> {
  const result: ApplyProfilePatchResult = {
    client_id: patch.client_id,
    ops_applied: 0,
    new_story_ids: [],
    new_reference_ids: [],
    new_anti_example_ids: [],
    per_op: [],
  };

  // Group layer patches so we update each column at most once.
  const layerPatches: Partial<{
    positioning_v2: Partial<LayerValueByKey["positioning_v2"]>;
    icp_v2: Partial<LayerValueByKey["icp_v2"]>;
    voice_v2: Partial<LayerValueByKey["voice_v2"]>;
    worldview_v2: Partial<LayerValueByKey["worldview_v2"]>;
    negative_space_v2: Partial<LayerValueByKey["negative_space_v2"]>;
  }> = {};

  const storyOps: Array<Extract<ProfilePatchOp, { op: "story_append" }>> = [];
  const refOps: Array<Extract<ProfilePatchOp, { op: "reference_append" }>> = [];
  const antiOps: Array<Extract<ProfilePatchOp, { op: "anti_example_append" }>> = [];
  let voicePatchPresent = false;

  for (const op of patch.ops) {
    switch (op.op) {
      case "positioning_patch":
        layerPatches.positioning_v2 = { ...(layerPatches.positioning_v2 ?? {}), ...op.patch };
        break;
      case "icp_patch":
        layerPatches.icp_v2 = { ...(layerPatches.icp_v2 ?? {}), ...op.patch };
        break;
      case "voice_patch":
        layerPatches.voice_v2 = { ...(layerPatches.voice_v2 ?? {}), ...op.patch };
        voicePatchPresent = true;
        break;
      case "worldview_patch":
        layerPatches.worldview_v2 = { ...(layerPatches.worldview_v2 ?? {}), ...op.patch };
        break;
      case "negative_space_patch":
        layerPatches.negative_space_v2 = { ...(layerPatches.negative_space_v2 ?? {}), ...op.patch };
        break;
      case "story_append":
        storyOps.push(op);
        break;
      case "reference_append":
        refOps.push(op);
        break;
      case "anti_example_append":
        antiOps.push(op);
        break;
    }
  }

  // 1. Layer updates (one read + one write per touched column).
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        positioningV2: clientProfileTable.positioningV2,
        icpV2: clientProfileTable.icpV2,
        voiceV2: clientProfileTable.voiceV2,
        worldviewV2: clientProfileTable.worldviewV2,
        negativeSpaceV2: clientProfileTable.negativeSpaceV2,
      })
      .from(clientProfileTable)
      .where(eq(clientProfileTable.id, patch.client_id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new ProfilePatchApplyError(`client_profile not found: ${patch.client_id}`);
    }

    const updates: Record<string, unknown> = {};
    for (const [key, partial] of Object.entries(layerPatches) as Array<[
      ProfileV2LayerKey,
      Record<string, unknown>,
    ]>) {
      if (!partial) continue;
      const existing = readLayer(
        key,
        (row as Record<string, unknown>)[camel(key)]
      );
      const merged = patchLayer(key, existing as LayerValueByKey[typeof key] | null, partial as Partial<LayerValueByKey[typeof key]>);
      updates[camel(key)] = merged;
      result.per_op.push({ op: `${key}_patch`, status: "applied" });
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await tx.update(clientProfileTable).set(updates).where(eq(clientProfileTable.id, patch.client_id));
    }

    // 2. Story bank appends.
    if (storyOps.length > 0) {
      const values = storyOps.map((s) => ({
        clientId: patch.client_id,
        summary: s.summary,
        body: s.body,
        themes: s.themes,
        sourceSampleIds: s.source_sample_ids,
        status: s.status,
      }));
      const inserted = await tx
        .insert(storyBankTable)
        .values(values)
        .returning({ id: storyBankTable.id });
      result.new_story_ids = inserted.map((r) => r.id);
      for (const s of storyOps) {
        result.per_op.push({ op: `story_append:${s.summary.slice(0, 40)}`, status: "applied" });
      }
    }

    // 3. Reference appends.
    if (refOps.length > 0) {
      const values = refOps.map((r) => ({
        clientId: patch.client_id,
        kind: r.kind,
        label: r.label,
        context: r.context,
        sourceSampleIds: r.source_sample_ids,
        status: r.status,
      }));
      const inserted = await tx
        .insert(referenceLibraryTable)
        .values(values)
        .returning({ id: referenceLibraryTable.id });
      result.new_reference_ids = inserted.map((r) => r.id);
      for (const r of refOps) {
        result.per_op.push({ op: `reference_append:${r.label}`, status: "applied" });
      }
    }

    // 4. Anti-example appends.
    if (antiOps.length > 0) {
      const values = antiOps.map((a) => ({
        clientId: patch.client_id,
        sampleText: a.sample_text,
        whyNotThisVoice: a.why_not_this_voice,
        sourceUrl: a.source_url ?? null,
      }));
      const inserted = await tx
        .insert(antiExamplesTable)
        .values(values)
        .returning({ id: antiExamplesTable.id });
      result.new_anti_example_ids = inserted.map((r) => r.id);
      for (const a of antiOps) {
        result.per_op.push({ op: `anti_example_append`, status: "applied" });
      }
    }

    // 5. Voice features snapshot (audit trail; immutable).
    if (voicePatchPresent && layerPatches.voice_v2) {
      // The merged voice layer was already written above; snapshot it here.
      const updatedRows = await tx
        .select({ voiceV2: clientProfileTable.voiceV2 })
        .from(clientProfileTable)
        .where(eq(clientProfileTable.id, patch.client_id))
        .limit(1);
      const voiceV2 = updatedRows[0]?.voiceV2 as VoiceV2 | null;
      if (voiceV2) {
        const snapshot = await tx
          .insert(voiceFeaturesTable)
          .values({
            clientId: patch.client_id,
            features: voiceV2,
            sampleCount: voiceV2.sample_count ?? 0,
            confidence: voiceV2.confidence ?? 0,
            inputDigest: { sample_ids: [], hash: "" }, // Filled by caller when known; required NOT NULL
          })
          .returning({ id: voiceFeaturesTable.id });
        result.voice_features_snapshot_id = snapshot[0]?.id;
      }
    }
  });

  result.ops_applied = patch.ops.length;
  return result;
}

function camel(key: ProfileV2LayerKey): string {
  switch (key) {
    case "positioning_v2":
      return "positioningV2";
    case "icp_v2":
      return "icpV2";
    case "voice_v2":
      return "voiceV2";
    case "worldview_v2":
      return "worldviewV2";
    case "negative_space_v2":
      return "negativeSpaceV2";
  }
}

export class ProfilePatchApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfilePatchApplyError";
  }
}
