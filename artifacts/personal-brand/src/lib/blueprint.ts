import type { LucideIcon } from "lucide-react";
import { User, Compass, Lightbulb, BookOpen, Award } from "lucide-react";
import type {
  ClientProfile,
  ClientProfileInput,
} from "@workspace/api-client-react";

export type PillarField = {
  name: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
};

export type Pillar = {
  id: string;
  title: string;
  blurb: string;
  intro: string;
  icon: LucideIcon;
  fields: PillarField[];
  countFields: string[];
  supportingLabel?: string;
  supportingHint?: string;
  hasGather?: boolean;
  hasBioDraft?: boolean;
};

export const PILLARS: Pillar[] = [
  {
    id: "identity",
    title: "Identity & Positioning",
    blurb: "The niche you own and exactly who you are for.",
    intro:
      "Sharpen the single space you want to be known for and the people you serve. The clearer this is, the sharper everything arc generates downstream.",
    icon: Compass,
    countFields: ["positioning", "primaryAudience", "brandValues", "personalityTone"],
    supportingLabel: "More positioning detail",
    supportingHint:
      "Optional nuance on who you serve and how you sound. These aren't part of the count above.",
    fields: [
      {
        name: "positioning",
        label: "Who are you the go-to person for?",
        placeholder:
          "The specific niche or problem you want to own. e.g. \"helping early-stage founders tell investor-ready stories\".",
        multiline: true,
      },
      {
        name: "primaryAudience",
        label: "Primary audience",
        placeholder: "The people you most want to reach and earn trust with.",
        multiline: true,
      },
      {
        name: "secondaryAudience",
        label: "Secondary audience",
        placeholder: "Others who benefit or who you'd reach over time.",
        multiline: true,
      },
      {
        name: "geographyCulture",
        label: "Geography & culture",
        placeholder: "Regions, markets, or communities you speak to.",
      },
      {
        name: "brandValues",
        label: "Brand values",
        placeholder: "What you consistently stand for.",
        multiline: true,
      },
      {
        name: "nonNegotiables",
        label: "Non-negotiables (what you refuse to do)",
        placeholder: "The lines you won't cross, the takes you won't fake.",
        multiline: true,
      },
      {
        name: "personalityTone",
        label: "Personality & tone",
        placeholder: "How you sound. e.g. direct, warm, irreverent, precise.",
      },
      {
        name: "desiredFeeling",
        label: "How do you want people to feel?",
        placeholder: "The impression you want to leave after someone reads you.",
      },
    ],
  },
  {
    id: "worldview",
    title: "Ideas & Worldview",
    blurb: "The thesis and frameworks that make your ideas yours.",
    intro:
      "This is the engine of your point of view: the central argument you keep making and the named ideas only you bring.",
    icon: Lightbulb,
    countFields: ["thesis", "coreBeliefs", "signatureFrameworks"],
    supportingLabel: "Narrative depth",
    supportingHint:
      "These come from your narrative interview. They enrich what arc generates but aren't part of the count above.",
    fields: [
      {
        name: "thesis",
        label: "Your central thesis / worldview",
        placeholder:
          "The one argument you keep returning to. The thing you believe your field gets wrong or under-rates.",
        multiline: true,
      },
      {
        name: "coreBeliefs",
        label: "A few core beliefs you repeat",
        placeholder: "The convictions that show up across everything you say.",
        multiline: true,
      },
      {
        name: "signatureFrameworks",
        label: "Signature frameworks or named models",
        placeholder:
          "Any named methods, mental models, or step-by-step approaches you've developed.",
        multiline: true,
      },
      {
        name: "beliefs",
        label: "What do you believe that others in your field don't?",
        placeholder: "A contrarian take you'd defend.",
        multiline: true,
      },
      {
        name: "frustrations",
        label: "What frustrates you about how things are done today?",
        placeholder: "The status quo you'd love to see change.",
        multiline: true,
      },
      {
        name: "desiredChange",
        label: "If your voice carried, what would you change?",
        placeholder: "The mark you want your ideas to leave on your industry.",
        multiline: true,
      },
      {
        name: "passions",
        label: "What genuinely energizes you?",
        placeholder: "The topics or problems you could talk about for hours.",
        multiline: true,
      },
    ],
  },
  {
    id: "story",
    title: "Story",
    blurb: "The journey that explains why you do this work.",
    intro:
      "The arc of where you came from and how you got here. Stories make positioning believable and memorable.",
    icon: BookOpen,
    countFields: ["earlyLife", "professionalJourney"],
    supportingLabel: "More of your story",
    supportingHint:
      "Optional background that adds color and context. These aren't part of the count above.",
    fields: [
      {
        name: "earlyLife",
        label: "Early life",
        placeholder: "Where you grew up, and the moments or people that shaped you early on.",
        multiline: true,
      },
      {
        name: "schooling",
        label: "Schooling",
        placeholder: "Schools, formative subjects, early turning points.",
      },
      {
        name: "university",
        label: "University / further study",
        placeholder: "Where you studied and what.",
      },
      {
        name: "professionalJourney",
        label: "Professional journey",
        placeholder: "The path that brought you to what you do now, including the pivots.",
        multiline: true,
      },
      {
        name: "placeOfBirth",
        label: "Place of birth",
        placeholder: "City, Country",
      },
      {
        name: "dateOfBirth",
        label: "Date of birth",
        placeholder: "e.g. 12 March 1985",
      },
    ],
  },
  {
    id: "credibility",
    title: "Credibility & Proof",
    blurb: "The receipts that make your positioning believable.",
    intro:
      "The concrete proof behind your claims: what you've built, the numbers, the recognition, and who you've helped.",
    icon: Award,
    countFields: ["signatureAchievements", "quantifiableResults", "audienceImpact"],
    supportingLabel: "More proof",
    supportingHint:
      "Optional recognition that strengthens your case. These aren't part of the count above.",
    fields: [
      {
        name: "signatureAchievements",
        label: "What are you most proud of building or achieving?",
        placeholder: "The work, projects, or moments you'd point to.",
        multiline: true,
      },
      {
        name: "awards",
        label: "Awards, recognition, or notable mentions",
        placeholder: "Press, awards, board seats, talks, anything that signals credibility.",
        multiline: true,
      },
      {
        name: "quantifiableResults",
        label: "Numbers that tell the story",
        placeholder: "Revenue grown, users reached, funds raised, teams led, percentages moved.",
        multiline: true,
      },
      {
        name: "audienceImpact",
        label: "Who do you help, and what changes for them?",
        placeholder: "The people you serve and the difference your work makes for them.",
        multiline: true,
      },
    ],
  },
  {
    id: "basics",
    title: "Basics & Footprint",
    blurb: "Who you are today and where you already show up online.",
    intro:
      "Your current role, your headline and bio, your goals, and the links where people already find you.",
    icon: User,
    countFields: ["currentRole", "company", "industry", "headline", "bio"],
    supportingLabel: "Goals, links & footprint",
    supportingHint:
      "Your goals and where people already find you online. These aren't part of the count above.",
    hasGather: true,
    hasBioDraft: true,
    fields: [
      { name: "currentRole", label: "Current role", placeholder: "e.g. Founder & CEO" },
      { name: "company", label: "Company", placeholder: "Where you work" },
      { name: "industry", label: "Industry", placeholder: "e.g. Climate tech" },
      { name: "location", label: "Location", placeholder: "City, Country" },
      {
        name: "headline",
        label: "Professional headline",
        placeholder: "A single punchy line that says who you are and the value you create.",
      },
      {
        name: "bio",
        label: "Short bio",
        placeholder: "A confident 2-4 sentence bio for a speaker page or LinkedIn.",
        multiline: true,
      },
      {
        name: "goals",
        label: "What do you want to achieve with your brand?",
        placeholder:
          "e.g. be recognized as a thought leader, attract talent, secure speaking engagements.",
        multiline: true,
      },
      { name: "website", label: "Website", placeholder: "https://" },
      { name: "linkedinUrl", label: "LinkedIn", placeholder: "https://linkedin.com/in/..." },
      { name: "twitterUrl", label: "X / Twitter", placeholder: "https://x.com/..." },
      {
        name: "extractedInfo",
        label: "Publicly available info",
        placeholder:
          "What's already public about you. Use Gather above, or paste your LinkedIn About section.",
        multiline: true,
      },
    ],
  },
];

export function getPillar(id: string): Pillar | undefined {
  return PILLARS.find((p) => p.id === id);
}

// Core (counted) fields, kept in their original order within the pillar.
export function coreFields(pillar: Pillar): PillarField[] {
  return pillar.fields.filter((f) => pillar.countFields.includes(f.name));
}

// Supporting (non-counted) fields, kept in their original order. These enrich
// the work but are not part of the completion count.
export function supportingFields(pillar: Pillar): PillarField[] {
  return pillar.fields.filter((f) => !pillar.countFields.includes(f.name));
}

export function fieldValue(
  client: ClientProfile | undefined,
  name: string,
): string {
  if (!client) return "";
  const v = (client as unknown as Record<string, unknown>)[name];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export type PillarProgress = { filled: number; total: number; pct: number };

export function pillarCompletion(
  pillar: Pillar,
  client: ClientProfile | undefined,
): PillarProgress {
  const total = pillar.countFields.length;
  const filled = pillar.countFields.filter((f) => fieldValue(client, f).trim()).length;
  return { filled, total, pct: total === 0 ? 0 : Math.round((filled / total) * 100) };
}

export function overallCompletion(client: ClientProfile | undefined): PillarProgress {
  let filled = 0;
  let total = 0;
  for (const pillar of PILLARS) {
    const p = pillarCompletion(pillar, client);
    filled += p.filled;
    total += p.total;
  }
  return { filled, total, pct: total === 0 ? 0 : Math.round((filled / total) * 100) };
}

// Next-best pillar to work on: the first incomplete pillar in strategic order.
export function nextPillar(client: ClientProfile | undefined): Pillar | null {
  for (const pillar of PILLARS) {
    if (pillarCompletion(pillar, client).pct < 100) return pillar;
  }
  return null;
}

// Build a full ClientProfileInput from a loaded profile so a single-pillar save
// never drops fields that belong to other pillars.
export function clientToInput(client: ClientProfile): ClientProfileInput {
  const { id, createdAt, updatedAt, ...rest } = client;
  void id;
  void createdAt;
  void updatedAt;
  return {
    ...rest,
    dateOfBirth: client.dateOfBirth ?? "",
    website: client.website ?? "",
    newsletter: client.newsletter ?? "",
    linkedinUrl: client.linkedinUrl ?? "",
    twitterUrl: client.twitterUrl ?? "",
    instagramUrl: client.instagramUrl ?? "",
    youtubeUrl: client.youtubeUrl ?? "",
  };
}
