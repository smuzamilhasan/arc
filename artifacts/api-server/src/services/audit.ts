import { openai } from "@workspace/integrations-openai-ai-server";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { ai } from "@workspace/integrations-gemini-ai";
import type {
  ClientProfile,
  SeoFindings,
  SeoFinding,
  GeoFindings,
  GeoModelResult,
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

  const findings: SeoFindings = {
    resultCount: deduped.length,
    results: deduped,
    ownedPresence,
    summary: text.slice(0, 1200),
  };
  return { findings, raw: text };
}

async function askGeoModel(model: (typeof GEO_MODELS)[number]["model"], subject: string): Promise<string> {
  const prompt = `What do you know about ${subject}? Describe their background, work, and notable contributions based only on your training knowledge. If you do not have reliable information about this specific person, clearly say "I do not have information about this person." Do not guess or invent details.`;

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
  const resp = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  return resp.text ?? "";
}

async function classifyGeo(
  subject: string,
  responses: { model: string; label: string; response: string }[]
): Promise<GeoModelResult[]> {
  const prompt = `You are auditing whether AI models know about a specific person.\n\nPerson: ${subject}\n\nBelow are responses from different AI models when asked what they know about this person. For each, judge:\n- mentioned: true if the model demonstrated real knowledge of THIS specific person, false if it said it has no information or clearly described someone else.\n- accuracy: "accurate" (detailed and correct), "partial" (some real but limited knowledge), "none" (no knowledge), or "incorrect" (confused them with someone else / hallucinated).\n- notes: one short sentence explaining the judgement.\n\nResponses:\n${responses.map((r) => `### ${r.label} (id: ${r.model})\n${r.response.slice(0, 1500)}`).join("\n\n")}\n\nReturn ONLY JSON in this exact shape:\n{"models":[{"model":"<id>","mentioned":true|false,"accuracy":"accurate|partial|none|incorrect","notes":"..."}]}`;

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

function scoreGeo(models: GeoModelResult[]): number {
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

  onProgress({ type: "progress", step: "geo", status: "running", message: "Asking ChatGPT, Claude, and Gemini about you..." });
  const rawResponses = await Promise.all(
    GEO_MODELS.map(async (m) => ({
      model: m.model,
      label: m.label,
      response: await askGeoModel(m.model, subject).catch((e) => `Error querying model: ${(e as Error).message}`),
    }))
  );
  onProgress({ type: "progress", step: "geo", status: "done", message: "Collected responses from all three models" });

  onProgress({ type: "progress", step: "synthesis", status: "running", message: "Scoring your digital presence..." });
  const geoModels = await classifyGeo(subject, rawResponses);
  const mentionedCount = geoModels.filter((m) => m.mentioned).length;
  const geoFindings: GeoFindings = {
    models: geoModels,
    summary: `${mentionedCount} of ${geoModels.length} AI models had real knowledge of you.`,
  };

  const seoScore = scoreSeo(seoFindings);
  const geoScore = scoreGeo(geoModels);
  const recommendations = await buildRecommendations(client, seoFindings, geoFindings, seoScore, geoScore).catch(
    () => []
  );

  onProgress({ type: "progress", step: "synthesis", status: "done", message: "Audit complete" });

  return { seoScore, geoScore, seoFindings, geoFindings, recommendations };
}
