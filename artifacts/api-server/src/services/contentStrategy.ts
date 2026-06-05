import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  ClientProfile,
  PlatformStrategy,
  PlatformCadence,
  ContentMixItem,
  SignatureSeries,
  PostFormat,
} from "@workspace/db";
import { parseJsonLoose } from "./json";
import { feedbackBlock } from "./feedback";

export type ContentStrategyData = {
  summary: string;
  platformPlan: PlatformCadence[];
  contentMix: ContentMixItem[];
  signatureSeries: SignatureSeries[];
  postFormats: PostFormat[];
  repurposing: string;
  closing: string;
};

function buildProfile(client: ClientProfile): string {
  const lines = [
    `Name: ${client.fullName}`,
    client.currentRole && `Role: ${client.currentRole}`,
    client.company && `Company: ${client.company}`,
    client.industry && `Industry: ${client.industry}`,
    client.headline && `Headline: ${client.headline}`,
    client.bio && `Bio: ${client.bio}`,
    client.positioning && `Positioning / who they are the go-to person for: ${client.positioning}`,
    client.primaryAudience && `Primary audience: ${client.primaryAudience}`,
    client.secondaryAudience && `Secondary audience: ${client.secondaryAudience}`,
    client.brandValues && `Brand values: ${client.brandValues}`,
    client.personalityTone && `Personality & tone: ${client.personalityTone}`,
    client.thesis && `Central thesis / worldview: ${client.thesis}`,
    client.coreBeliefs && `Core beliefs they repeat: ${client.coreBeliefs}`,
    client.signatureFrameworks && `Signature frameworks / named models: ${client.signatureFrameworks}`,
    client.beliefs && `Beliefs about their field: ${client.beliefs}`,
    client.frustrations && `What frustrates them about the status quo: ${client.frustrations}`,
    client.desiredChange && `The change they want to drive: ${client.desiredChange}`,
    client.passions && `What energizes them: ${client.passions}`,
    client.signatureAchievements && `Signature achievements: ${client.signatureAchievements}`,
    client.quantifiableResults && `Quantifiable results: ${client.quantifiableResults}`,
    client.audienceImpact && `Who they help and the change they create: ${client.audienceImpact}`,
    client.professionalJourney && `Professional journey: ${client.professionalJourney}`,
    client.goals && `Goals: ${client.goals}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function buildPlatformContext(strategy: PlatformStrategy): string {
  const { online, offline } = strategy;
  const lines = [
    strategy.summary && `Platform strategy summary: ${strategy.summary}`,
    online.primary.length > 0 &&
      `Primary platforms to dominate: ${online.primary
        .map((p) => `${p.platform} (${p.reason})`)
        .join("; ")}`,
    online.mirror.length > 0 && `Mirror/repurpose to: ${online.mirror.join(", ")}`,
    online.longForm.recommendation &&
      `Long-form play: ${online.longForm.recommendation} [${online.longForm.platforms.join(", ")}]`,
    online.shortForm.recommendation &&
      `Short-form play: ${online.shortForm.recommendation} [${online.shortForm.platforms.join(", ")}]`,
    online.newsletter && `Newsletter: ${online.newsletter}`,
    offline.speaking && `Offline speaking: ${offline.speaking}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export async function generateContentStrategy(
  client: ClientProfile,
  platformStrategy: PlatformStrategy,
  feedback?: string
): Promise<ContentStrategyData> {
  const profile = buildProfile(client);
  const platforms = buildPlatformContext(platformStrategy);

  const prompt = `You are an elite thought-leadership content strategist. Using the person's full profile AND their already-decided platform strategy below, design a concrete content strategy that turns their positioning into a repeatable publishing engine. Anchor every recommendation to who they are, who they serve, and the platforms they have committed to. Do not give generic advice.

PROFILE:
${profile}

PLATFORM STRATEGY (already decided — your content plan must build on exactly these platforms):
${platforms}

You must apply these thought-leadership guidelines:
- Content mix across five buckets: Educational (teach a skill/concept), Analytical (break down trends, data, what's happening and why), Opinionated (their contrarian takes and point of view), Story (personal journey, lessons, behind-the-scenes), Community (engaging their audience, amplifying others, conversation). Assign each a rough weight that fits THIS person — some lean more opinion-led, others more educational.
- Content systems that make output repeatable: a few signature series (named, ownable, recurring franchises) and reusable post formats (templates they can fill again and again).
- Repurposing: one idea should flow across formats and platforms (e.g. long-form -> short clips -> text posts -> newsletter section).
- Posting cadence: for each primary platform from their platform strategy, recommend a realistic posting frequency and the formats that platform should carry.

Return ONLY JSON in exactly this shape:
{
  "summary": "2-3 sentences framing this person's content strategy and what their publishing engine should feel like.",
  "platformPlan": [
    {"platform": "platform name (use their actual chosen platforms)", "frequency": "e.g. 3-4x / week", "formats": ["the post types this platform should carry"], "focus": "what this platform is FOR in their strategy"}
  ],
  "contentMix": [
    {"type": "Educational", "weight": "e.g. 30%", "description": "what this bucket means for them", "whyForClient": "why this weighting fits this specific person", "exampleTopics": ["2-3 concrete topic ideas tailored to them"]},
    {"type": "Analytical", "weight": "...", "description": "...", "whyForClient": "...", "exampleTopics": ["..."]},
    {"type": "Opinionated", "weight": "...", "description": "...", "whyForClient": "...", "exampleTopics": ["..."]},
    {"type": "Story", "weight": "...", "description": "...", "whyForClient": "...", "exampleTopics": ["..."]},
    {"type": "Community", "weight": "...", "description": "...", "whyForClient": "...", "exampleTopics": ["..."]}
  ],
  "signatureSeries": [
    {"name": "named recurring series", "cadence": "e.g. Weekly", "description": "what it is and why it fits them"}
  ],
  "postFormats": [
    {"name": "reusable format name", "description": "the template/shape and when to use it"}
  ],
  "repurposing": "2-4 sentences describing a concrete repurposing flow tailored to their platforms and formats.",
  "closing": "1-2 sentences on how consistency across this mix builds their authority over time."
}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = parseJsonLoose<ContentStrategyData>(
    resp.choices[0]?.message?.content ?? "{}"
  );

  const cleanStrings = (arr: string[] | undefined): string[] =>
    (arr ?? []).map((s) => (s ?? "").trim()).filter(Boolean);

  const platformPlan: PlatformCadence[] = (parsed.platformPlan ?? [])
    .filter((p) => p && (p.platform || p.focus))
    .map((p) => ({
      platform: p.platform ?? "",
      frequency: p.frequency ?? "",
      formats: cleanStrings(p.formats),
      focus: p.focus ?? "",
    }));

  const contentMix: ContentMixItem[] = (parsed.contentMix ?? [])
    .filter((c) => c && (c.type || c.description))
    .map((c) => ({
      type: c.type ?? "",
      description: c.description ?? "",
      whyForClient: c.whyForClient ?? "",
      exampleTopics: cleanStrings(c.exampleTopics),
      weight: c.weight ?? "",
    }));

  const signatureSeries: SignatureSeries[] = (parsed.signatureSeries ?? [])
    .filter((s) => s && (s.name || s.description))
    .map((s) => ({
      name: s.name ?? "",
      cadence: s.cadence ?? "",
      description: s.description ?? "",
    }));

  const postFormats: PostFormat[] = (parsed.postFormats ?? [])
    .filter((f) => f && (f.name || f.description))
    .map((f) => ({
      name: f.name ?? "",
      description: f.description ?? "",
    }));

  return {
    summary: parsed.summary ?? "",
    platformPlan,
    contentMix,
    signatureSeries,
    postFormats,
    repurposing: parsed.repurposing ?? "",
    closing: parsed.closing ?? "",
  };
}
