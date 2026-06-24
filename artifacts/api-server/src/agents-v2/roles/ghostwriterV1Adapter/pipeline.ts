// V1 Ghostwriter adapter pipeline — calls v1 draftContent and reshapes output.
//
// This is the only place that knows how to translate between the v2 contract
// surface and the v1 service. Keeping the translation here means the v1 file
// itself is never edited; v1 stays in production while the eval harness reads
// from this wrapper.

import { draftContent } from "../../../services/ghostwriter";
import type {
  DraftContentInput,
  DraftedPost,
} from "../../../services/ghostwriter";
import type { ClientProfile, NarrativeProfile, NarrativeTheme } from "@workspace/db";
import type { GhostwriterInput } from "../ghostwriter/contract";
import type { ContentDraft } from "../../contracts/outputs";

const FORMAT_TO_V1: Record<GhostwriterInput["format"], DraftContentInput["format"]> = {
  post: "post",
  thread: "post", // v1 has no thread; closest is post
  essay: "article",
};

export async function runGhostwriterV1Baseline(
  input: GhostwriterInput
): Promise<ContentDraft> {
  const client = projectToV1ClientProfile(input);
  const narrative = projectToV1Narrative(input);

  const v1Input: DraftContentInput = {
    brief: input.brief,
    platform: input.platform === "youtube_caption" ? "other" : input.platform === "newsletter" ? "blog" : input.platform,
    format: FORMAT_TO_V1[input.format],
    count: 1,
  };

  let drafts: DraftedPost[];
  try {
    const result = await draftContent(client, narrative, v1Input);
    drafts = result.drafts;
  } catch (err) {
    return {
      refuses: true,
      refusal_reason: `v1 ghostwriter threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!drafts || drafts.length === 0) {
    return {
      refuses: true,
      refusal_reason: "v1 ghostwriter returned zero drafts",
    };
  }

  const body = drafts[0]!.content;

  return {
    refuses: false,
    platform: input.platform,
    body,
    // v1 doesn't see voice samples → it cannot cite them. The empty arrays are
    // truthful and the rubric will (correctly) score this low on
    // voice_fidelity / story_anchored.
    voice_evidence: {
      style_anchors: [],
      reference_anchors: [],
    },
    // The contract requires this to literal-true; the rubric's deterministic
    // negative-space scan catches actual violations independently at scoring
    // time. v1 makes no claim either way, but the schema demands one.
    honors_negative_space: true,
    confidence: 0.4, // adapter-flat baseline confidence; rubric scores the actual draft
  };
}

// ---------- v1 input projection ----------

// Project the v2 GhostwriterInput shape into a minimal ClientProfile shape so
// v1's draftContent can run on fixture data. We only fill the fields v1 reads
// (per services/ghostwriter.ts buildVoiceAndMaterial). Empty defaults are fine
// — they make the v1 baseline draft from less context, which is precisely
// what we want to measure.
function projectToV1ClientProfile(input: GhostwriterInput): ClientProfile {
  const voice = input.voice;
  const positioning = input.positioning;
  const negativeSpace = input.negative_space;

  // v1 reads these fields from ClientProfile. We synthesize each from the v2
  // structured layers where possible.
  const personalityTone =
    voice?.description ?? voice?.signature_moves?.map((m) => m.pattern).join("; ") ?? "";
  const brandValues = positioning?.adjacent_claims_rejected?.join("; ") ?? "";
  const nonNegotiables = negativeSpace
    ? `Refused topics: ${negativeSpace.refused_topics?.join(", ") ?? ""}. Refused words: ${negativeSpace.refused_words?.join(", ") ?? ""}.`
    : "";
  const thesis = positioning?.claim ?? "";
  const signatureFrameworks = "";
  const positioningText = positioning?.claim ?? "";
  const primaryAudience = ""; // v2 has structured ICP — flattening loses fidelity, which is the point

  const baseProfile: ClientProfile = {
    id: input.client_id,
    userId: null,
    verifiedEmail: null,
    createdByAgencyId: null,
    fullName: input.identity.full_name,
    location: "",
    headline: input.identity.headline,
    currentRole: "",
    company: "",
    industry: "",
    yearsExperience: 0,
    achievements: positioning?.proof_points?.map((p) => p.label) ?? [],
    goals: "",
    bio: input.identity.headline,
    dateOfBirth: null,
    placeOfBirth: "",
    earlyLife: "",
    schooling: "",
    university: "",
    professionalJourney: "",
    signatureAchievements: positioning?.proof_points?.map((p) => p.label).join("; ") ?? "",
    awards: "",
    quantifiableResults: "",
    audienceImpact: "",
    passions: "",
    beliefs: positioning?.claim ?? "",
    frustrations: "",
    desiredChange: "",
    positioning: positioningText,
    primaryAudience,
    secondaryAudience: "",
    geographyCulture: "",
    brandValues,
    nonNegotiables,
    personalityTone,
    desiredFeeling: "",
    thesis,
    coreBeliefs: positioning?.claim ?? "",
    signatureFrameworks,
    extractedInfo: "",
    website: null,
    newsletter: null,
    linkedinUrl: null,
    twitterUrl: null,
    instagramUrl: null,
    youtubeUrl: null,
    onboardingComplete: true,
    onboardingStep: 1,
    foundationConsolidatedAck: true,
    // v2 layers — irrelevant for v1 ghostwriter, set null so the projection is
    // honest about the legacy view.
    positioningV2: null,
    icpV2: null,
    voiceV2: null,
    worldviewV2: null,
    negativeSpaceV2: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return baseProfile;
}

function projectToV1Narrative(input: GhostwriterInput): NarrativeProfile | null {
  if (!input.positioning?.claim) return null;

  // Build a minimal NarrativeProfile — just enough fields for v1 to render its
  // material block.
  const themes: NarrativeTheme[] = [];

  return {
    id: 0,
    clientId: input.client_id,
    coreNarrative: input.positioning.claim,
    pointOfView: input.positioning.claim,
    themes,
    industryAnswers: [],
    recommendedPlatforms: [],
    contentHooks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
