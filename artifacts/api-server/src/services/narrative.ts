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
    client.achievements.length && `Achievements: ${client.achievements.join("; ")}`,
    client.goals && `Goals: ${client.goals}`,
  ]
    .filter(Boolean)
    .join("\n");

  const qa = answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n");

  const prompt = `You are an elite personal brand and thought-leadership strategist. Using the profile and the industry interview below, define a sharp, differentiated narrative this person can build thought leadership around.\n\nPROFILE:\n${profile}\n\nINDUSTRY INTERVIEW:\n${qa}\n\nProduce a strategy with:\n- coreNarrative: 2-3 sentences capturing the central story and positioning. Specific, not generic.\n- pointOfView: 1-2 sentences stating their contrarian or distinctive POV on their industry.\n- themes: 3-4 content pillars, each with a title and a one-sentence description.\n- recommendedPlatforms: 3-4 platforms (e.g. LinkedIn, X, newsletter, podcast, YouTube) each with a reason and priority ("high"|"medium"|"low").\n- contentHooks: 5 specific, scroll-stopping content ideas/headlines they could publish.\n\nReturn ONLY JSON:\n{"coreNarrative":"...","pointOfView":"...","themes":[{"title":"...","description":"..."}],"recommendedPlatforms":[{"platform":"...","reason":"...","priority":"high"}],"contentHooks":["...","..."]}`;

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
