// v2 schema — additive to v1. None of these tables or columns affect v1
// service behavior. v2 agents read these via accessors in `./accessors.ts`.
//
// See docs/v2/prds/profile-schema-v2.md for the design.

export * from "./profileLayers";
export * from "./voiceSamples";
export * from "./voiceFeatures";
export * from "./storyBank";
export * from "./referenceLibrary";
export * from "./antiExamples";
export * from "./ingestRuns";
export * from "./onboardingSessions";
export * from "./accessors";
