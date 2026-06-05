import { openai } from "@workspace/integrations-openai-ai-server";
import { ai } from "@workspace/integrations-gemini-ai";
import type {
  ClientProfile,
  IndustryPlayer,
  PlaybookMove,
  IndustrySource,
} from "@workspace/db";
import { parseJsonLoose } from "./json";
import { feedbackBlock } from "./feedback";

export type IndustryOverviewData = {
  industry: string;
  geographyFocus: string;
  landscapeContext: string;
  competitors: IndustryPlayer[];
  thoughtLeaders: IndustryPlayer[];
  playbook: PlaybookMove[];
  sources: IndustrySource[];
};

// Caps that bound the work this panel persists and feeds downstream.
const MAX_PLAYERS = 6;
const MAX_PLAYBOOK = 6;
const MAX_SOURCES = 12;

// A compact profile describing the client and their field, used to target the
// web research at the right industry and geography.
function describeField(client: ClientProfile): string {
  const parts = [
    `Person: ${client.fullName}`,
    client.currentRole && `Role: ${client.currentRole}`,
    client.company && `Company: ${client.company}`,
    client.industry && `Industry: ${client.industry}`,
    client.positioning && `Positioning: ${client.positioning}`,
    client.primaryAudience && `Primary audience: ${client.primaryAudience}`,
    client.secondaryAudience && `Secondary audience: ${client.secondaryAudience}`,
    client.geographyCulture && `Geography & culture: ${client.geographyCulture}`,
    client.location && `Based in: ${client.location}`,
    client.thesis && `Central thesis: ${client.thesis}`,
  ];
  return parts.filter(Boolean).join("\n");
}

// Gather current, public web context about the client's industry and the
// landscape they operate in, using Gemini Google Search grounding.
async function gatherResearch(
  field: string,
  feedback?: string,
): Promise<{ text: string; sources: IndustrySource[] }> {
  const prompt = `You are an industry analyst preparing a landscape briefing for a personal-brand strategist. Their client is described below.\n\n${field}\n\nUsing current public web information, research this person's PRINCIPAL INDUSTRY and the landscape around it. Cover:\n1. What the principal industry is and the geography it most relevant to this person operates in.\n2. The current state of the field, the audiences within it, and what is shifting right now.\n3. The most relevant competitors/peers competing for the same audience and authority, and what each is known for.\n4. The recognized thought leaders in this field whose personal brands set the standard, and how each shows up.\n5. How serious people in THIS specific industry build personal brands — the channels, formats, and moves that work here.\n\nBase everything strictly on what is currently published on the web. Do not invent details. If little can be found, say so plainly.${feedbackBlock(feedback, { focus: "Use this only to retarget the right industry, geography, or landscape; never fabricate information that is not on the web." })}`;

  let text = "";
  const sources: IndustrySource[] = [];
  try {
    const resp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    text = resp.text ?? "";
    const chunks = resp.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    for (const c of chunks) {
      const uri = c.web?.uri ?? "";
      // Gemini grounding chunk URIs are vertex redirect URLs; the real source
      // domain is exposed in `title`, so surface that as the source label.
      const title = (c.web?.title ?? "").replace(/^www\./, "");
      if (!uri || !title) continue;
      sources.push({ title, url: uri });
    }
  } catch (err) {
    text = `Web search unavailable: ${(err as Error).message}`;
  }

  const dedupedSources = Array.from(new Map(sources.map((s) => [s.url, s])).values()).slice(
    0,
    MAX_SOURCES,
  );
  return { text, sources: dedupedSources };
}

// Synthesize the gathered web research into a structured industry overview.
async function synthesizeOverview(
  field: string,
  research: string,
  feedback?: string,
): Promise<Omit<IndustryOverviewData, "sources">> {
  const context = research.trim().slice(0, 8000) || "(no web information was retrieved)";
  const prompt = `You are a personal brand strategist's industry analyst. Using ONLY the web research provided below, produce a structured Industry Overview for this person and the field they operate in.\n\n${field}\n\nWeb research:\n${context}\n\nReturn ONLY JSON in this exact shape:\n{\n  "industry": "the principal industry this person operates in, named precisely (one short phrase)",\n  "geographyFocus": "the primary geography/market this person's brand should focus on (one short phrase)",\n  "landscapeContext": "2-4 sentence prose on the current state of this field — the audiences within it, what is shifting, and what that means for someone building a personal brand here. No markdown, no URLs.",\n  "competitors": [\n    { "name": "competitor or peer name", "description": "one sentence on who they are and what they are known for", "positioning": "one sentence on how they are positioned in this field" }\n  ],\n  "thoughtLeaders": [\n    { "name": "recognized thought leader name", "description": "one sentence on why they are a standard-setter in this field", "positioning": "one sentence on how their personal brand shows up" }\n  ],\n  "playbook": [\n    { "title": "a concrete personal-branding move that works in THIS industry", "detail": "one or two sentences on how to apply it in this field" }\n  ]\n}\nInclude up to ${MAX_PLAYERS} competitors, up to ${MAX_PLAYERS} thought leaders, and up to ${MAX_PLAYBOOK} playbook moves, most relevant first. If the research does not support real competitors or thought leaders, return an empty array for that field rather than inventing people. Do not invent facts, people, or details not present in the research.${feedbackBlock(feedback)}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = parseJsonLoose<{
    industry?: string;
    geographyFocus?: string;
    landscapeContext?: string;
    competitors?: Array<Partial<IndustryPlayer>>;
    thoughtLeaders?: Array<Partial<IndustryPlayer>>;
    playbook?: Array<Partial<PlaybookMove>>;
  }>(resp.choices[0]?.message?.content ?? "{}");

  const cleanPlayers = (players: Array<Partial<IndustryPlayer>> | undefined): IndustryPlayer[] =>
    (players ?? [])
      .filter((p): p is Partial<IndustryPlayer> => Boolean(p) && typeof p === "object")
      .map((p) => ({
        name: typeof p.name === "string" ? p.name.trim() : "",
        description: typeof p.description === "string" ? p.description.trim() : "",
        positioning: typeof p.positioning === "string" ? p.positioning.trim() : "",
      }))
      .filter((p) => p.name)
      .slice(0, MAX_PLAYERS);

  const playbook: PlaybookMove[] = (parsed.playbook ?? [])
    .filter((m): m is Partial<PlaybookMove> => Boolean(m) && typeof m === "object")
    .map((m) => ({
      title: typeof m.title === "string" ? m.title.trim() : "",
      detail: typeof m.detail === "string" ? m.detail.trim() : "",
    }))
    .filter((m) => m.title)
    .slice(0, MAX_PLAYBOOK);

  return {
    industry: typeof parsed.industry === "string" ? parsed.industry.trim() : "",
    geographyFocus: typeof parsed.geographyFocus === "string" ? parsed.geographyFocus.trim() : "",
    landscapeContext:
      typeof parsed.landscapeContext === "string" ? parsed.landscapeContext.trim() : "",
    competitors: cleanPlayers(parsed.competitors),
    thoughtLeaders: cleanPlayers(parsed.thoughtLeaders),
    playbook,
  };
}

// Research the client's industry into a structured overview. Web-grounded
// gathering, then structured synthesis. Bounded by MAX_* caps above.
export async function generateIndustryOverview(
  client: ClientProfile,
  feedback?: string,
): Promise<IndustryOverviewData> {
  const field = describeField(client);
  const { text, sources } = await gatherResearch(field, feedback);
  const overview = await synthesizeOverview(field, text, feedback);
  return { ...overview, sources };
}
