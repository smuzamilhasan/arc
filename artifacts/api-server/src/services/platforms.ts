import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  ClientProfile,
  OnlinePresence,
  OfflinePresence,
  PlatformPick,
} from "@workspace/db";
import { parseJsonLoose } from "./json";
import { feedbackBlock } from "./feedback";

export type PlatformStrategyData = {
  summary: string;
  online: OnlinePresence;
  offline: OfflinePresence;
  closing: string;
};

// The blueprint "core" fields that must all be filled before the Platforms
// panel unlocks. Mirrors the countFields across PILLARS in the web app's
// src/lib/blueprint.ts so the lock is enforced server-side too.
const BLUEPRINT_REQUIRED_FIELDS = [
  "positioning",
  "primaryAudience",
  "brandValues",
  "personalityTone",
  "thesis",
  "coreBeliefs",
  "signatureFrameworks",
  "beliefs",
  "frustrations",
  "desiredChange",
  "passions",
  "earlyLife",
  "professionalJourney",
  "signatureAchievements",
  "quantifiableResults",
  "audienceImpact",
  "currentRole",
  "company",
  "industry",
  "headline",
  "bio",
] as const satisfies readonly (keyof ClientProfile)[];

export function isBlueprintComplete(client: ClientProfile): boolean {
  return BLUEPRINT_REQUIRED_FIELDS.every((field) => {
    const value = client[field];
    return String(value ?? "").trim().length > 0;
  });
}

function buildProfile(client: ClientProfile): string {
  const identity = [
    `Name: ${client.fullName}`,
    client.currentRole && `Role: ${client.currentRole}`,
    client.company && `Company: ${client.company}`,
    client.industry && `Industry: ${client.industry}`,
    client.yearsExperience && `Experience: ${client.yearsExperience} years`,
    client.headline && `Headline: ${client.headline}`,
    client.bio && `Bio: ${client.bio}`,
    client.positioning && `Positioning / who they are the go-to person for: ${client.positioning}`,
    client.primaryAudience && `Primary audience: ${client.primaryAudience}`,
    client.secondaryAudience && `Secondary audience: ${client.secondaryAudience}`,
    client.geographyCulture && `Geography & culture: ${client.geographyCulture}`,
    client.brandValues && `Brand values: ${client.brandValues}`,
    client.nonNegotiables && `Non-negotiables: ${client.nonNegotiables}`,
    client.personalityTone && `Personality & tone: ${client.personalityTone}`,
    client.desiredFeeling && `How they want people to feel: ${client.desiredFeeling}`,
  ];

  const worldview = [
    client.thesis && `Central thesis / worldview: ${client.thesis}`,
    client.coreBeliefs && `Core beliefs they repeat: ${client.coreBeliefs}`,
    client.signatureFrameworks && `Signature frameworks / named models: ${client.signatureFrameworks}`,
    client.beliefs && `Beliefs about their field: ${client.beliefs}`,
    client.frustrations && `What frustrates them about the status quo: ${client.frustrations}`,
    client.desiredChange && `The change they want to drive: ${client.desiredChange}`,
    client.passions && `What energizes them: ${client.passions}`,
  ];

  const substance = [
    client.signatureAchievements && `Signature achievements: ${client.signatureAchievements}`,
    client.quantifiableResults && `Quantifiable results: ${client.quantifiableResults}`,
    client.audienceImpact && `Who they help and the change they create: ${client.audienceImpact}`,
    client.awards && `Awards & recognition: ${client.awards}`,
    client.professionalJourney && `Professional journey: ${client.professionalJourney}`,
    client.goals && `Goals: ${client.goals}`,
  ];

  return [...identity, ...worldview, ...substance].filter(Boolean).join("\n");
}

export async function generatePlatformStrategy(
  client: ClientProfile,
  feedback?: string
): Promise<PlatformStrategyData> {
  const profile = buildProfile(client);

  const prompt = `You are an elite personal brand and distribution strategist. Using the full profile below, design a concrete "Platforms & Presence" strategy covering both digital (online) and physical (offline) channels, tailored specifically to this person, their audience, their industry, and their goals. Do not give generic advice — anchor every recommendation to who they are and who they serve.

PROFILE:
${profile}

Guiding principles you must apply:
- Online gives scale. Offline gives depth & seriousness. Recommend both.
- For online, pick 1-2 PRIMARY platforms for them to dominate (the best fit for their strengths and audience), and list the others they should mirror/repurpose content to.
- Long-form depth options: YouTube, podcast, Substack/blog, long LinkedIn articles.
- Short-form reach options: TikTok/Reels/Shorts, Twitter/X threads, LinkedIn posts.
- Authority / infrastructure: a personal website (clear bio; what they do / who they help; media kit & speaking page; lead magnet / newsletter signup) and an email newsletter (the best owned channel for serious thought leadership).
- Offline signals are often more powerful: speaking & events (conferences, meetups, corporate trainings, university lectures, panels, fireside chats); workshops & roundtables (curated small groups); industry associations / forums (boards, committees, advisory groups); teaching & mentoring (cohort courses, adjunct teaching, accelerator mentorship).

Return ONLY JSON in exactly this shape:
{
  "summary": "2-3 sentences framing this person's overall platform strategy and where they should focus first.",
  "online": {
    "primary": [{"platform": "...", "reason": "why this platform is the one for them to dominate"}],
    "mirror": ["other platforms to repurpose/mirror content to"],
    "longForm": {"recommendation": "specific long-form play tailored to them", "platforms": ["YouTube", "Substack"]},
    "shortForm": {"recommendation": "specific short-form play tailored to them", "platforms": ["LinkedIn posts", "X threads"]},
    "website": {"recommendation": "what their personal website should achieve", "elements": ["Clear bio", "What you do / who you help", "Media kit & speaking page", "Lead magnet / newsletter signup"]},
    "newsletter": "specific newsletter recommendation (cadence, angle, who it serves)"
  },
  "offline": {
    "intro": "1-2 sentences on why offline matters for THIS person specifically.",
    "speaking": "concrete speaking & events recommendation tailored to them",
    "workshops": "concrete workshops & roundtables recommendation tailored to them",
    "associations": "concrete industry associations / forums recommendation tailored to them",
    "teaching": "concrete teaching & mentoring recommendation tailored to them"
  },
  "closing": "1-2 sentences on how they should balance online scale with offline depth as they build their arc."
}${feedbackBlock(feedback)}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = parseJsonLoose<PlatformStrategyData>(
    resp.choices[0]?.message?.content ?? "{}"
  );

  const online = parsed.online ?? ({} as OnlinePresence);
  const offline = parsed.offline ?? ({} as OfflinePresence);

  const cleanPicks = (picks: PlatformPick[] | undefined): PlatformPick[] =>
    (picks ?? [])
      .filter((p) => p && (p.platform || p.reason))
      .map((p) => ({ platform: p.platform ?? "", reason: p.reason ?? "" }))
      .slice(0, 3);

  const cleanStrings = (arr: string[] | undefined): string[] =>
    (arr ?? []).map((s) => (s ?? "").trim()).filter(Boolean);

  return {
    summary: parsed.summary ?? "",
    online: {
      primary: cleanPicks(online.primary),
      mirror: cleanStrings(online.mirror),
      longForm: {
        recommendation: online.longForm?.recommendation ?? "",
        platforms: cleanStrings(online.longForm?.platforms),
      },
      shortForm: {
        recommendation: online.shortForm?.recommendation ?? "",
        platforms: cleanStrings(online.shortForm?.platforms),
      },
      website: {
        recommendation: online.website?.recommendation ?? "",
        elements: cleanStrings(online.website?.elements),
      },
      newsletter: online.newsletter ?? "",
    },
    offline: {
      intro: offline.intro ?? "",
      speaking: offline.speaking ?? "",
      workshops: offline.workshops ?? "",
      associations: offline.associations ?? "",
      teaching: offline.teaching ?? "",
    },
    closing: parsed.closing ?? "",
  };
}
