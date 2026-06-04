import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClientProfile, GeoModelResult } from "@workspace/db";

// Mock all three AI integration clients so the audit flow never makes a real
// network/AI call. Each test controls exactly what every model returns, so the
// scoring, source wiring, and classifier plumbing are verified deterministically.
const openaiCreate = vi.fn();
const anthropicCreate = vi.fn();
const geminiGenerate = vi.fn();

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: { completions: { create: (...a: unknown[]) => openaiCreate(...a) } },
  },
}));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: {
    messages: { create: (...a: unknown[]) => anthropicCreate(...a) },
  },
}));

vi.mock("@workspace/integrations-gemini-ai", () => ({
  ai: {
    models: { generateContent: (...a: unknown[]) => geminiGenerate(...a) },
  },
}));

import { scoreGeo, runAudit } from "../src/services/audit";

function geoModel(overrides: Partial<GeoModelResult>): GeoModelResult {
  return {
    model: "chatgpt",
    label: "ChatGPT",
    mentioned: true,
    accuracy: "none",
    response: "",
    notes: "",
    ...overrides,
  };
}

describe("scoreGeo", () => {
  it("returns 0 for no models", () => {
    expect(scoreGeo([])).toBe(0);
  });

  it("scores a single accurate model at 100", () => {
    expect(scoreGeo([geoModel({ accuracy: "accurate" })])).toBe(100);
  });

  it("scores a single partial model at 55", () => {
    expect(scoreGeo([geoModel({ accuracy: "partial" })])).toBe(55);
  });

  it("scores a single incorrect model at 10 even when mentioned", () => {
    expect(scoreGeo([geoModel({ accuracy: "incorrect", mentioned: true })])).toBe(10);
  });

  it("scores a mentioned-but-none model at 30", () => {
    expect(scoreGeo([geoModel({ accuracy: "none", mentioned: true })])).toBe(30);
  });

  it("scores an unmentioned none model at 0", () => {
    expect(scoreGeo([geoModel({ accuracy: "none", mentioned: false })])).toBe(0);
  });

  it("averages a mix of accuracies across models and rounds", () => {
    // 100 + 55 + 0 = 155 / 3 = 51.67 -> 52
    const score = scoreGeo([
      geoModel({ accuracy: "accurate" }),
      geoModel({ accuracy: "partial" }),
      geoModel({ accuracy: "none", mentioned: false }),
    ]);
    expect(score).toBe(52);
  });

  it("averages accurate + incorrect + mentioned-none", () => {
    // 100 + 10 + 30 = 140 / 3 = 46.67 -> 47
    const score = scoreGeo([
      geoModel({ accuracy: "accurate" }),
      geoModel({ accuracy: "incorrect" }),
      geoModel({ accuracy: "none", mentioned: true }),
    ]);
    expect(score).toBe(47);
  });

  it("clamps to 0..100 and stays at 100 when all accurate", () => {
    const score = scoreGeo([
      geoModel({ accuracy: "accurate" }),
      geoModel({ accuracy: "accurate" }),
      geoModel({ accuracy: "accurate" }),
    ]);
    expect(score).toBe(100);
  });
});

function client(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    fullName: "Ada Lovelace",
    currentRole: "Mathematician",
    company: "Analytical Engines",
    industry: "Computing",
    location: "London",
    website: "ada.example",
    newsletter: null,
    goals: "Be known as a computing pioneer",
    ...overrides,
  } as ClientProfile;
}

function openaiText(content: string) {
  return { choices: [{ message: { content } }] };
}

function geminiResp(text: string, sources: { uri: string; title: string }[] = []) {
  return {
    text,
    candidates: [
      {
        groundingMetadata: {
          groundingChunks: sources.map((s) => ({ web: { uri: s.uri, title: s.title } })),
        },
      },
    ],
  };
}

// Route the shared OpenAI mock by inspecting the prompt, since runAudit uses
// gpt-5.4 for the SEO summary, the GEO summary, the ChatGPT model answer, the
// classifier, and the recommendations.
function routeOpenai(classifier: object, recommendations: object) {
  return (args: unknown) => {
    const prompt = String((args as { messages: { content: string }[] }).messages[0].content);
    if (prompt.includes("Return ONLY JSON in this exact shape")) {
      return Promise.resolve(openaiText(JSON.stringify(classifier)));
    }
    if (prompt.includes('{"recommendations"')) {
      return Promise.resolve(openaiText(JSON.stringify(recommendations)));
    }
    if (prompt.includes("You are an AI engine answering a user")) {
      return Promise.resolve(openaiText("ChatGPT says: Ada was a computing pioneer."));
    }
    // SEO / GEO prose summaries.
    return Promise.resolve(openaiText("A polished prose summary."));
  };
}

describe("runAudit flow (AI mocked)", () => {
  beforeEach(() => {
    openaiCreate.mockReset();
    anthropicCreate.mockReset();
    geminiGenerate.mockReset();
  });

  it("wires gathered web sources onto GeoFindings.sources and dedupes them", async () => {
    // First gemini call = SEO search, second = gatherWebContext, third = gemini model answer.
    geminiGenerate
      .mockResolvedValueOnce(
        geminiResp("SEO notes", [{ uri: "https://r/1", title: "wikipedia.org" }]),
      )
      .mockResolvedValueOnce(
        geminiResp("Web briefing about Ada", [
          { uri: "https://src/1", title: "wikipedia.org" },
          { uri: "https://src/1", title: "wikipedia.org" }, // duplicate url -> deduped
          { uri: "https://src/2", title: "britannica.com" },
          { uri: "https://src/3", title: "" }, // empty title -> dropped
        ]),
      )
      .mockResolvedValueOnce(geminiResp("Gemini says: Ada was a pioneer."));

    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "Claude says: Ada was a pioneer." }],
    });

    openaiCreate.mockImplementation(
      routeOpenai(
        {
          models: [
            { model: "chatgpt", mentioned: true, accuracy: "accurate", notes: "spot on" },
            { model: "claude", mentioned: true, accuracy: "partial", notes: "some detail" },
            { model: "gemini", mentioned: false, accuracy: "none", notes: "nothing" },
          ],
        },
        { recommendations: ["Publish more", "Get press"] },
      ),
    );

    const progress: string[] = [];
    const result = await runAudit(client(), (p) => {
      if (p.step) progress.push(`${p.step}:${p.status}`);
    });

    // Sources from gatherWebContext are surfaced, deduped by url, empty titles dropped.
    expect(result.geoFindings.sources).toEqual([
      { title: "wikipedia.org", url: "https://src/1" },
      { title: "britannica.com", url: "https://src/2" },
    ]);

    // Progress was emitted for all phases.
    expect(progress).toContain("seo:running");
    expect(progress).toContain("geo:done");
    expect(progress).toContain("synthesis:done");
  });

  it("maps the classifier verdict per model and scores GEO from it", async () => {
    geminiGenerate
      .mockResolvedValueOnce(geminiResp("SEO notes"))
      .mockResolvedValueOnce(geminiResp("Web briefing"))
      .mockResolvedValueOnce(geminiResp("Gemini answer"));

    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "Claude answer" }],
    });

    openaiCreate.mockImplementation(
      routeOpenai(
        {
          models: [
            { model: "chatgpt", mentioned: true, accuracy: "accurate", notes: "a" },
            { model: "claude", mentioned: true, accuracy: "partial", notes: "b" },
            { model: "gemini", mentioned: false, accuracy: "none", notes: "c" },
          ],
        },
        { recommendations: ["x"] },
      ),
    );

    const result = await runAudit(client(), () => {});

    const byId = Object.fromEntries(result.geoFindings.models.map((m) => [m.model, m]));
    expect(byId.chatgpt.accuracy).toBe("accurate");
    expect(byId.chatgpt.mentioned).toBe(true);
    expect(byId.claude.accuracy).toBe("partial");
    expect(byId.gemini.accuracy).toBe("none");
    expect(byId.gemini.mentioned).toBe(false);

    // 100 + 55 + 0 = 155 / 3 = 51.67 -> 52
    expect(result.geoScore).toBe(52);
    expect(result.recommendations).toEqual(["x"]);
  });

  it("defaults to a safe verdict when the classifier omits or mislabels a model", async () => {
    geminiGenerate
      .mockResolvedValueOnce(geminiResp("SEO notes"))
      .mockResolvedValueOnce(geminiResp("Web briefing"))
      .mockResolvedValueOnce(geminiResp("Gemini answer"));

    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "Claude answer" }],
    });

    openaiCreate.mockImplementation(
      routeOpenai(
        {
          models: [
            // chatgpt missing entirely -> defaults to none / not mentioned
            { model: "claude", mentioned: true, accuracy: "bogus-value", notes: "b" },
            { model: "gemini", mentioned: true, accuracy: "accurate", notes: "c" },
          ],
        },
        { recommendations: [] },
      ),
    );

    const result = await runAudit(client(), () => {});
    const byId = Object.fromEntries(result.geoFindings.models.map((m) => [m.model, m]));

    expect(byId.chatgpt.accuracy).toBe("none");
    expect(byId.chatgpt.mentioned).toBe(false);
    // invalid accuracy string falls back to "none"
    expect(byId.claude.accuracy).toBe("none");
    expect(byId.claude.mentioned).toBe(true);
    expect(byId.gemini.accuracy).toBe("accurate");

    // 0 (chatgpt) + 30 (claude mentioned/none) + 100 (gemini) = 130 / 3 = 43.33 -> 43
    expect(result.geoScore).toBe(43);
  });

  it("still completes and returns empty sources when web gathering fails", async () => {
    geminiGenerate
      .mockResolvedValueOnce(geminiResp("SEO notes")) // SEO ok
      .mockRejectedValueOnce(new Error("network down")) // gatherWebContext fails
      .mockResolvedValueOnce(geminiResp("Gemini answer")); // gemini model answer

    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "Claude answer" }],
    });

    openaiCreate.mockImplementation(
      routeOpenai(
        {
          models: [
            { model: "chatgpt", mentioned: false, accuracy: "none", notes: "" },
            { model: "claude", mentioned: false, accuracy: "none", notes: "" },
            { model: "gemini", mentioned: false, accuracy: "none", notes: "" },
          ],
        },
        { recommendations: [] },
      ),
    );

    const result = await runAudit(client(), () => {});

    expect(result.geoFindings.sources).toEqual([]);
    expect(result.geoScore).toBe(0);
    expect(result.geoFindings.models).toHaveLength(3);
  });
});
