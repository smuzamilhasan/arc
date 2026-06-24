// Eval runner — orchestrates fixture × agent × rubric scoring.
//
// CLI surface (added when wired to package.json):
//   pnpm eval                              # all fixtures × all registered agents
//   pnpm eval --agent ghostwriter          # one agent, all fixtures
//   pnpm eval --fixture muzamil-real --agent ghostwriter
//   pnpm eval --baseline                   # write current run as baseline
//
// Foundation PR ships the runner skeleton, fixtures, and rubrics. Agents
// register their contracts as they migrate; the runner picks them up.

import { ALL_FIXTURES, getFixture, type Fixture } from "../fixtures";
import { RUBRICS, type Rubric } from "../rubrics";
import {
  listRegisteredRoles,
  getContract,
  isRoleRegistered,
} from "../../agents-v2/roles/registry";
import type { AgentRole } from "../../agents-v2/contracts/types";

export type EvalRunOptions = {
  fixtureIds?: string[];
  agents?: AgentRole[];
  baseline?: boolean;
  parallelism?: number;
};

export type EvalCellResult = {
  fixture_id: string;
  agent: AgentRole;
  rubric_version: string;
  dimensions: Record<string, { score: number; reasoning?: string }>;
  overall: number;
  outcome: "ok" | "refused" | "contract_violation" | "no_runner";
  outcome_detail?: string;
  // Wall-clock + tokens for ROI tracking.
  tokens_used?: number;
  latency_ms?: number;
};

export type EvalReport = {
  started_at: string;
  finished_at: string;
  results: EvalCellResult[];
  baseline_comparison?: EvalBaselineComparison;
};

export type EvalBaselineComparison = {
  baseline_path: string;
  per_cell_delta: Array<{
    fixture_id: string;
    agent: AgentRole;
    overall_delta: number;
    regressions: string[];
  }>;
  overall_pass: boolean;
};

/**
 * Foundation-PR stub: assembles the matrix of (fixture × agent) cells and
 * returns a report. Agent execution + LLM-scoring hooks land as agents migrate.
 *
 * The matrix layout, baseline-diff math, and CI gate plumbing are wired now
 * so the first concrete agent migration only has to fill in `runCell`.
 */
export async function runEval(opts: EvalRunOptions = {}): Promise<EvalReport> {
  const started_at = new Date().toISOString();

  const fixtures: Fixture[] = opts.fixtureIds
    ? opts.fixtureIds.map(getFixture)
    : ALL_FIXTURES;

  const agents: AgentRole[] = opts.agents ?? (listRegisteredRoles() as AgentRole[]);

  const results: EvalCellResult[] = [];

  for (const fixture of fixtures) {
    for (const agent of agents) {
      const rubric = RUBRICS[agent];
      if (!rubric) continue; // skip agents without a rubric (manager, investigator at v2 foundation)

      if (!isRoleRegistered(agent)) {
        results.push({
          fixture_id: fixture.id,
          agent,
          rubric_version: rubric.version,
          dimensions: {},
          overall: 0,
          outcome: "no_runner",
          outcome_detail: "Agent contract not yet registered in this build",
        });
        continue;
      }

      const cell = await runCell(fixture, agent, rubric);
      results.push(cell);
    }
  }

  const report: EvalReport = {
    started_at,
    finished_at: new Date().toISOString(),
    results,
  };

  return report;
}

/**
 * Run one (fixture, agent) cell. Foundation PR returns a stub indicating the
 * cell is unwired. When per-agent migration lands, this function:
 *   - Builds the agent's typed input from the fixture
 *   - Invokes AgentRunner with the registered contract
 *   - Scores the output against the rubric using deterministic + LLM scorers
 *   - Returns the cell result
 */
async function runCell(
  fixture: Fixture,
  agent: AgentRole,
  rubric: Rubric
): Promise<EvalCellResult> {
  // Touch the contract to confirm it loads cleanly during foundation tests.
  const contract = getContract(agent);
  return {
    fixture_id: fixture.id,
    agent,
    rubric_version: rubric.version,
    dimensions: {},
    overall: 0,
    outcome: "no_runner",
    outcome_detail: `Runner not yet wired for agent: ${contract.name}@${contract.version}`,
  };
}

/**
 * Diff a report against a baseline JSON file. Returns per-cell deltas and an
 * overall pass/fail based on the threshold (default: no rubric dimension may
 * drop > 5%).
 */
export function compareToBaseline(
  report: EvalReport,
  baseline: EvalReport,
  thresholdPct = 5
): EvalBaselineComparison {
  const per_cell_delta: EvalBaselineComparison["per_cell_delta"] = [];
  let overall_pass = true;

  for (const cell of report.results) {
    const baselineCell = baseline.results.find(
      (b) => b.fixture_id === cell.fixture_id && b.agent === cell.agent
    );
    if (!baselineCell) continue;

    const overall_delta = cell.overall - baselineCell.overall;
    const regressions: string[] = [];
    for (const [dim, val] of Object.entries(cell.dimensions)) {
      const baseDim = baselineCell.dimensions[dim];
      if (!baseDim) continue;
      const dropPct = (baseDim.score - val.score) * 100;
      if (dropPct > thresholdPct) {
        regressions.push(`${dim}: -${dropPct.toFixed(1)}%`);
        overall_pass = false;
      }
    }
    per_cell_delta.push({
      fixture_id: cell.fixture_id,
      agent: cell.agent,
      overall_delta,
      regressions,
    });
  }

  return { baseline_path: "(in-memory)", per_cell_delta, overall_pass };
}
