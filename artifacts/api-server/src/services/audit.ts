import { openai } from "@workspace/integrations-openai-ai-server";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { ai } from "@workspace/integrations-gemini-ai";
import type {
  ClientProfile,
  SeoFindings,
  SeoFinding,
  GeoFindings,
  GeoModelResult,
  GeoSource,
} from "@workspace/db";
import { parseJsonLoose, clampScore } from "./json";

export type AuditProgress = {
  type: "progress" | "complete" | "error";
  step?: string;
  status?: "running" | "done";
  message?: string;
};

export type AuditData = {
  seoScore: number;
  geoScore: number;
  seoFindings: SeoFindings;
  geoFindings: GeoFindings;
  recommendations: string[];
};

const GEO_MODELS = [
  { model: "chatgpt", label: "ChatGPT (GPT-5.4)" },
  { model: "claude", label: "Claude (Sonnet 4.6)" },
  { model: "gemini", label: "Gemini (3 Flash)" },
] as const;

function describeClient(client: ClientProfile): string {
  const parts = [client.fullName];
  if (client.currentRole) parts.push(client.currentRole);
  if (client.company) parts.push(`at ${client.company}`);
  if (client.industry) parts.push(`(${client.industry})`);
  if (client.location) parts.push(`based in ${client.location}`);
  return parts.join(" ");
}

function ownedDomains(client: ClientProfile): string[] {
  const urls = [client.website, client.newsletter].filter(Boolean) as string[];
  return urls
    .map((u) => {
      try {
        return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

async function runSeo(client: ClientProfile): Promise<{ findings: SeoFindings; raw: string }> {
  const subject = describeClient(client);
  const prompt = `Search the web for information about this person and report what is publicly visible about them.\n\nPerson: ${subject}\n\nList the most relevant web results that appear when searching their name. For each, give the page title and URL. Then summarize in 2-3 sentences how strong and professional their search-result presence is.`;

  let text = "";
  const results: SeoFinding[] = [];
  const owned = ownedDomains(client);

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
      if (!uri) continue;
      // Gemini grounding chunk URIs are vertex redirect URLs; the real source
      // domain is exposed in `title` (e.g. "microsoft.com", "wikipedia.org").
      const domain = (c.web?.title ?? "").replace(/^www\./, "");
      let type: SeoFinding["type"] = "other";
      if (owned.some((d) => domain.includes(d))) type = "owned";
      else if (/(linkedin|twitter|x\.com|instagram|facebook|youtube|tiktok|threads|medium|substack)/i.test(domain)) type = "social";
      else if (/(news|times|forbes|techcrunch|bloomberg|reuters|guardian|wired|wsj|bbc|cnbc|business|fortune|cnbc|economictimes)/i.test(domain)) type = "press";
      else if (/(crunchbase|wikipedia|grokipedia|github|about\.me|wellfound|angellist|marketscreener)/i.test(domain)) type = "directory";
      results.push({ title: domain || uri, url: uri, type, snippet: domain });
    }
  } catch (err) {
    text = `Web search unavailable: ${(err as Error).message}`;
  }

  const deduped = Array.from(new Map(results.map((r) => [r.url, r])).values()).slice(0, 12);
  const ownedPresence = deduped.some((r) => r.type === "owned") || owned.length > 0;

  const summary = await summarizeSeo(subject, text, deduped).catch(() => text.slice(0, 1200));

  const findings: SeoFindings = {
    resultCount: deduped.length,
    results: deduped,
    ownedPresence,
    summary,
  };
  return { findings, raw: text };
}

async function summarizeSeo(subject: string, raw: string, results: SeoFinding[]): Promise<string> {
  const fallback = raw.slice(0, 1200);
  const resultList = results.length
    ? results.map((r) => `- [${r.type}] ${r.title} (${r.url})`).join("\n")
    : "(no notable results found)";
  const trimmedRaw = raw.slice(0, 4000).trim();
  if (!trimmedRaw && !results.length) {
    return "No meaningful search-result presence was found for this person.";
  }

  const prompt = `You are a personal brand strategist analyzing someone's Google search-result presence. Using ONLY the search data provided below, write a clean, professional 2-4 sentence analysis of how this person shows up in search. Cover the strength of their presence, what kinds of sources appear (owned sites, social, press, directories), and any notable gaps. Do not invent sources, links, or facts that are not present in the data. Write in polished prose with no bullet points, no URLs, and no markdown.\n\nPerson: ${subject}\n\nStructured search results:\n${resultList}\n\nRaw search notes:\n${trimmedRaw || "(none)"}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });
  const summary = (resp.choices[0]?.message?.content ?? "").trim();
  return summary || fallback || "No meaningful search-result presence was found for this person.";
}

async function summarizeGeo(subject: string, models: GeoModelResult[]): Promise<string> {
  const mentionedCount = models.filter((m) => m.mentioned).length;
  const fallback = `${mentionedCount} of ${models.length} AI models represented you using current web information.`;
  if (models.length === 0) return fallback;

  const modelList = models
    .map((m) => `- ${m.label}: ${m.mentioned ? "represented the person" : "surfaced no information"}, accuracy=${m.accuracy}${m.notes ? `, notes: ${m.notes}` : ""}`)
    .join("\n");

  const prompt = `You are a personal brand strategist analyzing how AI engines represent someone when they answer using current public web information. Using ONLY the per-model audit data below, write a clean, professional 2-4 sentence analysis of how AI models currently surface this person from the live web. Cover which models represented them well, how accurate that coverage was, and any notable gaps or confusion. Do not invent facts, sources, or details that are not present in the data. Write in polished prose with no bullet points, no URLs, and no markdown.\n\nPerson: ${subject}\n\nPer-model results:\n${modelList}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });
  const summary = (resp.choices[0]?.message?.content ?? "").trim();
  return summary || fallback;
}

async function gatherWebContext(
  subject: string
): Promise<{ text: string; sources: GeoSource[] }> {
  const prompt = `Search the web for current, public information about this person and write a thorough, factual briefing about who they are. Cover their background, current role and work, notable achievements, and any documented contributions.\n\nPerson: ${subject}\n\nBase everything strictly on what is currently published on the web. Do not invent details. If little or nothing can be found about this specific person, say so plainly.`;

  let text = "";
  const sources: GeoSource[] = [];
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

  const dedupedSources = Array.from(new Map(sources.map((s) => [s.url, s])).values()).slice(0, 12);
  return { text, sources: dedupedSources };
}

async function askGeoModel(
  model: (typeof GEO_MODELS)[number]["model"],
  subject: string,
  webContext: string
): Promise<string> {
  const context = webContext.trim() || "(no web information was retrieved)";
  const prompt = `You are an AI engine answering a user who asked about a person. Below is current public information gathered from the live web about them. Using ONLY this web information, describe ${subject}'s background, work, and notable contributions, as you would surface them to a user. Be specific and factual. If the web information clearly does not contain meaningful information about this specific person, clearly say "I do not have information about this person." Do not invent details beyond what the web information supports.\n\nCurrent public web information:\n${context.slice(0, 6000)}`;

  if (model === "chatgpt") {
    const resp = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });
    return resp.choices[0]?.message?.content ?? "";
  }
  if (model === "claude") {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });
    const block = resp.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "";
  }
  // Gemini can browse the live web itself via Google Search grounding, in
  // addition to the shared web context.
  const resp = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] },
  });
  return resp.text ?? "";
}

async function classifyGeo(
  subject: string,
  webContext: string,
  responses: { model: string; label: string; response: string }[]
): Promise<GeoModelResult[]> {
  const truth = webContext.trim().slice(0, 6000) || "(no web information was retrieved)";
  const prompt = `You are auditing how well AI engines represent a specific person using current public web information. Each model was given the same live web context and asked to describe this person.\n\nPerson: ${subject}\n\nGround-truth web context (what is actually published about this person):\n${truth}\n\nBelow are the model responses. Judge each STRICTLY against the ground-truth web context and the specific person:\n- mentioned: true if the response demonstrates real, specific knowledge of THIS person; false if it said it has no information or described someone else.\n- accuracy: "accurate" (substantial, specific, and correct coverage that matches the web context), "partial" (some correct but limited or generic coverage), "none" (no real information / declined), or "incorrect" (confused them with someone else or contradicts the web context).\n- notes: one short sentence explaining the judgement.\n\nDo not award "accurate" for vague or generic descriptions; reserve it for responses with specific, correct details supported by the web context.\n\nResponses:\n${responses.map((r) => `### ${r.label} (id: ${r.model})\n${r.response.slice(0, 1500)}`).join("\n\n")}\n\nReturn ONLY JSON in this exact shape:\n{"models":[{"model":"<id>","mentioned":true|false,"accuracy":"accurate|partial|none|incorrect","notes":"..."}]}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });
  const parsed = parseJsonLoose<{ models: { model: string; mentioned: boolean; accuracy: string; notes: string }[] }>(
    resp.choices[0]?.message?.content ?? "{}"
  );
  const byId = new Map(parsed.models?.map((m) => [m.model, m]) ?? []);
  return responses.map((r) => {
    const j = byId.get(r.model);
    const accuracy = (["accurate", "partial", "none", "incorrect"].includes(j?.accuracy ?? "")
      ? j?.accuracy
      : "none") as GeoModelResult["accuracy"];
    return {
      model: r.model,
      label: r.label,
      mentioned: Boolean(j?.mentioned),
      accuracy,
      response: r.response.slice(0, 2000),
      notes: j?.notes ?? "",
    };
  });
}

function scoreSeo(findings: SeoFindings): number {
  let score = 0;
  if (findings.resultCount > 0) score += 15;
  score += Math.min(findings.resultCount, 8) * 4;
  if (findings.ownedPresence) score += 20;
  if (findings.results.some((r) => r.type === "social")) score += 12;
  if (findings.results.some((r) => r.type === "press")) score += 18;
  if (findings.results.some((r) => r.type === "directory")) score += 8;
  return clampScore(score);
}

export function scoreGeo(models: GeoModelResult[]): number {
  if (models.length === 0) return 0;
  const per = models.map((m) => {
    if (m.accuracy === "accurate") return 100;
    if (m.accuracy === "partial") return 55;
    if (m.accuracy === "incorrect") return 10;
    return m.mentioned ? 30 : 0;
  });
  return clampScore(per.reduce((a, b) => a + b, 0) / models.length);
}

async function buildRecommendations(
  client: ClientProfile,
  seo: SeoFindings,
  geo: GeoFindings,
  seoScore: number,
  geoScore: number
): Promise<string[]> {
  const prompt = `You are a personal brand strategist. Based on this digital presence audit, give 4-6 specific, actionable recommendations to improve how this person shows up in Google search (SEO) and in AI models (GEO).\n\nPerson: ${describeClient(client)}\nGoals: ${client.goals || "not specified"}\nSEO score: ${seoScore}/100. Findings: ${seo.summary}\nGEO score: ${geoScore}/100. ${geo.summary}\n\nReturn ONLY JSON: {"recommendations":["...","..."]}. Each item is one concrete action, max 25 words.`;
  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });
  const parsed = parseJsonLoose<{ recommendations: string[] }>(resp.choices[0]?.message?.content ?? "{}");
  return (parsed.recommendations ?? []).slice(0, 6);
}

export async function runAudit(
  client: ClientProfile,
  onProgress: (p: AuditProgress) => void
): Promise<AuditData> {
  const subject = describeClient(client);

  onProgress({ type: "progress", step: "seo", status: "running", message: "Searching the web for your name..." });
  const { findings: seoFindings } = await runSeo(client);
  onProgress({
    type: "progress",
    step: "seo",
    status: "done",
    message: `Found ${seoFindings.resultCount} reference${seoFindings.resultCount === 1 ? "" : "s"} online`,
  });

  onProgress({ type: "progress", step: "geo", status: "running", message: "Gathering current web information about you..." });
  const { text: webContext, sources: geoSources } = await gatherWebContext(subject);
  onProgress({ type: "progress", step: "geo", status: "running", message: "Asking ChatGPT, Claude, and Gemini what the web says about you..." });
  const rawResponses = await Promise.all(
    GEO_MODELS.map(async (m) => ({
      model: m.model,
      label: m.label,
      response: await askGeoModel(m.model, subject, webContext).catch((e) => `Error querying model: ${(e as Error).message}`),
    }))
  );
  onProgress({ type: "progress", step: "geo", status: "done", message: "Collected responses from all three models" });

  onProgress({ type: "progress", step: "synthesis", status: "running", message: "Scoring your digital presence..." });
  const geoModels = await classifyGeo(subject, webContext, rawResponses);
  const mentionedCount = geoModels.filter((m) => m.mentioned).length;
  const geoSummary = await summarizeGeo(subject, geoModels).catch(
    () => `${mentionedCount} of ${geoModels.length} AI models represented you using current web information.`
  );
  const geoFindings: GeoFindings = {
    models: geoModels,
    summary: geoSummary,
    sources: geoSources,
  };

  const seoScore = scoreSeo(seoFindings);
  const geoScore = scoreGeo(geoModels);
  const recommendations = await buildRecommendations(client, seoFindings, geoFindings, seoScore, geoScore).catch(
    () => []
  );

  onProgress({ type: "progress", step: "synthesis", status: "done", message: "Audit complete" });

  return { seoScore, geoScore, seoFindings, geoFindings, recommendations };
}
