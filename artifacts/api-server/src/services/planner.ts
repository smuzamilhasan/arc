import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  ClientProfile,
  ContentStrategy,
  NarrativeProfile,
  PlatformStrategy,
} from "@workspace/db";
import { parseJsonLoose } from "./json";
import { feedbackBlock } from "./feedback";
import { computeScheduledDate } from "../routes/posts";

const PLATFORMS = ["linkedin", "twitter", "instagram", "blog", "other"] as const;
type Platform = (typeof PLATFORMS)[number];

export type PlannedSlot = {
  platform: Platform;
  title: string;
  format: string;
  contentType: string;
  brief: string;
  targetDate: string;
};

export type PlannedIdea = {
  title: string;
  notes: string;
  platform: string | null;
};

export type ContentPlanProposal = {
  summary: string;
  startDate: string;
  weeks: number;
  slots: PlannedSlot[];
  ideas: PlannedIdea[];
};

export type GenerateContentPlanOptions = {
  startDate?: string;
  weeks?: number;
  feedback?: string;
};

// The Planner only places slots on platforms the rest of the app understands.
// Anything else the model returns is collapsed to "other" so it still lands on
// the calendar rather than being silently dropped.
export function normalizePlatform(value: unknown): Platform {
  const v = String(value ?? "").trim().toLowerCase();
  if ((PLATFORMS as readonly string[]).includes(v)) return v as Platform;
  if (v === "x" || v.includes("twitter")) return "twitter";
  if (v.includes("linkedin")) return "linkedin";
  if (v.includes("insta")) return "instagram";
  if (v.includes("blog") || v.includes("newsletter") || v.includes("substack"))
    return "blog";
  return "other";
}

// Default the plan to start on the next Monday so a "weekly" plan lines up with
// a natural week. Returns a YYYY-MM-DD string in the server's local time.
export function defaultStartDate(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilMonday,
  );
  const yyyy = monday.getFullYear();
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function isValidStartDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    computeScheduledDate(value, 0);
    return true;
  } catch {
    return false;
  }
}

function buildStrategyContext(
  client: ClientProfile,
  narrative: NarrativeProfile | undefined,
  contentStrategy: ContentStrategy,
  platformStrategy: PlatformStrategy | undefined,
): string {
  const lines: (string | false | undefined)[] = [
    `Name: ${client.fullName}`,
    client.headline && `Headline: ${client.headline}`,
    client.positioning && `Positioning: ${client.positioning}`,
    client.primaryAudience && `Primary audience: ${client.primaryAudience}`,
    client.personalityTone && `Tone: ${client.personalityTone}`,
  ];

  if (narrative) {
    if (narrative.coreNarrative) lines.push(`Core narrative: ${narrative.coreNarrative}`);
    if (narrative.pointOfView) lines.push(`Point of view: ${narrative.pointOfView}`);
    if (narrative.themes?.length) {
      lines.push(
        `Strategic themes: ${narrative.themes
          .map((t) => t.title)
          .filter(Boolean)
          .join("; ")}`,
      );
    }
  }

  if (contentStrategy.summary) lines.push(`Content strategy: ${contentStrategy.summary}`);
  if (contentStrategy.platformPlan.length > 0) {
    lines.push(
      `Posting cadence (HONOR THIS):\n${contentStrategy.platformPlan
        .map(
          (p) =>
            `- ${p.platform}: ${p.frequency || "regular"} — ${p.focus || ""} [formats: ${p.formats.join(", ") || "varied"}]`,
        )
        .join("\n")}`,
    );
  }
  if (contentStrategy.contentMix.length > 0) {
    lines.push(
      `Content mix (use these buckets for contentType):\n${contentStrategy.contentMix
        .map((m) => `- ${m.type} (${m.weight || "?"}): ${m.description || ""}`)
        .join("\n")}`,
    );
  }
  if (contentStrategy.signatureSeries.length > 0) {
    lines.push(
      `Signature series to recur:\n${contentStrategy.signatureSeries
        .map((s) => `- ${s.name} (${s.cadence || ""}): ${s.description || ""}`)
        .join("\n")}`,
    );
  }
  if (contentStrategy.postFormats.length > 0) {
    lines.push(
      `Reusable formats:\n${contentStrategy.postFormats
        .map((f) => `- ${f.name}: ${f.description || ""}`)
        .join("\n")}`,
    );
  }

  if (platformStrategy?.online.primary.length) {
    lines.push(
      `Primary platforms to prioritize: ${platformStrategy.online.primary
        .map((p) => p.platform)
        .join(", ")}`,
    );
  }

  return lines.filter(Boolean).join("\n");
}

type RawSlot = {
  platform?: string;
  title?: string;
  format?: string;
  contentType?: string;
  brief?: string;
  dayOffset?: number;
  time?: string;
};

type RawIdea = { title?: string; notes?: string; platform?: string };

type RawPlan = {
  summary?: string;
  slots?: RawSlot[];
  ideas?: RawIdea[];
};

export async function generateContentPlan(
  client: ClientProfile,
  narrative: NarrativeProfile | undefined,
  contentStrategy: ContentStrategy,
  platformStrategy: PlatformStrategy | undefined,
  opts: GenerateContentPlanOptions = {},
): Promise<ContentPlanProposal> {
  const startDate = isValidStartDate(opts.startDate)
    ? opts.startDate
    : defaultStartDate();
  const weeks = Math.min(4, Math.max(1, Math.round(opts.weeks ?? 1)));
  const maxDayOffset = weeks * 7 - 1;

  const context = buildStrategyContext(
    client,
    narrative,
    contentStrategy,
    platformStrategy,
  );

  const prompt = `You are the Planner — an expert content calendar planner for a personal brand. Your job is to turn the APPROVED strategy below into a concrete ${weeks}-week (${weeks * 7}-day) content calendar of specific slots, honoring the stated posting cadence and prioritizing the primary platforms. Place content on high-impact touchpoints; do not overload any single day. Each slot is a placeholder a ghostwriter will later turn into a full post — give it a sharp working title/hook and a one-to-two sentence brief, NOT finished copy.

STRATEGY:
${context}

Rules:
- Respect the posting cadence per platform. If a platform says "3x / week", place roughly that many slots for it each week. Spread slots sensibly across the ${weeks * 7} days.
- Use dayOffset = whole days from the start of the plan (0 = the first day). dayOffset must be between 0 and ${maxDayOffset} inclusive.
- platform must be one of: linkedin, twitter, instagram, blog, other.
- contentType must be one of the content-mix buckets (Educational, Analytical, Opinionated, Story, Community) and the overall set of slots should roughly reflect the stated mix weights.
- format should reference the reusable formats / signature series where they fit.
- Also propose 4-8 distinct content IDEAS for the backlog: fresh, concrete angles drawn from the strategic themes that are NOT already covered by the calendar slots above. Each idea is a seed for a future post, not a finished post.

Return ONLY JSON in exactly this shape:
{
  "summary": "1-2 sentences framing this ${weeks}-week plan.",
  "slots": [
    {"platform": "linkedin", "dayOffset": 0, "time": "09:00", "title": "working title / hook", "format": "format or series name", "contentType": "Educational", "brief": "1-2 sentence brief for the ghostwriter"}
  ],
  "ideas": [
    {"platform": "linkedin", "title": "idea title", "notes": "what angle this explores and why it fits"}
  ]
}${feedbackBlock(opts.feedback)}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = parseJsonLoose<RawPlan>(resp.choices[0]?.message?.content ?? "{}");

  const slots: PlannedSlot[] = (parsed.slots ?? [])
    .filter((s) => s && (s.title || s.brief))
    .map((s) => {
      const offset = Math.min(
        maxDayOffset,
        Math.max(0, Math.round(Number(s.dayOffset ?? 0)) || 0),
      );
      const time = /^\d{1,2}:\d{2}$/.test(String(s.time ?? "")) ? s.time : "09:00";
      return {
        platform: normalizePlatform(s.platform),
        title: (s.title ?? "").trim(),
        format: (s.format ?? "").trim(),
        contentType: (s.contentType ?? "").trim(),
        brief: (s.brief ?? "").trim(),
        targetDate: computeScheduledDate(startDate, offset, time).toISOString(),
      };
    })
    .sort(
      (a, b) =>
        new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime(),
    );

  const ideas: PlannedIdea[] = (parsed.ideas ?? [])
    .filter((i) => i && i.title)
    .map((i) => ({
      title: (i.title ?? "").trim(),
      notes: (i.notes ?? "").trim(),
      platform: i.platform ? normalizePlatform(i.platform) : null,
    }));

  return {
    summary: parsed.summary ?? "",
    startDate,
    weeks,
    slots,
    ideas,
  };
}
