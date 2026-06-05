import { openai } from "@workspace/integrations-openai-ai-server";
import { parseJsonLoose } from "./json";

export type FeedbackPart = { id: string; label: string };

/**
 * Build an explicit prompt block that injects the user's revision notes into a
 * generation prompt. Returns an empty string when there is no feedback, so
 * callers can append it unconditionally without affecting first-run behavior.
 */
export function feedbackBlock(
  feedback: string | undefined | null,
  opts?: { focus?: string },
): string {
  const text = (feedback ?? "").trim();
  if (!text) return "";
  const focusLine = opts?.focus
    ? ` Their feedback specifically concerns: ${opts.focus}. Apply it there while keeping everything else consistent with the source material.`
    : "";
  return `\n\nIMPORTANT — USER REVISION REQUEST: The user reviewed the previous result and asked for the changes below. You MUST directly honor this feedback in what you produce now. Do not ignore it, and do not merely restate the previous output.${focusLine}\n\n<user_feedback>\n${text}\n</user_feedback>`;
}

/**
 * Classify which part(s) of a multi-part result the feedback is about, so it can
 * be routed only to the relevant sub-prompts. Falls back to every part when the
 * feedback is general, unclear, or the classifier is unavailable.
 */
export async function classifyFeedbackParts(
  feedback: string | undefined | null,
  parts: FeedbackPart[],
): Promise<string[]> {
  const text = (feedback ?? "").trim();
  const allIds = parts.map((p) => p.id);
  if (!text || parts.length === 0) return allIds;

  const partList = parts.map((p) => `- ${p.id}: ${p.label}`).join("\n");
  const prompt = `A user gave feedback on a previously generated result that has multiple parts. Decide which part(s) the feedback is about so we can apply it only where it is relevant.\n\nParts:\n${partList}\n\nUser feedback:\n"""\n${text}\n"""\n\nReturn ONLY JSON: {"parts":["<id>", ...]} using the ids above. Include every part the feedback could reasonably affect. If the feedback is general or unclear, include all parts.`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = parseJsonLoose<{ parts?: string[] }>(
      resp.choices[0]?.message?.content ?? "{}",
    );
    const valid = new Set(allIds);
    const picked = (parsed.parts ?? []).filter((id) => valid.has(id));
    return picked.length > 0 ? picked : allIds;
  } catch {
    return allIds;
  }
}
