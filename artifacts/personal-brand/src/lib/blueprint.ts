import type { LucideIcon } from "lucide-react";
import { User, Compass, Lightbulb, BookOpen, Award, Flame } from "lucide-react";
import type {
  ClientProfile,
  ClientProfileInput,
} from "@workspace/api-client-react";

export type PillarField = {
  name: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  // A concrete sample answer that shows the user what "good" looks like. Shown
  // on demand behind a "See an example" toggle, never auto-inserted.
  example?: string;
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
  hasDraft?: boolean;
};

export const PILLARS: Pillar[] = [
  {
    id: "identity",
    title: "Identity & Positioning",
    blurb: "The niche you own and exactly who you are for.",
    intro:
      "Sharpen the single space you want to be known for and the people you serve. The clearer this is, the sharper everything arc generates downstream.",
    icon: Compass,
    hasDraft: true,
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
        example:
          "I help early-stage B2B founders turn a messy product story into an investor-ready narrative that actually closes the round.",
      },
      {
        name: "primaryAudience",
        label: "Primary audience",
        placeholder: "The people you most want to reach and earn trust with.",
        multiline: true,
        example:
          "First-time founders raising a seed or Series A who know their product cold but freeze the moment they have to pitch it.",
      },
      {
        name: "secondaryAudience",
        label: "Secondary audience",
        placeholder: "Others who benefit or who you'd reach over time.",
        multiline: true,
        example:
          "Heads of marketing and early operators at those startups, who end up owning the company story day to day.",
      },
      {
        name: "geographyCulture",
        label: "Geography & culture",
        placeholder: "Regions, markets, or communities you speak to.",
        example: "Primarily US and European tech hubs; deeply rooted in startup and venture culture.",
      },
      {
        name: "brandValues",
        label: "Brand values",
        placeholder: "What you consistently stand for.",
        multiline: true,
        example: "Clarity over jargon, candor over hype, and protecting the founder's own voice.",
      },
      {
        name: "nonNegotiables",
        label: "Non-negotiables (what you refuse to do)",
        placeholder: "The lines you won't cross, the takes you won't fake.",
        multiline: true,
        example:
          "I won't write hype I don't believe, chase engagement bait, or promise overnight virality.",
      },
      {
        name: "personalityTone",
        label: "Personality & tone",
        placeholder: "How you sound. e.g. direct, warm, irreverent, precise.",
        example: "Direct and warm — plain-spoken, a little irreverent, never corporate.",
      },
      {
        name: "desiredFeeling",
        label: "How do you want people to feel?",
        placeholder: "The impression you want to leave after someone reads you.",
        example: "Relieved and capable — like the fog cleared and they finally know what to say.",
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
    hasDraft: true,
    countFields: ["thesis", "coreBeliefs", "signatureFrameworks"],
    fields: [
      {
        name: "thesis",
        label: "Your central thesis / worldview",
        placeholder:
          "The one argument you keep returning to. The thing you believe your field gets wrong or under-rates.",
        multiline: true,
        example:
          "Most founders don't have a visibility problem, they have a clarity problem. The market rewards the sharpest story, not the loudest one.",
      },
      {
        name: "coreBeliefs",
        label: "A few core beliefs you repeat",
        placeholder: "The convictions that show up across everything you say.",
        multiline: true,
        example:
          "Specific beats clever. If a stranger can't repeat your pitch, it isn't finished. Distribution is part of the product, not an afterthought.",
      },
      {
        name: "signatureFrameworks",
        label: "Signature frameworks or named models",
        placeholder:
          "Any named methods, mental models, or step-by-step approaches you've developed.",
        multiline: true,
        example:
          "The 'One Sentence, One Slide, One Story' method I use to compress any pitch down to its essential arc.",
      },
    ],
  },
  {
    id: "conviction",
    title: "Conviction & Drive",
    blurb: "The beliefs and frustrations that fuel why you speak up.",
    intro:
      "What you'd argue for, what you'd change, and what genuinely energizes you. This is the emotional engine behind your point of view, and it gives arc the conviction to make your content sound like you.",
    icon: Flame,
    countFields: ["beliefs", "frustrations", "desiredChange", "passions"],
    fields: [
      {
        name: "beliefs",
        label: "What do you believe that others in your field don't?",
        placeholder: "A contrarian take you'd defend.",
        multiline: true,
        example:
          "Thought leadership isn't about posting more. Most of it is noise that makes every founder sound identical.",
      },
      {
        name: "frustrations",
        label: "What frustrates you about how things are done today?",
        placeholder: "The status quo you'd love to see change.",
        multiline: true,
        example:
          "Watching brilliant founders copy generic LinkedIn templates and erase the very thing that made them interesting.",
      },
      {
        name: "desiredChange",
        label: "If your voice carried, what would you change?",
        placeholder: "The mark you want your ideas to leave on your industry.",
        multiline: true,
        example:
          "I want founders to build audiences on substance and a real point of view, not on engagement bait.",
      },
      {
        name: "passions",
        label: "What genuinely energizes you?",
        placeholder: "The topics or problems you could talk about for hours.",
        multiline: true,
        example:
          "Taking a tangled idea and finding the one clean sentence that makes everyone in the room nod.",
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
        example:
          "Grew up in a small mill town where my parents ran a corner shop. I learned how to sell before I could spell.",
      },
      {
        name: "schooling",
        label: "Schooling",
        placeholder: "Schools, formative subjects, early turning points.",
        example:
          "State school, strongest in English and debate — that's where I fell for the craft of a good argument.",
      },
      {
        name: "university",
        label: "University / further study",
        placeholder: "Where you studied and what.",
        example: "BA in Communications, specializing in rhetoric and media.",
      },
      {
        name: "professionalJourney",
        label: "Professional journey",
        placeholder: "The path that brought you to what you do now, including the pivots.",
        multiline: true,
        example:
          "Started in agency PR, went in-house at two startups (one acquired), then went independent in 2020 to coach founders directly.",
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
        example:
          "Coached 40+ founders, rewrote pitches that helped raise a combined $120M, and built a 25k-subscriber newsletter from scratch.",
      },
      {
        name: "awards",
        label: "Awards, recognition, or notable mentions",
        placeholder: "Press, awards, board seats, talks, anything that signals credibility.",
        multiline: true,
        example: "TEDx speaker; quoted in TechCrunch and the FT; advisor to two accelerators.",
      },
      {
        name: "quantifiableResults",
        label: "Numbers that tell the story",
        placeholder: "Revenue grown, users reached, funds raised, teams led, percentages moved.",
        multiline: true,
        example:
          "Clients average a 3x lift in inbound after repositioning; one went from 200 to 18k followers in a year.",
      },
      {
        name: "audienceImpact",
        label: "Who do you help, and what changes for them?",
        placeholder: "The people you serve and the difference your work makes for them.",
        multiline: true,
        example:
          "Founders walk away able to pitch in one sentence, which shortens their fundraise and sharpens their hiring.",
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
        example: "I turn founder expertise into investor-ready stories.",
      },
      {
        name: "bio",
        label: "Short bio",
        placeholder: "A confident 2-4 sentence bio for a speaker page or LinkedIn.",
        multiline: true,
        example:
          "Jane Doe is a brand strategist who helps early-stage founders find the words for what they've built. Over the last six years she's coached 40+ founders and shaped pitches behind $120M in funding. She writes a weekly newsletter on founder storytelling read by 25,000 operators.",
      },
      {
        name: "goals",
        label: "What do you want to achieve with your brand?",
        placeholder:
          "e.g. be recognized as a thought leader, attract talent, secure speaking engagements.",
        multiline: true,
        example:
          "Be known as the go-to voice on founder storytelling, land four keynotes a year, and grow my newsletter to 50k.",
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

// Resolve which example to show for a field. An industry-tailored sample
// (`exampleOverride`) is preferred when present and non-empty; otherwise we fall
// back to the field's static example. Whitespace-only overrides count as empty
// so a blank AI result never blanks out the static fallback. Returns undefined
// when neither is available (the "See an example" affordance is then hidden).
export function resolveFieldExample(
  field: PillarField,
  exampleOverride?: string,
): string | undefined {
  return exampleOverride?.trim() ? exampleOverride : field.example;
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

// The gated progression. Clients build their Blueprint in this deliberate
// order: each stage is a group of pillar ids that unlock together once the
// previous stage's core fields are all complete. Basics & Footprint is captured
// during onboarding, so it is always the first (and always-open) stage.
export const BLUEPRINT_STAGES: string[][] = [
  ["basics"],
  ["story"],
  ["credibility"],
  ["identity", "worldview", "conviction"],
];

// Pillars flattened into the gated order above, for ordered rendering and
// for walking the "next best step" sequence.
export const ORDERED_PILLARS: Pillar[] = BLUEPRINT_STAGES.flat()
  .map((id) => getPillar(id))
  .filter((p): p is Pillar => Boolean(p));

// A pillar has any saved data when at least one of its fields (core or
// supporting) is filled in. Such a pillar always stays editable even if its
// stage hasn't been reached yet, so existing clients never lose access.
export function pillarHasData(
  pillar: Pillar,
  client: ClientProfile | undefined,
): boolean {
  return pillar.fields.some((f) => fieldValue(client, f.name).trim());
}

// A pillar's core (counted) fields are all filled in.
export function pillarCoreComplete(
  pillar: Pillar,
  client: ClientProfile | undefined,
): boolean {
  return pillar.countFields.every((f) => fieldValue(client, f).trim());
}

// A stage is complete when every pillar within it has all of its core fields
// filled in. This is what opens the gate to the next stage.
export function stageComplete(
  stageIds: string[],
  client: ClientProfile | undefined,
): boolean {
  return stageIds.every((id) => {
    const p = getPillar(id);
    return p ? pillarCoreComplete(p, client) : true;
  });
}

// The set of currently unlocked pillar ids. A pillar is unlocked when the
// immediately preceding stage's core fields are all complete, OR the pillar
// already contains saved data ("locked except what is already filled").
export function unlockedPillarIds(
  client: ClientProfile | undefined,
): Set<string> {
  const unlocked = new Set<string>();
  for (let i = 0; i < BLUEPRINT_STAGES.length; i++) {
    const stage = BLUEPRINT_STAGES[i];
    const gateOpen = i === 0 || stageComplete(BLUEPRINT_STAGES[i - 1], client);
    for (const id of stage) {
      const pillar = getPillar(id);
      if (!pillar) continue;
      if (gateOpen || pillarHasData(pillar, client)) unlocked.add(id);
    }
  }
  return unlocked;
}

export function isPillarUnlocked(
  pillarId: string,
  client: ClientProfile | undefined,
): boolean {
  return unlockedPillarIds(client).has(pillarId);
}

// Where a stage sits on the journey. "complete" = all its pillars' core fields
// are filled; "current" = its gate is open but it isn't finished (this is the
// stage that holds the next best step); "locked" = the previous stage isn't
// done yet, so it hasn't been reached.
export type BlueprintStageStatus = "complete" | "current" | "locked";

export type BlueprintStageView = {
  index: number;
  pillars: Pillar[];
  // A readable label for the whole stage (its pillar titles).
  label: string;
  status: BlueprintStageStatus;
};

// The journey as an ordered list of stages with their progress state, for the
// timeline/stepper. Because gating is linear, exactly one stage is "current"
// (gate open but unfinished) until everything is complete — and that current
// stage is the one holding `nextPillar`, so the stepper and the nudge agree.
export function blueprintStages(
  client: ClientProfile | undefined,
): BlueprintStageView[] {
  return BLUEPRINT_STAGES.map((ids, i) => {
    const pillars = ids
      .map((id) => getPillar(id))
      .filter((p): p is Pillar => Boolean(p));
    const complete = stageComplete(ids, client);
    const gateOpen = i === 0 || stageComplete(BLUEPRINT_STAGES[i - 1], client);
    const status: BlueprintStageStatus = complete
      ? "complete"
      : gateOpen
        ? "current"
        : "locked";
    return {
      index: i,
      pillars,
      label: pillars.map((p) => p.title).join(", "),
      status,
    };
  });
}

// A short hint of what unlocks a locked pillar: the previous stage's title(s).
export function unlockHint(pillarId: string): string {
  const stageIndex = BLUEPRINT_STAGES.findIndex((s) => s.includes(pillarId));
  if (stageIndex <= 0) return "";
  const prevTitles = BLUEPRINT_STAGES[stageIndex - 1]
    .map((id) => getPillar(id)?.title)
    .filter((t): t is string => Boolean(t));
  if (prevTitles.length === 0) return "";
  return `Complete ${prevTitles.join(" & ")} to unlock`;
}

// A single unlock prerequisite presented to the user: a human label, whether it
// is already satisfied, an optional progress detail, and where to go to satisfy
// it. Every gated surface (locked panels, locked pillar editors) describes its
// requirements as a list of these so the locked-state UI is uniform everywhere.
export type Prerequisite = {
  id: string;
  label: string;
  href: string;
  complete: boolean;
  detail?: string;
};

function pillarPrerequisite(
  pillar: Pillar,
  client: ClientProfile | undefined,
): Prerequisite {
  const progress = pillarCompletion(pillar, client);
  return {
    id: pillar.id,
    label: pillar.title,
    href: `/blueprint/${pillar.id}`,
    complete: pillarCoreComplete(pillar, client),
    detail: `${progress.filled}/${progress.total} core areas`,
  };
}

// The prerequisites that make up a complete Blueprint: every pillar's core
// fields. Used by panels that gate on "Blueprint complete".
export function blueprintPrerequisites(
  client: ClientProfile | undefined,
): Prerequisite[] {
  return ORDERED_PILLARS.map((pillar) => pillarPrerequisite(pillar, client));
}

// The basics that make a first audit meaningful: who arc is searching for and
// where they already show up online. This is a SOFT readiness hint surfaced at
// the audit action (the audit can still be run with any of these missing), reusing
// the same Prerequisite shape as the hard panel gates so the checklist UI stays
// identical everywhere. All items link to Basics & Footprint, where they're filled.
export function auditReadinessPrerequisites(
  client: ClientProfile | undefined,
): Prerequisite[] {
  const has = (name: string) => Boolean(fieldValue(client, name).trim());
  const footprintFields = [
    "website",
    "linkedinUrl",
    "twitterUrl",
    "instagramUrl",
    "youtubeUrl",
    "extractedInfo",
  ];
  const hasFootprint = footprintFields.some((f) => has(f));
  const basicsHref = "/blueprint/basics";
  return [
    {
      id: "name",
      label: "Your name",
      href: basicsHref,
      complete: has("fullName"),
      detail: "Who arc searches for",
    },
    {
      id: "role",
      label: "Current role",
      href: basicsHref,
      complete: has("currentRole"),
      detail: "Adds context to every search",
    },
    {
      id: "footprint",
      label: "Online footprint",
      href: basicsHref,
      complete: hasFootprint,
      detail: "A link or two where you already show up",
    },
  ];
}

// The prerequisites a locked Blueprint pillar is waiting on: every pillar in the
// immediately preceding stage. Empty for always-open first-stage pillars.
export function pillarUnlockPrerequisites(
  pillarId: string,
  client: ClientProfile | undefined,
): Prerequisite[] {
  const stageIndex = BLUEPRINT_STAGES.findIndex((s) => s.includes(pillarId));
  if (stageIndex <= 0) return [];
  return BLUEPRINT_STAGES[stageIndex - 1]
    .map((id) => getPillar(id))
    .filter((p): p is Pillar => Boolean(p))
    .map((pillar) => pillarPrerequisite(pillar, client));
}

// The product's gated panels, keyed by route slug. Each declares how to label
// its locked state and how to compute the prerequisites that unlock it. New
// gated panels register here and automatically get the same explanatory locked
// UX (the shared LockedPanel component) and a clickable, explained sidebar item.
export type PanelGateId = "platforms" | "content" | "industry";

export type PanelGateContext = {
  client: ClientProfile | undefined;
  hasPlatformStrategy: boolean;
  // Only the capstone "industry" gate reads these; other gates leave them unset.
  hasAudit?: boolean;
  hasNarrative?: boolean;
};

type PanelGateConfig = {
  title: string;
  description: string;
  prerequisites: (ctx: PanelGateContext) => Prerequisite[];
};

export const PANEL_GATES: Record<PanelGateId, PanelGateConfig> = {
  platforms: {
    title: "Platforms & Presence",
    description:
      "arc turns a complete Blueprint into a tailored digital and physical presence strategy. Finish the sections below and this panel opens on its own.",
    prerequisites: (ctx) => blueprintPrerequisites(ctx.client),
  },
  content: {
    title: "Content",
    description:
      "arc builds your content strategy from a complete Blueprint and a Platforms strategy. Finish the sections below and this panel opens on its own.",
    prerequisites: (ctx) => [
      ...blueprintPrerequisites(ctx.client),
      {
        id: "platforms",
        label: "Platforms & Presence strategy",
        href: "/platforms",
        complete: ctx.hasPlatformStrategy,
        detail: ctx.hasPlatformStrategy ? undefined : "Generate your platform strategy",
      },
    ],
  },
  industry: {
    title: "Industry Overview",
    description:
      "arc maps your industry landscape once your whole foundation is in place. Finish everything below and this capstone panel opens on its own.",
    prerequisites: (ctx) => [
      ...blueprintPrerequisites(ctx.client),
      {
        id: "audit",
        label: "Digital presence audit",
        href: "/audit",
        complete: Boolean(ctx.hasAudit),
        detail: ctx.hasAudit ? undefined : "Run your first audit",
      },
      {
        id: "narrative",
        label: "Narrative",
        href: "/narrative",
        complete: Boolean(ctx.hasNarrative),
        detail: ctx.hasNarrative ? undefined : "Synthesize your narrative",
      },
      {
        id: "platforms",
        label: "Platforms & Presence strategy",
        href: "/platforms",
        complete: ctx.hasPlatformStrategy,
        detail: ctx.hasPlatformStrategy ? undefined : "Generate your platform strategy",
      },
    ],
  },
};

export function panelGatePrerequisites(
  gate: PanelGateId,
  ctx: PanelGateContext,
): Prerequisite[] {
  return PANEL_GATES[gate].prerequisites(ctx);
}

export function isPanelUnlocked(gate: PanelGateId, ctx: PanelGateContext): boolean {
  return panelGatePrerequisites(gate, ctx).every((p) => p.complete);
}

// The four "foundation" areas the app is set up around: Blueprint, Audit,
// Narrative, and Platforms. They stay front-and-center while being filled in,
// then collapse into a single Foundation hub once all are complete.
export type FoundationContext = {
  client: ClientProfile | undefined;
  hasAudit: boolean;
  hasNarrative: boolean;
  hasPlatformStrategy: boolean;
};

// True only once every foundation area is done: Blueprint fully complete
// (no next pillar to fill), and an audit, narrative, and platform strategy all
// exist. Reversible — flips back to false if any underlying data disappears.
export function isFoundationComplete(ctx: FoundationContext): boolean {
  return (
    Boolean(ctx.client) &&
    nextPillar(ctx.client) === null &&
    ctx.hasAudit &&
    ctx.hasNarrative &&
    ctx.hasPlatformStrategy
  );
}

// Next-best pillar to work on: the first incomplete, unlocked pillar in the
// gated order. Locked pillars are skipped.
export function nextPillar(client: ClientProfile | undefined): Pillar | null {
  const unlocked = unlockedPillarIds(client);
  for (const pillar of ORDERED_PILLARS) {
    if (!unlocked.has(pillar.id)) continue;
    if (pillarCompletion(pillar, client).pct < 100) return pillar;
  }
  return null;
}

// The next pillar to nudge toward after finishing one: the first incomplete,
// unlocked pillar in gated order that is NOT the one just saved. Returns null
// when every other reachable pillar is already complete.
export function nextPillarAfter(
  client: ClientProfile | undefined,
  currentId: string,
): Pillar | null {
  const unlocked = unlockedPillarIds(client);
  for (const pillar of ORDERED_PILLARS) {
    if (pillar.id === currentId) continue;
    if (!unlocked.has(pillar.id)) continue;
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
