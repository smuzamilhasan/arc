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

/** What the completeness checks read. Loaded by the completeness service. */
export type ProfileSnapshot = {
  identity_v2?: { geography_base?: string | null; geography_market?: string[]; languages?: string[]; content_script?: string | null; credentials?: string[]; career_arc?: string | null } | null;
  positioning_v2?: { claim?: string; defensibility?: string; adjacent_claims_rejected?: string[]; proof_points?: unknown[] } | null;
  icp_v2?: { archetypes?: unknown[]; disqualifications?: string[] } | null;
  voice_v2?: { confidence?: number; sample_count?: number; description?: string | null } | null;
  worldview_v2?: { beliefs?: unknown[] } | null;
  negative_space_v2?: { refused_topics?: string[]; refused_words?: string[]; refused_takes?: string[]; refused_formats?: string[] } | null;
  goals_v2?: { brand_goals?: string[]; business_goals?: string[]; success_metrics?: string[]; time_horizon?: string | null } | null;
  offers_v2?: { offerings?: unknown[]; lead_magnets?: string[]; promoting_now?: string | null } | null;
  operating_prefs_v2?: { approval_style?: string | null; risk_tolerance?: number | null; content_time_per_week?: string | null } | null;
  content_strategy_v2?: { pillars?: unknown[]; formats?: string[]; content_mix?: unknown } | null;
  channels_v2?: { channels?: unknown[] } | null;
  market_context_v2?: { competitors?: unknown[]; trends?: string[]; white_space?: string[] } | null;
  reputation_v2?: { current_perception?: string | null; desired_perception?: string | null; followings?: unknown[] } | null;
  counts?: { voice_samples?: number; stories?: number; references?: number };
};

const nonEmptyArr = (a?: unknown[]) => Array.isArray(a) && a.length > 0;
const nonEmptyStr = (s?: string | null) => typeof s === "string" && s.trim().length > 0;

export const PROFILE_FIELDS: ProfileField[] = [
  // ===== Identity =====
  {
    key: "identity.geography",
    label: "Geography",
    section: "Identity",
    layer: "identity_v2",
    source: "onboard",
    touchpoint: "onboarding",
    priority: 2,
    core: true,
    question: "Where are you based, and where does your audience or market mostly live?",
    why: "Geography shapes timing, references, and which opportunities are relevant.",
    isFilled: (p) => nonEmptyStr(p.identity_v2?.geography_base) || nonEmptyArr(p.identity_v2?.geography_market),
  },
  {
    key: "identity.languages",
    label: "Languages",
    section: "Identity",
    layer: "identity_v2",
    source: "onboard",
    touchpoint: "micro",
    priority: 3,
    core: false,
    question: "Which language(s) do you create content in? (e.g. English, Roman Urdu, both)",
    why: "So drafts come out in the right language and script.",
    isFilled: (p) => nonEmptyArr(p.identity_v2?.languages),
  },
  {
    key: "identity.credentials",
    label: "Credentials",
    section: "Identity",
    layer: "identity_v2",
    source: "onboard",
    touchpoint: "micro",
    priority: 4,
    core: false,
    question: "What credentials, awards, or proof points should the brand be able to lean on?",
    isFilled: (p) => nonEmptyArr(p.identity_v2?.credentials),
  },

  // ===== Positioning (mostly extract/onboard, already covered) =====
  {
    key: "positioning.claim",
    label: "Positioning claim",
    section: "Positioning",
    layer: "positioning_v2",
    source: "onboard",
    touchpoint: "onboarding",
    priority: 1,
    core: true,
    question: "In one sentence — what do you want to be known for that others in your space can't claim?",
    isFilled: (p) => nonEmptyStr(p.positioning_v2?.claim),
  },
  {
    key: "positioning.rejections",
    label: "What you reject",
    section: "Positioning",
    layer: "positioning_v2",
    source: "onboard",
    touchpoint: "onboarding",
    priority: 2,
    core: true,
    question: "What nearby positions or labels do you explicitly NOT want?",
    isFilled: (p) => nonEmptyArr(p.positioning_v2?.adjacent_claims_rejected),
  },

  // ===== ICP / Audience =====
  {
    key: "icp.archetypes",
    label: "Ideal audience",
    section: "Audience",
    layer: "icp_v2",
    source: "onboard",
    touchpoint: "onboarding",
    priority: 1,
    core: true,
    question: "Who is this brand FOR — describe your ideal audience member (role, what they want, where they're stuck).",
    isFilled: (p) => nonEmptyArr(p.icp_v2?.archetypes),
  },
  {
    key: "icp.disqualifications",
    label: "Who it's not for",
    section: "Audience",
    layer: "icp_v2",
    source: "onboard",
    touchpoint: "micro",
    priority: 3,
    core: false,
    question: "Who is this NOT for — who do you not want to attract?",
    isFilled: (p) => nonEmptyArr(p.icp_v2?.disqualifications),
  },

  // ===== Voice (extract) =====
  {
    key: "voice.extracted",
    label: "Voice",
    section: "Voice",
    layer: "voice_v2",
    source: "extract",
    touchpoint: "research",
    priority: 1,
    core: true,
    question: undefined,
    why: "Calibrated from your real content.",
    isFilled: (p) => (p.voice_v2?.sample_count ?? 0) >= 10 && (p.voice_v2?.confidence ?? 0) > 0,
  },

  // ===== Worldview =====
  {
    key: "worldview.beliefs",
    label: "Worldview",
    section: "Worldview",
    layer: "worldview_v2",
    source: "extract",
    touchpoint: "onboarding",
    priority: 2,
    core: true,
    question: "What are the non-negotiable beliefs that show up across everything you create?",
    isFilled: (p) => nonEmptyArr(p.worldview_v2?.beliefs),
  },

  // ===== Negative space =====
  {
    key: "negative_space.refused",
    label: "Boundaries",
    section: "Boundaries",
    layer: "negative_space_v2",
    source: "onboard",
    touchpoint: "onboarding",
    priority: 2,
    core: true,
    question: "What words, topics, or takes would you NEVER use? Any no-go zones (political, personal)?",
    isFilled: (p) =>
      nonEmptyArr(p.negative_space_v2?.refused_words) ||
      nonEmptyArr(p.negative_space_v2?.refused_topics) ||
      nonEmptyArr(p.negative_space_v2?.refused_takes),
  },

  // ===== Goals (THE intent gap) =====
  {
    key: "goals.brand",
    label: "Brand goal",
    section: "Goals",
    layer: "goals_v2",
    source: "onboard",
    touchpoint: "onboarding",
    priority: 1,
    core: true,
    question: "What do you want this personal brand to DO for you in the next 6–12 months?",
    why: "Without a goal, the engine can write — but it can't aim.",
    isFilled: (p) => nonEmptyArr(p.goals_v2?.brand_goals),
  },
  {
    key: "goals.business",
    label: "Business goal",
    section: "Goals",
    layer: "goals_v2",
    source: "onboard",
    touchpoint: "onboarding",
    priority: 1,
    core: true,
    question: "What business outcome should it drive — inbound clients, hiring, fundraising, sales, something else?",
    isFilled: (p) => nonEmptyArr(p.goals_v2?.business_goals),
  },
  {
    key: "goals.metrics",
    label: "Success metrics",
    section: "Goals",
    layer: "goals_v2",
    source: "onboard",
    touchpoint: "micro",
    priority: 3,
    core: false,
    question: "How will you know it's working? Which signals actually matter to you?",
    isFilled: (p) => nonEmptyArr(p.goals_v2?.success_metrics),
  },

  // ===== Offers / monetization =====
  {
    key: "offers.offerings",
    label: "What you offer",
    section: "Offers",
    layer: "offers_v2",
    source: "onboard",
    touchpoint: "onboarding",
    priority: 2,
    core: true,
    question: "What do you sell or offer? (products, services, advisory, a community…)",
    why: "So content can build toward what you actually want people to do.",
    isFilled: (p) => nonEmptyArr(p.offers_v2?.offerings),
  },
  {
    key: "offers.promoting_now",
    label: "Current push",
    section: "Offers",
    layer: "offers_v2",
    source: "onboard",
    touchpoint: "micro",
    priority: 3,
    core: false,
    question: "Is there anything specific you're promoting or launching right now?",
    isFilled: (p) => nonEmptyStr(p.offers_v2?.promoting_now),
  },

  // ===== Operating preferences =====
  {
    key: "operating.approval",
    label: "Approval style",
    section: "How you work",
    layer: "operating_prefs_v2",
    source: "onboard",
    touchpoint: "onboarding",
    priority: 2,
    core: true,
    question: "How hands-on do you want to be? Review every post, approve only the ambitious ones, or let it run?",
    why: "This sets how much the assistant can do on its own.",
    isFilled: (p) => nonEmptyStr(p.operating_prefs_v2?.approval_style),
  },
  {
    key: "operating.risk",
    label: "Risk tolerance",
    section: "How you work",
    layer: "operating_prefs_v2",
    source: "onboard",
    touchpoint: "micro",
    priority: 3,
    core: false,
    question: "How edgy are you comfortable being — play it safe, or happy to take contrarian stances?",
    isFilled: (p) => typeof p.operating_prefs_v2?.risk_tolerance === "number",
  },
  {
    key: "operating.time",
    label: "Time available",
    section: "How you work",
    layer: "operating_prefs_v2",
    source: "onboard",
    touchpoint: "micro",
    priority: 4,
    core: false,
    question: "Roughly how much time per week can you give to content?",
    isFilled: (p) => nonEmptyStr(p.operating_prefs_v2?.content_time_per_week),
  },

  // ===== Content strategy =====
  {
    key: "content.pillars",
    label: "Content pillars",
    section: "Content strategy",
    layer: "content_strategy_v2",
    source: "onboard",
    touchpoint: "micro",
    priority: 2,
    core: true,
    question: "What 3–5 themes do you want to be known for posting about?",
    isFilled: (p) => nonEmptyArr(p.content_strategy_v2?.pillars),
  },
  {
    key: "content.cadence",
    label: "Posting cadence",
    section: "Content strategy",
    layer: "operating_prefs_v2",
    source: "onboard",
    touchpoint: "micro",
    priority: 3,
    core: false,
    question: "How often do you realistically want to post?",
    isFilled: (p) => nonEmptyStr(p.operating_prefs_v2?.content_time_per_week),
  },

  // ===== Channels =====
  {
    key: "channels.list",
    label: "Channels",
    section: "Channels",
    layer: "channels_v2",
    source: "onboard",
    touchpoint: "micro",
    priority: 2,
    core: true,
    question: "Which platforms do you publish on, and which is your primary one?",
    isFilled: (p) => nonEmptyArr(p.channels_v2?.channels),
  },

  // ===== Market context (research) =====
  {
    key: "market.competitors",
    label: "Competitors / peers",
    section: "Market",
    layer: "market_context_v2",
    source: "research",
    touchpoint: "research",
    priority: 3,
    core: false,
    isFilled: (p) => nonEmptyArr(p.market_context_v2?.competitors),
  },
  {
    key: "market.white_space",
    label: "White space",
    section: "Market",
    layer: "market_context_v2",
    source: "research",
    touchpoint: "research",
    priority: 4,
    core: false,
    isFilled: (p) => nonEmptyArr(p.market_context_v2?.white_space),
  },

  // ===== Reputation (research + onboard) =====
  {
    key: "reputation.desired",
    label: "Desired perception",
    section: "Reputation",
    layer: "reputation_v2",
    source: "onboard",
    touchpoint: "micro",
    priority: 3,
    core: false,
    question: "How do you WANT to be seen in your space a year from now?",
    isFilled: (p) => nonEmptyStr(p.reputation_v2?.desired_perception),
  },
];

export function fieldByKey(key: string): ProfileField | undefined {
  return PROFILE_FIELDS.find((f) => f.key === key);
}
