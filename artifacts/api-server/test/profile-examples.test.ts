import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the OpenAI integration client so generatePillarExamples never makes a
// real AI call. Each test controls what the chat completion returns.
const createMock = vi.fn();
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: (...args: unknown[]) => createMock(...args),
      },
    },
  },
}));

// generatePillarExamples does not call Gemini, but the service module imports it
// at the top level, so provide a harmless mock to keep the import side-effect free.
vi.mock("@workspace/integrations-gemini-ai", () => ({
  ai: { models: { generateContent: vi.fn() } },
}));

import { generatePillarExamples } from "../src/services/profile";

function completion(content: string) {
  return { choices: [{ message: { content } }] };
}

const fields = [
  { name: "positioning", label: "How do you want to be positioned?" },
  { name: "primaryAudience", label: "Who do you most want to reach?", multiline: true },
];

beforeEach(() => {
  createMock.mockReset();
});

describe("generatePillarExamples industry-example fallback", () => {
  it("short-circuits to blanks (no AI call) when industry is empty", async () => {
    const result = await generatePillarExamples({
      pillarId: "identity",
      industry: "",
      fields,
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(result.fields).toEqual({ positioning: "", primaryAudience: "" });
  });

  it("short-circuits to blanks when industry is whitespace only", async () => {
    const result = await generatePillarExamples({
      pillarId: "identity",
      industry: "   \n\t ",
      fields,
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(result.fields).toEqual({ positioning: "", primaryAudience: "" });
  });

  it("returns blanks for every field when there are no fields", async () => {
    const result = await generatePillarExamples({
      pillarId: "identity",
      industry: "Law",
      fields: [],
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(result.fields).toEqual({});
  });

  it("returns an empty string per field when the AI output omits the expected keys", async () => {
    // Valid JSON, but none of the requested field keys are present.
    createMock.mockResolvedValue(completion(JSON.stringify({ unrelated: "value" })));

    const result = await generatePillarExamples({
      pillarId: "identity",
      industry: "Law",
      fields,
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.fields).toEqual({ positioning: "", primaryAudience: "" });
  });

  it("returns an empty string per field when the AI returns an empty object", async () => {
    createMock.mockResolvedValue(completion("{}"));

    const result = await generatePillarExamples({
      pillarId: "identity",
      industry: "Law",
      fields,
    });

    expect(result.fields).toEqual({ positioning: "", primaryAudience: "" });
  });

  it("returns an empty string per field when the completion content is missing", async () => {
    createMock.mockResolvedValue({ choices: [{ message: {} }] });

    const result = await generatePillarExamples({
      pillarId: "identity",
      industry: "Law",
      fields,
    });

    expect(result.fields).toEqual({ positioning: "", primaryAudience: "" });
  });

  it("blanks any field whose value is missing or not a string", async () => {
    createMock.mockResolvedValue(
      completion(
        JSON.stringify({
          positioning: "I help boutique firms win complex appellate cases.",
          // primaryAudience is a non-string, which must be coerced to ""
          primaryAudience: 42,
        }),
      ),
    );

    const result = await generatePillarExamples({
      pillarId: "identity",
      industry: "Law",
      fields,
    });

    expect(result.fields).toEqual({
      positioning: "I help boutique firms win complex appellate cases.",
      primaryAudience: "",
    });
  });

  it("returns the parsed sample strings on well-formed AI output", async () => {
    createMock.mockResolvedValue(
      completion(
        JSON.stringify({
          positioning: "I make tax law legible to founders.",
          primaryAudience: "Early-stage founders navigating their first audit.",
        }),
      ),
    );

    const result = await generatePillarExamples({
      pillarId: "identity",
      industry: "Law",
      fields,
    });

    expect(result.fields).toEqual({
      positioning: "I make tax law legible to founders.",
      primaryAudience: "Early-stage founders navigating their first audit.",
    });
  });
});
