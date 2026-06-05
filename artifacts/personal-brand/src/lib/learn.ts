// The five messaging pillars every piece of arc's educational copy threads
// through. The ids mirror the server's InsightPillar union so a generated
// insight can be colour-matched to the same pillar shown in the Learn hub.
export type LearnPillarId =
  | "patience"
  | "authentic_input"
  | "ai_augments"
  | "creative_thought"
  | "brand_reflects_life";

export type LearnPillar = {
  id: LearnPillarId;
  name: string;
  tagline: string;
  description: string;
};

export const LEARN_PILLARS: LearnPillar[] = [
  {
    id: "patience",
    name: "Patience compounds",
    tagline: "A reputation is built in years, not weeks.",
    description:
      "A world-class personal brand is a slow compounding asset. The unglamorous, consistent work done quietly over months is what eventually looks like an overnight success. Resist the urge to measure yourself against a viral moment; measure yourself against last quarter.",
  },
  {
    id: "authentic_input",
    name: "Authentic input",
    tagline: "The quality of what goes in sets the ceiling for what comes out.",
    description:
      "Everything arc produces is downstream of the raw material you give it: your real history, convictions, results, and the way you actually talk. Generic input produces a generic brand. The honest, specific, slightly uncomfortable details are the ones worth the most.",
  },
  {
    id: "ai_augments",
    name: "AI augments, never replaces",
    tagline: "AI is an instrument. You are still the musician.",
    description:
      "arc accelerates research, structure, and drafting so you can spend your energy on judgement and meaning. It does not, and should not, replace your point of view. Treat every AI output as a strong first draft to react to, sharpen, and make unmistakably yours.",
  },
  {
    id: "creative_thought",
    name: "Creative thought is irreplaceable",
    tagline: "The original idea is the part no model can hand you.",
    description:
      "Synthesis, taste, and an original angle are the scarce goods of a crowded internet. A genuinely new observation drawn from your own experience will always outperform a well-formatted summary of what everyone already knows. Protect the time you spend thinking.",
  },
  {
    id: "brand_reflects_life",
    name: "Your brand reflects your life",
    tagline: "Vision, mission, craft, and self-awareness — not a costume.",
    description:
      "The most durable personal brands are simply a clear, public expression of how someone already lives and works. Anchor everything in your real vision, your mission, the craft you are genuinely good at, and honest self-awareness. A brand that drifts from the life behind it becomes exhausting to maintain.",
  },
];

export const LEARN_PILLAR_BY_ID: Record<LearnPillarId, LearnPillar> = LEARN_PILLARS.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<LearnPillarId, LearnPillar>,
);

// Mirrors the server JourneyStage union so the Learn hub can highlight the
// stage the client is actually in. Derived client-side from the dashboard
// summary signals rather than re-deriving the full system context.
export type LearnStage =
  | "foundation"
  | "audit"
  | "narrative"
  | "platforms"
  | "strategy"
  | "activation"
  | "growth";

export type StageSignals = {
  onboardingComplete?: boolean;
  auditComplete?: boolean;
  narrativeComplete?: boolean;
  platformsComplete?: boolean;
  contentStrategyComplete?: boolean;
  hasPosts?: boolean;
};

export function deriveLearnStage(s: StageSignals): LearnStage {
  if (!s.narrativeComplete) {
    return s.auditComplete ? "narrative" : s.onboardingComplete ? "audit" : "foundation";
  }
  if (!s.platformsComplete) return "platforms";
  if (!s.contentStrategyComplete) return "strategy";
  if (!s.hasPosts) return "activation";
  return "growth";
}

export type LearnModule = {
  stage: LearnStage;
  stageLabel: string;
  heading: string;
  intro: string;
  lessons: {
    pillar: LearnPillarId;
    title: string;
    body: string;
  }[];
};

// Static, journey-aware curriculum. Ordered as the client travels the arc; the
// hub surfaces the module matching their current stage first, then the rest as
// "what comes next" context. Every lesson is anchored to one of the five
// pillars so the messaging stays consistent end to end.
export const LEARN_CURRICULUM: LearnModule[] = [
  {
    stage: "foundation",
    stageLabel: "Foundation",
    heading: "Build the foundation honestly",
    intro:
      "Before arc can position you, it needs the raw, true material of who you are. This is the slow, unglamorous work that everything else stands on.",
    lessons: [
      {
        pillar: "authentic_input",
        title: "Give it the real story",
        body: "The Blueprint asks deep, sometimes uncomfortable questions about your history, beliefs, and results. The more specific and honest you are, the better everything downstream becomes. Vague input is the single biggest cause of a generic-sounding brand.",
      },
      {
        pillar: "brand_reflects_life",
        title: "Start from the life you actually live",
        body: "Do not invent an aspirational persona. Capture the vision, mission, and craft that are already true for you. A brand grounded in your real life is one you can sustain for years without it feeling like a costume.",
      },
      {
        pillar: "patience",
        title: "The foundation is not the highlight reel",
        body: "It is tempting to rush to publishing. Resist it. The time you invest here compounds into every audit, narrative, and post that follows.",
      },
    ],
  },
  {
    stage: "audit",
    stageLabel: "Audit",
    heading: "Look in the honest mirror",
    intro:
      "The audit shows how you currently show up across Google search and AI models. Treat it as a diagnostic, not a verdict.",
    lessons: [
      {
        pillar: "brand_reflects_life",
        title: "The gap is the opportunity",
        body: "Where the audit's picture of you differs from who you really are, you have found exactly what your brand work needs to close. The goal is alignment between the real you and the public you.",
      },
      {
        pillar: "ai_augments",
        title: "AI sees you through what exists",
        body: "Models can only describe you from the public traces you have left. A thin or wrong picture is not a judgement of your worth — it is a signal that there is room to author the record more deliberately.",
      },
      {
        pillar: "patience",
        title: "Scores move slowly, and that is fine",
        body: "Search and AI visibility shift over months as new, consistent signals accumulate. Do not expect a number to jump after a single post.",
      },
    ],
  },
  {
    stage: "narrative",
    stageLabel: "Narrative",
    heading: "Find the point of view only you have",
    intro:
      "Your narrative is the through-line that makes your content recognisably yours. It comes from mining your real convictions, not from copying a template.",
    lessons: [
      {
        pillar: "creative_thought",
        title: "An original angle beats a polished summary",
        body: "The internet is saturated with competent restatements of common wisdom. Your edge is a genuinely new observation drawn from your own experience. That is the part no model can hand you.",
      },
      {
        pillar: "authentic_input",
        title: "Mine your real life for material",
        body: "The strongest narratives come from specific lived moments, hard-won lessons, and convictions you would defend. Reach for those before reaching for a generic 'thought leader' voice.",
      },
      {
        pillar: "ai_augments",
        title: "Draft with arc, decide for yourself",
        body: "Let arc structure and draft the narrative, then react to it hard. Cut what does not sound like you. The judgement of what is true and meaningful stays with you.",
      },
    ],
  },
  {
    stage: "platforms",
    stageLabel: "Platforms",
    heading: "Choose focus over presence everywhere",
    intro:
      "You do not need to be on every platform. You need to be genuinely good on the few that fit your narrative and audience.",
    lessons: [
      {
        pillar: "patience",
        title: "Depth on one beats noise on five",
        body: "Building real traction on a single platform is slow and worth it. Spreading thin across all of them feels productive but compounds nowhere.",
      },
      {
        pillar: "brand_reflects_life",
        title: "Pick platforms that fit how you work",
        body: "Choose channels that match your natural medium and rhythm. A brand strategy you can actually keep up with beats an ambitious one you abandon.",
      },
    ],
  },
  {
    stage: "strategy",
    stageLabel: "Strategy",
    heading: "Set a rhythm you can sustain",
    intro:
      "A content strategy is a promise to your future self. Make it one you can keep on a hard week, not just an inspired one.",
    lessons: [
      {
        pillar: "patience",
        title: "Consistency outruns intensity",
        body: "A modest, steady cadence sustained for a year beats a heroic sprint that burns out in a month. Plan for the long game.",
      },
      {
        pillar: "creative_thought",
        title: "Protect time to think, not just to post",
        body: "Your best material comes from reflection, not from scrambling to fill a slot. Build thinking time into the rhythm, not just publishing time.",
      },
    ],
  },
  {
    stage: "activation",
    stageLabel: "Activation",
    heading: "Ship the first imperfect things",
    intro:
      "Your strategy is set. Now the only thing that matters is publishing and learning in public.",
    lessons: [
      {
        pillar: "patience",
        title: "The first posts are practice",
        body: "Early work rarely lands the way you hope, and that is the point. Each piece teaches you something the next one uses. Volume early, refinement later.",
      },
      {
        pillar: "ai_augments",
        title: "Draft fast, then make it yours",
        body: "Use arc's ghostwriter to get past the blank page, then edit until it sounds unmistakably like you before it ships. Speed on the draft, ownership on the voice.",
      },
      {
        pillar: "creative_thought",
        title: "Say something only you would say",
        body: "When in doubt, lead with the observation that surprised you, not the one everyone expects. That is what makes a reader stop.",
      },
    ],
  },
  {
    stage: "growth",
    stageLabel: "Growth",
    heading: "Compound, refine, and stay patient",
    intro:
      "You are publishing consistently. Now the work is to keep going, listen to real feedback, and let the compounding do its job.",
    lessons: [
      {
        pillar: "patience",
        title: "Trust the compounding",
        body: "Results from consistent publishing arrive non-linearly and later than you expect. The month it feels pointless is often the month before it works.",
      },
      {
        pillar: "creative_thought",
        title: "Refine your point of view from the field",
        body: "Real-world reactions are the richest input you have. Let what resonates sharpen your angle, without chasing every algorithm trend away from your core.",
      },
      {
        pillar: "brand_reflects_life",
        title: "Let your brand evolve as you do",
        body: "As your work and convictions grow, your brand should grow with them. Revisit the Blueprint and narrative periodically so the public you keeps matching the real you.",
      },
    ],
  },
];

export const LEARN_STAGE_ORDER: LearnStage[] = LEARN_CURRICULUM.map((m) => m.stage);

// Static fallback insights. The contextual cards prefer live, AI-generated
// insights from the strategist, but when none are available for a context
// (e.g. before the scheduler has run) these guarantee an encouraging,
// pillar-threaded note still appears. Keyed loosely by context.
export type FallbackInsight = {
  pillar: LearnPillarId;
  title: string;
  body: string;
};

export const FALLBACK_INSIGHTS: Record<string, FallbackInsight> = {
  dashboard: {
    pillar: "patience",
    title: "You are building something that compounds",
    body: "A world-class personal brand is built in years, not weeks. The steady work you do here adds up quietly, then all at once.",
  },
  blueprint: {
    pillar: "authentic_input",
    title: "Honesty here sets the ceiling",
    body: "The more real and specific your Blueprint, the stronger everything arc builds on top of it. The uncomfortable details are usually the valuable ones.",
  },
  audit: {
    pillar: "brand_reflects_life",
    title: "An honest mirror, not a verdict",
    body: "The audit shows how the world currently sees you. Where it differs from the real you, you have found exactly what to work on next.",
  },
  narrative: {
    pillar: "creative_thought",
    title: "Lead with the angle only you have",
    body: "Your edge is an original observation from your own life. Let arc help you draft it, but keep the point of view unmistakably yours.",
  },
  general: {
    pillar: "ai_augments",
    title: "arc is the instrument; you are the musician",
    body: "Let arc accelerate the research and drafting, and spend your energy on the judgement and meaning only you can bring.",
  },
};

export function fallbackInsightFor(context: string): FallbackInsight {
  return FALLBACK_INSIGHTS[context] ?? FALLBACK_INSIGHTS.general;
}
