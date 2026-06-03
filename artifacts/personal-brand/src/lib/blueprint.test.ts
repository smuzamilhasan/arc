import { describe, it, expect } from "vitest";
import type { ClientProfile } from "@workspace/api-client-react";
import {
  BLUEPRINT_STAGES,
  getPillar,
  pillarHasData,
  pillarCoreComplete,
  stageComplete,
  unlockedPillarIds,
  isPillarUnlocked,
  unlockHint,
  nextPillar,
  nextPillarAfter,
  type Pillar,
} from "./blueprint";

// Core (counted) fields per pillar, kept in sync with PILLARS.countFields.
const CORE_FIELDS: Record<string, string[]> = {
  basics: ["currentRole", "company", "industry", "headline", "bio"],
  story: ["earlyLife", "professionalJourney"],
  credibility: ["signatureAchievements", "quantifiableResults", "audienceImpact"],
  identity: ["positioning", "primaryAudience", "brandValues", "personalityTone"],
  worldview: ["thesis", "coreBeliefs", "signatureFrameworks"],
  conviction: ["beliefs", "frustrations", "desiredChange", "passions"],
};

// Build a profile shaped enough for the gating helpers from a flat field map.
function profile(fields: Record<string, string>): ClientProfile {
  return fields as unknown as ClientProfile;
}

// Mark every core field of the given pillars as filled.
function withCoreComplete(...pillarIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of pillarIds) {
    for (const field of CORE_FIELDS[id]) out[field] = "filled";
  }
  return out;
}

const pillar = (id: string): Pillar => {
  const p = getPillar(id);
  if (!p) throw new Error(`unknown pillar ${id}`);
  return p;
};

describe("pillarHasData", () => {
  it("is false for an undefined client", () => {
    expect(pillarHasData(pillar("identity"), undefined)).toBe(false);
  });

  it("is false when no field is filled", () => {
    expect(pillarHasData(pillar("identity"), profile({}))).toBe(false);
  });

  it("is true when any core field is filled", () => {
    expect(
      pillarHasData(pillar("identity"), profile({ positioning: "x" })),
    ).toBe(true);
  });

  it("is true when only a supporting (non-counted) field is filled", () => {
    // secondaryAudience is a supporting field on identity, not in countFields.
    expect(
      pillarHasData(pillar("identity"), profile({ secondaryAudience: "x" })),
    ).toBe(true);
  });

  it("treats whitespace-only values as empty", () => {
    expect(
      pillarHasData(pillar("identity"), profile({ positioning: "   " })),
    ).toBe(false);
  });
});

describe("pillarCoreComplete", () => {
  it("is false for an undefined client", () => {
    expect(pillarCoreComplete(pillar("story"), undefined)).toBe(false);
  });

  it("is false when some core fields are missing", () => {
    expect(
      pillarCoreComplete(pillar("story"), profile({ earlyLife: "x" })),
    ).toBe(false);
  });

  it("is true when every core field is filled", () => {
    expect(
      pillarCoreComplete(pillar("story"), profile(withCoreComplete("story"))),
    ).toBe(true);
  });

  it("ignores supporting fields for completeness", () => {
    // story core = earlyLife + professionalJourney; schooling/university are supporting.
    const data = profile({ earlyLife: "x", professionalJourney: "y" });
    expect(pillarCoreComplete(pillar("story"), data)).toBe(true);
  });

  it("treats whitespace-only core values as incomplete", () => {
    const data = profile({ earlyLife: "x", professionalJourney: "   " });
    expect(pillarCoreComplete(pillar("story"), data)).toBe(false);
  });
});

describe("stageComplete", () => {
  it("is false for an empty profile", () => {
    expect(stageComplete(["basics"], profile({}))).toBe(false);
  });

  it("is true for a single-pillar stage whose core is complete", () => {
    expect(
      stageComplete(["basics"], profile(withCoreComplete("basics"))),
    ).toBe(true);
  });

  it("requires every pillar in a multi-pillar stage", () => {
    const lastStage = ["identity", "worldview", "conviction"];
    const partial = profile(withCoreComplete("identity", "worldview"));
    expect(stageComplete(lastStage, partial)).toBe(false);

    const full = profile(
      withCoreComplete("identity", "worldview", "conviction"),
    );
    expect(stageComplete(lastStage, full)).toBe(true);
  });

  it("treats unknown pillar ids as complete (no-op)", () => {
    expect(stageComplete(["does-not-exist"], profile({}))).toBe(true);
  });
});

describe("unlockedPillarIds", () => {
  it("unlocks only Basics for an empty profile", () => {
    const unlocked = unlockedPillarIds(profile({}));
    expect([...unlocked]).toEqual(["basics"]);
  });

  it("unlocks only Basics for an undefined client", () => {
    expect([...unlockedPillarIds(undefined)]).toEqual(["basics"]);
  });

  it("unlocks Story once Basics core is complete, but not later stages", () => {
    const unlocked = unlockedPillarIds(profile(withCoreComplete("basics")));
    expect(unlocked.has("basics")).toBe(true);
    expect(unlocked.has("story")).toBe(true);
    expect(unlocked.has("credibility")).toBe(false);
    expect(unlocked.has("identity")).toBe(false);
  });

  it("unlocks Credibility once Basics and Story are complete", () => {
    const unlocked = unlockedPillarIds(
      profile(withCoreComplete("basics", "story")),
    );
    expect(unlocked.has("credibility")).toBe(true);
    expect(unlocked.has("identity")).toBe(false);
    expect(unlocked.has("worldview")).toBe(false);
    expect(unlocked.has("conviction")).toBe(false);
  });

  it("unlocks the final stage group once Basics, Story, Credibility are complete", () => {
    const unlocked = unlockedPillarIds(
      profile(withCoreComplete("basics", "story", "credibility")),
    );
    expect(unlocked.has("identity")).toBe(true);
    expect(unlocked.has("worldview")).toBe(true);
    expect(unlocked.has("conviction")).toBe(true);
  });

  it("unlocks a later pillar out of order when it already has saved data", () => {
    // Empty gates: only Basics is reachable. But conviction has saved data,
    // so it stays unlocked even though its stage gate hasn't opened.
    const unlocked = unlockedPillarIds(profile({ beliefs: "a contrarian take" }));
    expect(unlocked.has("basics")).toBe(true);
    expect(unlocked.has("conviction")).toBe(true);
    expect(unlocked.has("story")).toBe(false);
    expect(unlocked.has("credibility")).toBe(false);
  });

  it("keeps a pillar unlocked via supporting-field-only data", () => {
    // credibility's awards is a supporting field; saved data should still unlock it.
    const unlocked = unlockedPillarIds(profile({ awards: "TEDx speaker" }));
    expect(unlocked.has("credibility")).toBe(true);
  });
});

describe("isPillarUnlocked", () => {
  it("mirrors unlockedPillarIds for an empty profile", () => {
    expect(isPillarUnlocked("basics", profile({}))).toBe(true);
    expect(isPillarUnlocked("story", profile({}))).toBe(false);
  });

  it("is true for a locked pillar that already has data", () => {
    expect(
      isPillarUnlocked("conviction", profile({ passions: "ideas" })),
    ).toBe(true);
  });
});

describe("unlockHint", () => {
  it("is empty for the first (always-open) stage", () => {
    expect(unlockHint("basics")).toBe("");
  });

  it("is empty for an unknown pillar id", () => {
    expect(unlockHint("nope")).toBe("");
  });

  it("names the previous single-pillar stage", () => {
    expect(unlockHint("story")).toBe(
      `Complete ${pillar("basics").title} to unlock`,
    );
    expect(unlockHint("credibility")).toBe(
      `Complete ${pillar("story").title} to unlock`,
    );
  });

  it("names the previous stage for a final-group pillar", () => {
    // The stage before identity/worldview/conviction is the single Credibility pillar.
    expect(unlockHint("identity")).toBe(
      `Complete ${pillar("credibility").title} to unlock`,
    );
  });
});

describe("nextPillar", () => {
  it("points at Basics for an empty profile", () => {
    expect(nextPillar(profile({}))?.id).toBe("basics");
  });

  it("advances to the next unlocked incomplete pillar", () => {
    expect(nextPillar(profile(withCoreComplete("basics")))?.id).toBe("story");
  });

  it("skips locked pillars even when earlier ones are complete", () => {
    // Basics + Credibility complete, but Story (the gate) is not: next is Story,
    // not the further-along Credibility.
    const data = profile(withCoreComplete("basics", "credibility"));
    expect(nextPillar(data)?.id).toBe("story");
  });

  it("returns null when every reachable pillar is complete", () => {
    const data = profile(
      withCoreComplete(
        "basics",
        "story",
        "credibility",
        "identity",
        "worldview",
        "conviction",
      ),
    );
    expect(nextPillar(data)).toBeNull();
  });
});

describe("nextPillarAfter", () => {
  it("skips the just-saved pillar and suggests the next reachable one", () => {
    // Basics complete unlocks Story; after saving Basics, nudge toward Story.
    const data = profile(withCoreComplete("basics"));
    expect(nextPillarAfter(data, "basics")?.id).toBe("story");
  });

  it("returns a sibling in the same unlocked stage", () => {
    // Final stage all unlocked; identity still incomplete, so after worldview -> identity.
    const data = profile(withCoreComplete("basics", "story", "credibility"));
    expect(nextPillarAfter(data, "worldview")?.id).toBe("identity");
  });

  it("returns null when no other reachable pillar remains incomplete", () => {
    const data = profile(
      withCoreComplete(
        "basics",
        "story",
        "credibility",
        "identity",
        "worldview",
        "conviction",
      ),
    );
    expect(nextPillarAfter(data, "conviction")).toBeNull();
  });
});

describe("CORE_FIELDS fixture stays in sync with PILLARS", () => {
  it("matches each pillar's countFields", () => {
    for (const stage of BLUEPRINT_STAGES) {
      for (const id of stage) {
        expect(CORE_FIELDS[id]).toEqual(pillar(id).countFields);
      }
    }
  });
});
