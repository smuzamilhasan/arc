import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  ClientProfile,
  IndustryAnswer,
  NarrativeTheme,
  PlatformRecommendation,
} from "@workspace/db";
import { parseJsonLoose } from "./json";

export type NarrativeData = {
  coreNarrative: string;
  pointOfView: string;
  themes: NarrativeTheme[];
  recommendedPlatforms: PlatformRecommendation[];
  contentHooks: string[];
};

export async function generateNarrative(
  client: ClientProfile,
  answers: IndustryAnswer[]
): Promise<NarrativeData> {
  const profile = [
    `Name: ${client.fullName}`,
    client.currentRole && `Role: ${client.currentRole}`,
    client.company && `Company: ${client.company}`,
    client.industry && `Industry: ${client.industry}`,
    client.yearsExperience && `Experience: ${client.yearsExperience} years`,
    client.professionalJourney && `Professional journey: ${client.professionalJourney}`,
    client.earlyLife && `Early life: ${client.earlyLife}`,
    client.schooling && `Schooling: ${client.schooling}`,
    client.university && `University: ${client.university}`,
    client.achievements.length && `Achievements: ${client.achievements.join("; ")}`,
    client.signatureAchievements && `Signature achievements: ${client.signatureAchievements}`,
    client.awards && `Awards & recognition: ${client.awards}`,
    client.quantifiableResults && `Quantifiable results: ${client.quantifiableResults}`,
    client.audienceImpact && `Who they help and the change they create: ${client.audienceImpact}`,
    client.goals && `Goals: ${client.goals}`,
  ]
    .filter(Boolean)
    .join("\n");

  const coach = [
    client.passions && `What energizes them: ${client.passions}`,
    client.beliefs && `Beliefs about their field: ${client.beliefs}`,
    client.frustrations && `What frustrates them about the status quo: ${client.frustrations}`,
    client.desiredChange && `The change they want to drive: ${client.desiredChange}`,
  ]
    .filter(Boolean)
    .join("\n");

  const qa = answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n");

  const prompt = `You are an elite personal brand and thought-leadership strategist. Using the profile, the coaching notes, and the industry interview below, define a sharp, differentiated narrative this person can build thought leadership around.\n\nPROFILE:\n${profile}\n\nCOACHING NOTES (passions, beliefs, and motivations drawn out conversationally):\n${coach || "(none captured)"}\n\nINDUSTRY INTERVIEW:\n${qa}\n\nProduce a strategy with:\n- coreNarrative: 2-3 sentences capturing the central story and positioning. Specific, not generic.\n- pointOfView: 1-2 sentences stating their contrarian or distinctive POV on their industry.\n- themes: 3-4 content pillars, each with a title and a one-sentence description.\n- recommendedPlatforms: 3-4 platforms (e.g. LinkedIn, X, newsletter, podcast, YouTube) each with a reason and priority ("high"|"medium"|"low").\n- contentHooks: 5 specific, scroll-stopping content ideas/headlines they could publish.\n\nReturn ONLY JSON:\n{"coreNarrative":"...","pointOfView":"...","themes":[{"title":"...","description":"..."}],"recommendedPlatforms":[{"platform":"...","reason":"...","priority":"high"}],"contentHooks":["...","..."]}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = parseJsonLoose<NarrativeData>(resp.choices[0]?.message?.content ?? "{}");
  return {
    coreNarrative: parsed.coreNarrative ?? "",
    pointOfView: parsed.pointOfView ?? "",
    themes: (parsed.themes ?? []).slice(0, 5),
    recommendedPlatforms: (parsed.recommendedPlatforms ?? []).map((p) => ({
      platform: p.platform,
      reason: p.reason,
      priority: (["high", "medium", "low"].includes(p.priority) ? p.priority : "medium") as PlatformRecommendation["priority"],
    })),
    contentHooks: (parsed.contentHooks ?? []).slice(0, 8),
  };
}
