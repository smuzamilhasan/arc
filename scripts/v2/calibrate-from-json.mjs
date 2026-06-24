// Offline calibration — run the v2 VoiceExtractor pipeline against a raw
// Apify JSON export, with NO database and NO live Apify call.
//
// Purpose: see what extracted voice features actually look like on a real
// user's writing, before wiring full DB persistence + deploy.
//
// Usage:
//   node scripts/v2/calibrate-from-json.mjs \
//     --json /path/to/dataset_linkedin-profile-posts.json \
//     --client 1
//
// Required env (same OpenAI vars the v1 ghostwriter uses):
//   AI_INTEGRATIONS_OPENAI_API_KEY
//   AI_INTEGRATIONS_OPENAI_BASE_URL
//
// Build first:  cd artifacts/api-server && corepack pnpm run build
//
// Output: pretty-printed VoiceExtractorOutput showing what would be written
// to voice_v2, story_bank, reference_library, worldview.beliefs.

import fs from "node:fs";
import path from "node:path";

const DIST = "../../artifacts/api-server/dist";

const { linkedinPostsNormalizer } = await import(
  path.resolve(import.meta.dirname, `${DIST}/services/ingestion/normalizers/linkedin.js`)
);
const { runVoiceExtractor } = await import(
  path.resolve(import.meta.dirname, `${DIST}/agents-v2/roles/voiceExtractor/pipeline.js`)
);
const { openaiStructuredClient } = await import(
  path.resolve(import.meta.dirname, `${DIST}/agents-v2/llm/openaiAdapter.js`)
);

function parseArgs(argv) {
  const out = { json: null, client: 1 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = argv[++i];
    else if (a === "--client") out.client = Number(argv[++i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.json) {
    console.error(
      "Usage: node scripts/v2/calibrate-from-json.mjs --json <path-to-json> [--client <id>]"
    );
    process.exit(2);
  }

  console.log(`[calibrate] loading ${args.json}`);
  const raw = JSON.parse(fs.readFileSync(args.json, "utf8"));
  console.log(`[calibrate] ${raw.length} raw items`);

  // Normalize. (Same code path that production uses.)
  const samples = [];
  let id = 1;
  let dropped = 0;
  for (const item of raw) {
    const normalized = linkedinPostsNormalizer(item, {
      runId: "offline-calibration",
      source: "linkedin",
    });
    if (!normalized) {
      dropped++;
      continue;
    }
    samples.push({
      id: id++,
      platform: normalized.platform,
      content: normalized.content,
      published_at: normalized.metadata.published_at,
    });
  }
  console.log(
    `[calibrate] normalized: ${samples.length} samples, dropped ${dropped} (reposts + short)`
  );

  if (samples.length < 10) {
    console.error(
      "[calibrate] under 10 samples — extractor will refuse. nothing to calibrate."
    );
    process.exit(1);
  }

  // Run the extractor pipeline. 4 LLM passes — expect ~30-60s, ~$0.10 spend.
  console.log(`[calibrate] running VoiceExtractor (5 passes: stats + 4 LLM)...`);
  const t0 = Date.now();
  const result = await runVoiceExtractor(
    {
      client_id: args.client,
      samples,
      existing_voice: null,
      existing_negative_space: null,
      deterministic_features: {},
    },
    { llm: openaiStructuredClient }
  );
  const dt = Math.round((Date.now() - t0) / 100) / 10;
  console.log(`[calibrate] done in ${dt}s`);
  console.log();

  if (result.refuses) {
    console.log("=== REFUSED ===");
    console.log(result.refusal_reason);
    process.exit(0);
  }

  // Pretty-print the patch summary so you can see what would land where.
  console.log("=== EXTRACTOR OUTPUT ===");
  console.log(`sample_count:        ${result.sample_count}`);
  console.log(`aggregate confidence: ${result.confidence.toFixed(2)}`);
  console.log();

  const opsByKind = {};
  for (const op of result.profile_patch.ops) {
    opsByKind[op.op] = (opsByKind[op.op] ?? 0) + 1;
  }
  console.log("ops by kind:", opsByKind);
  console.log();

  for (const op of result.profile_patch.ops) {
    if (op.op === "voice_patch") {
      console.log("--- VOICE PATCH ---");
      console.log("sentence_stats:", op.patch.sentence_stats);
      console.log(
        "lexicon.signature_words (top 15):",
        op.patch.lexicon?.signature_words?.slice(0, 15)
      );
      console.log("punctuation:", op.patch.punctuation);
      console.log("signature_moves:");
      for (const m of op.patch.signature_moves ?? []) {
        console.log(`  - "${m.pattern}" (freq ${m.frequency.toFixed(2)})`);
      }
      console.log("formality:", op.patch.formality);
      console.log("voice description:");
      console.log(`  ${op.patch.description}`);
      console.log("voice confidence:", op.patch.confidence);
      console.log();
    } else if (op.op === "worldview_patch") {
      console.log(`--- WORLDVIEW (${op.patch.beliefs?.length ?? 0} beliefs) ---`);
      for (const b of op.patch.beliefs ?? []) {
        console.log(`  • "${b.claim}"`);
        console.log(`      why: ${b.why_held}`);
        console.log(
          `      evidence samples: ${b.evidence_sample_ids?.join(", ")} (confidence ${b.confidence?.toFixed(2)})`
        );
      }
      console.log();
    }
  }

  const stories = result.profile_patch.ops.filter((o) => o.op === "story_append");
  console.log(`--- STORIES (${stories.length}) ---`);
  for (const s of stories.slice(0, 8)) {
    console.log(`  • ${s.summary}`);
    console.log(`      themes: ${s.themes.join(", ") || "—"}`);
    console.log(`      cites samples: ${s.source_sample_ids.join(", ")}`);
  }
  console.log();

  const refs = result.profile_patch.ops.filter((o) => o.op === "reference_append");
  console.log(`--- REFERENCES (${refs.length}) ---`);
  for (const r of refs.slice(0, 12)) {
    console.log(`  • [${r.kind}] ${r.label}`);
    console.log(`      cites samples: ${r.source_sample_ids.join(", ")}`);
  }
  console.log();

  // Save full JSON to disk for follow-up iteration.
  const outPath = path.resolve(`./calibration-output-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`[calibrate] full output saved to: ${outPath}`);
  console.log(`[calibrate] paste any section to me and we iterate.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
