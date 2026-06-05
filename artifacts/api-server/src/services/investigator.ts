import { openai } from "@workspace/integrations-openai-ai-server";
import { ai } from "@workspace/integrations-gemini-ai";
import type { ClientProfile, Competitor, DossierSource } from "@workspace/db";
import { parseJsonLoose } from "./json";
import { feedbackBlock } from "./feedback";

export type DossierData = {
  footprintSummary: string;
  competitors: Competitor[];
  sources: DossierSource[];
};

// Caps that bound the work this agent persists and feeds downstream.
const MAX_COMPETITORS = 6;
const MAX_SOURCES = 12;

function describeClient(client: ClientProfile): string {
  const parts = [client.fullName];
  if (client.currentRole) parts.push(client.currentRole);
  if (client.company) parts.push(`at ${client.company}`);
  if (client.industry) parts.push(`(${client.industry})`);
  if (client.location) parts.push(`based in ${client.location}`);
  return parts.join(" ");
}

// Gather current, public web context about the client and the people they
// compete with for attention, using Gemini Google Search grounding.
async function gatherResearch(
  subject: string,
  client: ClientProfile,
  feedback?: string
): Promise<{ text: string; sources: DossierSource[] }> {
  const positioning = [client.positioning, client.industry, client.primaryAudience]
    .filter(Boolean)
    .join("; ");
  const prompt = `You are a research analyst preparing a briefing on a person and the landscape they operate in.\n\nPerson: ${subject}\n${positioning ? `Positioning / field / audience: ${positioning}\n` : ""}\nUsing current public web information, do two things:\n1. Summarize this person's public footprint: who they are, their background, current work, notable achievements, and how visibly they show up online.\n2. Identify the most relevant competitors or peers — other people (or, where appropriate, organizations) competing for the same audience, attention, or authority in this person's field. For each, note what they are known for and how they are positioned.\n\nBase everything strictly on what is currently published on the web. Do not invent details. If little can be found about this specific person, say so plainly.${feedbackBlock(feedback, { focus: "Use this only to disambiguate or target the right person and the right competitive field; never fabricate information that is not on the web." })}`;

  let text = "";
  const sources: DossierSource[] = [];
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
    MAX_SOURCES
  );
  return { text, sources: dedupedSources };
}

// Synthesize the gathered web research into a structured dossier using gpt-5.4.
async function synthesizeDossier(
  subject: string,
  research: string,
  feedback?: string
): Promise<{ footprintSummary: string; competitors: Competitor[] }> {
  const context = research.trim().slice(0, 8000) || "(no web information was retrieved)";
  const prompt = `You are a personal brand strategist's research analyst. Using ONLY the web research provided below, produce a briefing dossier about this person and their competitive landscape.\n\nPerson: ${subject}\n\nWeb research:\n${context}\n\nReturn ONLY JSON in this exact shape:\n{\n  "footprintSummary": "2-4 sentence professional prose summary of the person's current public footprint — how strongly and where they show up, what they are known for, and notable gaps. No markdown, no URLs.",\n  "competitors": [\n    { "name": "competitor or peer name", "description": "one sentence on who they are and what they are known for", "positioning": "one sentence on how they are positioned in the field", "differentiation": "one sentence on how this person could differentiate from them" }\n  ]\n}\nInclude up to ${MAX_COMPETITORS} competitors, most relevant first. If the research does not support real competitors, return an empty competitors array. Do not invent people, facts, or details not present in the research.${feedbackBlock(feedback)}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = parseJsonLoose<{
    footprintSummary?: string;
    competitors?: Array<Partial<Competitor>>;
  }>(resp.choices[0]?.message?.content ?? "{}");

  const footprintSummary =
    typeof parsed.footprintSummary === "string" && parsed.footprintSummary.trim()
      ? parsed.footprintSummary.trim()
      : "No meaningful public footprint could be established for this person from current web information.";

  const competitors: Competitor[] = (parsed.competitors ?? [])
    .filter((c): c is Partial<Competitor> => Boolean(c) && typeof c === "object")
    .map((c) => ({
      name: typeof c.name === "string" ? c.name.trim() : "",
      description: typeof c.description === "string" ? c.description.trim() : "",
      positioning: typeof c.positioning === "string" ? c.positioning.trim() : "",
      differentiation: typeof c.differentiation === "string" ? c.differentiation.trim() : "",
    }))
    .filter((c) => c.name)
    .slice(0, MAX_COMPETITORS);

  return { footprintSummary, competitors };
}

// Research the client + competitors into a briefing dossier. Web-grounded
// gathering, then structured synthesis. Bounded by MAX_* caps above.
export async function generateDossier(
  client: ClientProfile,
  feedback?: string
): Promise<DossierData> {
  const subject = describeClient(client);
  const { text, sources } = await gatherResearch(subject, client, feedback);
  const { footprintSummary, competitors } = await synthesizeDossier(subject, text, feedback);
  return { footprintSummary, competitors, sources };
}
