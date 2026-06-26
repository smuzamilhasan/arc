// Profile field registry — the single source of truth for the comprehensive
// personal-brand profile. Every field a brand needs is declared here, tagged
// with HOW it's sourced, WHICH touchpoint asks for it, its PRIORITY, the
// QUESTION that elicits it, and a detector for whether it's already filled.
//
// This drives progressive profiling: the completeness service reads it to know
// what's missing; the next-question engine reads it to know what to ask next,
// where, and when. Adding a new profile field = adding one entry here.
//
// See docs/v2/prds/comprehensive-profile.md.

export type FieldSource = "extract" | "onboard" | "research";
export type FieldTouchpoint = "onboarding" | "micro" | "inline" | "research";

export type ProfileField = {
  /** Stable unique id. */
  key: string;
  /** Human label. */
  label: string;
  /** Section grouping for display. */
  section: string;
  /** The JSONB layer this field lives in (accessor key) — null for v1 string fields. */
  layer: string;
  /** Where the value comes from. */
  source: FieldSource;
  /** Which touchpoint collects it (for onboard/inline/micro). */
  touchpoint: FieldTouchpoint;
  /** 1 (highest leverage) .. 5. */
  priority: number;
  /** Part of the "core complete" profile. */
  core: boolean;
  /** The question to ask the user (for onboard/micro/inline fields). */
  question?: string;
  /** Why we ask — shown to build trust / context. */
  why?: string;
  /**
   * Detect whether this field is already filled, given the loaded profile
   * object (a record of layer-key → parsed layer value, plus v1 fields under
   * `v1`).
   */
  isFilled: (p: ProfileSnapshot) => boolean;
};

/** What the completeness checks read. Loaded by the completeness service.
 *  Layers carry an index signature so detectors can read any field without
 *  re-typing the full schema here. */
type Layer = Record<string, unknown> | null | undefined;
export type ProfileSnapshot = {
  identity_v2?: Layer;
  positioning_v2?: Layer;
  icp_v2?: Layer;
  voice_v2?: Layer;
  worldview_v2?: Layer;
  negative_space_v2?: Layer;
  goals_v2?: Layer;
  offers_v2?: Layer;
  operating_prefs_v2?: Layer;
  content_strategy_v2?: Layer;
  channels_v2?: Layer;
  market_context_v2?: Layer;
  reputation_v2?: Layer;
  counts?: { voice_samples?: number; stories?: number; references?: number };
};

// Helpers that read a layer field generically.
const arr = (l: Layer, k: string) => (Array.isArray((l ?? {})[k]) ? ((l ?? {})[k] as unknown[]) : []);
const str = (l: Layer, k: string) => {
  const v = (l ?? {})[k];
  return typeof v === "string" ? v : "";
};
const num = (l: Layer, k: string) => {
  const v = (l ?? {})[k];
  return typeof v === "number" ? v : undefined;
};
// Does any archetype have a non-empty value for sub-key?
const anyArchetype = (l: Layer, k: string) =>
  arr(l, "archetypes").some((a) => Array.isArray((a as Record<string, unknown>)?.[k]) && ((a as Record<string, unknown>)[k] as unknown[]).length > 0);

const nonEmptyArr = (a?: unknown[]) => Array.isArray(a) && a.length > 0;
const nonEmptyStr = (s?: string | null) => typeof s === "string" && s.trim().length > 0;

// Compact field factory.
function f(
  key: string, label: string, section: string, layer: string,
  source: FieldSource, touchpoint: FieldTouchpoint, priority: number, core: boolean,
  question: string | undefined, why: string | undefined,
  isFilled: (p: ProfileSnapshot) => boolean
): ProfileField {
  return { key, label, section, layer, source, touchpoint, priority, core, question, why, isFilled };
}


export const PROFILE_FIELDS: ProfileField[] = [
  // ===== Identity =====
  f("identity.role", "Role & company", "Identity", "identity_v2", "onboard", "onboarding", 2, true,
    "What's your current role, company, and industry?", "The basic context every brand decision sits on.",
    (p) => !!str(p.identity_v2, "role") || !!str(p.identity_v2, "title") || !!str(p.identity_v2, "company")),
  f("identity.seniority", "Seniority", "Identity", "identity_v2", "onboard", "micro", 4, false,
    "How senior are you / how long in your field?", undefined,
    (p) => !!str(p.identity_v2, "seniority")),
  f("identity.geography", "Geography", "Identity", "identity_v2", "onboard", "onboarding", 2, true,
    "Where are you based, and where does your audience mostly live?", "Shapes timing, references, and which opportunities are relevant.",
    (p) => !!str(p.identity_v2, "geography_base") || arr(p.identity_v2, "geography_market").length > 0),
  f("identity.languages", "Languages & script", "Identity", "identity_v2", "onboard", "micro", 3, false,
    "Which language(s) and script do you create in? (e.g. English, Roman Urdu)", "So drafts come out in the right language and script.",
    (p) => arr(p.identity_v2, "languages").length > 0 || !!str(p.identity_v2, "content_script")),
  f("identity.career_arc", "Career arc", "Identity", "identity_v2", "onboard", "micro", 4, false,
    "Give me the short version of your career journey — the arc that explains how you got here.", undefined,
    (p) => !!str(p.identity_v2, "career_arc")),
  f("identity.education", "Education", "Identity", "identity_v2", "onboard", "micro", 5, false,
    "Any education or training worth noting?", undefined,
    (p) => arr(p.identity_v2, "education").length > 0),
  f("identity.credentials", "Credentials", "Identity", "identity_v2", "onboard", "micro", 4, false,
    "What credentials, awards, or proof points should the brand lean on?", undefined,
    (p) => arr(p.identity_v2, "credentials").length > 0),

  // ===== Positioning =====
  f("positioning.claim", "Positioning claim", "Positioning", "positioning_v2", "onboard", "onboarding", 1, true,
    "In one sentence — what do you want to be known for that others in your space can't claim?", undefined,
    (p) => !!str(p.positioning_v2, "claim")),
  f("positioning.category", "Category", "Positioning", "positioning_v2", "onboard", "micro", 3, false,
    "What space or category do you play in?", undefined,
    (p) => !!str(p.positioning_v2, "category")),
  f("positioning.mechanism", "Unique mechanism", "Positioning", "positioning_v2", "onboard", "micro", 3, false,
    "Do you have a signature framework, method, or way of doing things that's yours?", undefined,
    (p) => !!str(p.positioning_v2, "unique_mechanism")),
  f("positioning.wedge", "The wedge", "Positioning", "positioning_v2", "onboard", "micro", 3, false,
    "What's the single sharpest entry point — the thing you lead with to break in?", undefined,
    (p) => !!str(p.positioning_v2, "wedge")),
  f("positioning.rejections", "What you reject", "Positioning", "positioning_v2", "onboard", "onboarding", 2, true,
    "What nearby positions or labels do you explicitly NOT want?", undefined,
    (p) => arr(p.positioning_v2, "adjacent_claims_rejected").length > 0),
  f("positioning.proof", "Proof points", "Positioning", "positioning_v2", "onboard", "micro", 3, false,
    "What achievements, results, or press best prove your claim?", undefined,
    (p) => arr(p.positioning_v2, "proof_points").length > 0),

  // ===== Audience / ICP =====
  f("icp.archetypes", "Ideal audience", "Audience", "icp_v2", "onboard", "onboarding", 1, true,
    "Who is this brand FOR — describe your ideal audience member (role, what they want, where they're stuck).", undefined,
    (p) => arr(p.icp_v2, "archetypes").length > 0),
  f("icp.pains", "Audience pains & desires", "Audience", "icp_v2", "onboard", "micro", 2, false,
    "What does your ideal audience struggle with, and what do they most want?", undefined,
    (p) => anyArchetype(p.icp_v2, "pains") || anyArchetype(p.icp_v2, "desires")),
  f("icp.objections", "Objections & triggers", "Audience", "icp_v2", "onboard", "micro", 3, false,
    "What makes them hesitate, and what moment pushes them to act?", undefined,
    (p) => anyArchetype(p.icp_v2, "objections") || anyArchetype(p.icp_v2, "buying_triggers")),
  f("icp.watering_holes", "Where they hang out", "Audience", "icp_v2", "research", "research", 3, false,
    undefined, undefined,
    (p) => anyArchetype(p.icp_v2, "watering_holes")),
  f("icp.secondary", "Secondary audiences", "Audience", "icp_v2", "onboard", "micro", 4, false,
    "Any secondary audiences you also want to reach?", undefined,
    (p) => arr(p.icp_v2, "secondary_audiences").length > 0),
  f("icp.tam", "Audience size", "Audience", "icp_v2", "research", "research", 4, false,
    undefined, undefined,
    (p) => !!str(p.icp_v2, "estimated_tam")),
  f("icp.disqualifications", "Who it's not for", "Audience", "icp_v2", "onboard", "micro", 3, false,
    "Who is this NOT for — who do you not want to attract?", undefined,
    (p) => arr(p.icp_v2, "disqualifications").length > 0),

  // ===== Voice =====
  f("voice.extracted", "Voice (extracted)", "Voice", "voice_v2", "extract", "research", 1, true,
    undefined, "Calibrated from your real content.",
    (p) => (num(p.voice_v2, "sample_count") ?? 0) >= 10 && (num(p.voice_v2, "confidence") ?? 0) > 0),
  f("voice.tone", "Tone & register", "Voice", "voice_v2", "onboard", "micro", 4, false,
    "How would you describe your tone — and any humor or emotional register that's distinctly you?", undefined,
    (p) => arr(p.voice_v2, "tone_descriptors").length > 0 || !!str(p.voice_v2, "humor_style") || !!str(p.voice_v2, "emotional_register")),

  // ===== Worldview =====
  f("worldview.beliefs", "Worldview", "Worldview", "worldview_v2", "extract", "onboarding", 2, true,
    "What are the non-negotiable beliefs that show up across everything you create?", undefined,
    (p) => arr(p.worldview_v2, "beliefs").length > 0),
  f("worldview.thesis", "Thesis", "Worldview", "worldview_v2", "onboard", "micro", 2, false,
    "What's the big idea everything you say ladders up to?", undefined,
    (p) => !!str(p.worldview_v2, "thesis")),
  f("worldview.contrarian", "Contrarian takes", "Worldview", "worldview_v2", "onboard", "micro", 3, false,
    "What do you believe that most people in your space don't?", undefined,
    (p) => arr(p.worldview_v2, "contrarian_takes").length > 0),
  f("worldview.values", "Values & mission", "Worldview", "worldview_v2", "onboard", "micro", 3, false,
    "What values guide you, and what change do you ultimately want to create?", undefined,
    (p) => arr(p.worldview_v2, "values").length > 0 || !!str(p.worldview_v2, "mission")),

  // ===== Boundaries =====
  f("negative_space.refused", "Boundaries", "Boundaries", "negative_space_v2", "onboard", "onboarding", 2, true,
    "What words, topics, or takes would you NEVER use? Any no-go zones (political, personal)?", undefined,
    (p) => arr(p.negative_space_v2, "refused_words").length > 0 || arr(p.negative_space_v2, "refused_topics").length > 0 || arr(p.negative_space_v2, "refused_takes").length > 0),

  // ===== Goals =====
  f("goals.brand", "Brand goal", "Goals", "goals_v2", "onboard", "onboarding", 1, true,
    "What do you want this personal brand to DO for you in the next 6-12 months?", "Without a goal, the engine can write — but it can't aim.",
    (p) => arr(p.goals_v2, "brand_goals").length > 0),
  f("goals.business", "Business goal", "Goals", "goals_v2", "onboard", "onboarding", 1, true,
    "What business outcome should it drive — inbound clients, hiring, fundraising, sales?", undefined,
    (p) => arr(p.goals_v2, "business_goals").length > 0),
  f("goals.metrics", "Success metrics", "Goals", "goals_v2", "onboard", "micro", 3, false,
    "How will you know it's working? Which signals actually matter to you?", undefined,
    (p) => arr(p.goals_v2, "success_metrics").length > 0),
  f("goals.horizon", "Time horizon", "Goals", "goals_v2", "onboard", "micro", 4, false,
    "What's your time horizon — and where are you now vs where you want to be?", undefined,
    (p) => !!str(p.goals_v2, "time_horizon") || !!str(p.goals_v2, "desired_state")),

  // ===== Offers =====
  f("offers.offerings", "What you offer", "Offers", "offers_v2", "onboard", "onboarding", 2, true,
    "What do you sell or offer? (products, services, advisory, a community...)", "So content can build toward what you want people to do.",
    (p) => arr(p.offers_v2, "offerings").length > 0),
  f("offers.promoting_now", "Current push", "Offers", "offers_v2", "onboard", "micro", 3, false,
    "Anything specific you're promoting or launching right now?", undefined,
    (p) => !!str(p.offers_v2, "promoting_now")),
  f("offers.ctas", "Preferred CTAs", "Offers", "offers_v2", "onboard", "micro", 4, false,
    "What action do you usually want readers to take? (book a call, subscribe, DM you...)", undefined,
    (p) => arr(p.offers_v2, "preferred_ctas").length > 0),

  // ===== How you work =====
  f("operating.approval", "Approval style", "How you work", "operating_prefs_v2", "onboard", "onboarding", 2, true,
    "How hands-on do you want to be? Review every post, approve only the ambitious ones, or let it run?", "Sets how much the assistant can do on its own.",
    (p) => !!str(p.operating_prefs_v2, "approval_style")),
  f("operating.risk", "Risk tolerance", "How you work", "operating_prefs_v2", "onboard", "micro", 3, false,
    "How edgy are you comfortable being — play it safe, or happy to take contrarian stances?", undefined,
    (p) => typeof num(p.operating_prefs_v2, "risk_tolerance") === "number"),
  f("operating.time", "Time available", "How you work", "operating_prefs_v2", "onboard", "micro", 4, false,
    "Roughly how much time per week can you give to content?", undefined,
    (p) => !!str(p.operating_prefs_v2, "content_time_per_week")),

  // ===== Content strategy =====
  f("content.pillars", "Content pillars", "Content strategy", "content_strategy_v2", "onboard", "micro", 2, true,
    "What 3-5 themes do you want to be known for posting about?", undefined,
    (p) => arr(p.content_strategy_v2, "pillars").length > 0),
  f("content.formats", "Formats", "Content strategy", "content_strategy_v2", "onboard", "micro", 3, false,
    "What formats do you like — long-form posts, threads, video, carousels?", undefined,
    (p) => arr(p.content_strategy_v2, "formats").length > 0),
  f("content.mix", "Content mix", "Content strategy", "content_strategy_v2", "onboard", "micro", 4, false,
    "Roughly what mix do you want — educational vs personal vs promotional?", undefined,
    (p) => !!(p.content_strategy_v2 ?? {})["content_mix"]),
  f("content.series", "Recurring series", "Content strategy", "content_strategy_v2", "extract", "micro", 4, false,
    "Any recurring series or franchises you run (or want to)?", undefined,
    (p) => arr(p.content_strategy_v2, "recurring_series").length > 0),
  f("content.hooks", "Hooks that land", "Content strategy", "content_strategy_v2", "extract", "research", 4, false,
    undefined, undefined,
    (p) => arr(p.content_strategy_v2, "hooks").length > 0),

  // ===== Channels =====
  f("channels.list", "Channels", "Channels", "channels_v2", "onboard", "micro", 2, true,
    "Which platforms do you publish on, and which is your primary one?", undefined,
    (p) => arr(p.channels_v2, "channels").length > 0),

  // ===== Market (research) =====
  f("market.competitors", "Competitors / peers", "Market", "market_context_v2", "research", "research", 3, false,
    undefined, undefined, (p) => arr(p.market_context_v2, "competitors").length > 0),
  f("market.trends", "Industry trends", "Market", "market_context_v2", "research", "research", 4, false,
    undefined, undefined, (p) => arr(p.market_context_v2, "trends").length > 0),
  f("market.white_space", "White space", "Market", "market_context_v2", "research", "research", 4, false,
    undefined, undefined, (p) => arr(p.market_context_v2, "white_space").length > 0),

  // ===== Reputation =====
  f("reputation.desired", "Desired perception", "Reputation", "reputation_v2", "onboard", "micro", 3, false,
    "How do you WANT to be seen in your space a year from now?", undefined,
    (p) => !!str(p.reputation_v2, "desired_perception")),
  f("reputation.current", "Current perception", "Reputation", "reputation_v2", "research", "research", 4, false,
    undefined, undefined, (p) => !!str(p.reputation_v2, "current_perception")),
  f("reputation.following", "Audience size", "Reputation", "reputation_v2", "research", "research", 4, false,
    undefined, undefined, (p) => arr(p.reputation_v2, "followings").length > 0),
];

export function fieldByKey(key: string): ProfileField | undefined {
  return PROFILE_FIELDS.find((f) => f.key === key);
}
