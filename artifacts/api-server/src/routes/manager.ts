import { Router } from "express";
import {
  db,
  managerRunsTable,
  briefingDossiersTable,
  narrativeProfilesTable,
  platformStrategiesTable,
  contentStrategiesTable,
  assistantMessagesTable,
  plannerMessagesTable,
  postsTable,
  ideasTable,
  type ClientProfile,
  type ManagerTask,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { loadContext, loadHistory, enrichActions } from "./assistant";
import { enrichPlannerActions } from "./plannerChat";
import { agentsGateError } from "../services/foundation";
import {
  decomposeInstruction,
  type ProposedManagerTask,
} from "../services/manager";
import { generateAssistantReply } from "../services/assistant";
import { generatePlannerReply } from "../services/plannerChat";
import { generateDossier } from "../services/investigator";
import { draftContent } from "../services/ghostwriter";
import { isBlueprintComplete } from "../services/platforms";
import { aiGenerationRateLimit } from "../middlewares/aiRateLimit";

const MANAGER_INSTRUCTION_MAX_LENGTH = 2000;

const router = Router();

// Per-user concurrency guard. One instruction spins up several sequential agent
// calls, so we never let a user start a second orchestration while one is still
// running — a second guard (on top of the rate limit) against runaway cost.
const managerInFlight = new Set<string>();

function serializeRun(r: typeof managerRunsTable.$inferSelect) {
  const { clientId: _clientId, ...rest } = r;
  return {
    ...rest,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// A compact picture of what already exists for this client, so the Manager can
// route sensibly (e.g. not plan a calendar before a strategy exists).
async function buildSnapshot(client: ClientProfile): Promise<string> {
  const [dossier] = await db
    .select({ id: briefingDossiersTable.id })
    .from(briefingDossiersTable)
    .where(eq(briefingDossiersTable.clientId, client.id))
    .limit(1);
  const [narrative] = await db
    .select({ id: narrativeProfilesTable.id })
    .from(narrativeProfilesTable)
    .where(eq(narrativeProfilesTable.clientId, client.id))
    .limit(1);
  const [contentStrategy] = await db
    .select({ id: contentStrategiesTable.id })
    .from(contentStrategiesTable)
    .where(eq(contentStrategiesTable.clientId, client.id))
    .limit(1);
  const [platformStrategy] = await db
    .select({ id: platformStrategiesTable.id })
    .from(platformStrategiesTable)
    .where(eq(platformStrategiesTable.clientId, client.id))
    .limit(1);
  const posts = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(eq(postsTable.clientId, client.id));
  const ideas = await db
    .select({ id: ideasTable.id })
    .from(ideasTable)
    .where(eq(ideasTable.clientId, client.id));

  return [
    `Client: ${client.fullName}${client.headline ? ` — ${client.headline}` : ""}`,
    client.positioning
      ? `Positioning: ${client.positioning}`
      : "Positioning: (not set)",
    `Blueprint complete: ${isBlueprintComplete(client) ? "yes" : "no"}`,
    `Briefing dossier exists: ${dossier ? "yes" : "no"}`,
    `Narrative exists: ${narrative ? "yes" : "no"}`,
    `Content strategy exists: ${contentStrategy ? "yes" : "no"}`,
    `Platform strategy exists: ${platformStrategy ? "yes" : "no"}`,
    `Posts: ${posts.length}, Ideas: ${ideas.length}`,
  ].join("\n");
}

// Run a single delegated task by invoking the matching agent. Each agent reads
// the latest DB state, so running them in canonical order keeps outputs cohesive
// (e.g. the freshly persisted dossier is in the strategist's context). Outputs
// that mutate strategy/content stay UN-applied here — they surface as
// proposals/drafts the client confirms through the existing per-agent surfaces.
// Carried forward between agents in one run: a completed agent's task plus a
// compact, model-readable summary of what it just produced (for downstream
// agents). `handoff` is null when there is nothing useful to pass on.
type ExecuteResult = { task: ManagerTask; handoff: string | null };

async function executeTask(
  req: Request,
  client: ClientProfile,
  task: ProposedManagerTask,
  upstream: string,
): Promise<ExecuteResult> {
  const result: ManagerTask = {
    id: randomUUID(),
    agent: task.agent,
    title: task.title,
    brief: task.brief,
    status: "completed",
    resultSummary: "",
    error: null,
    output: null,
  };
  const upstreamText = upstream.trim() ? upstream.trim() : undefined;

  try {
    switch (task.agent) {
      case "investigator": {
        const data = await generateDossier(client, task.brief || undefined);
        // Upsert the single dossier per client, mirroring /dossier/generate.
        const values = {
          clientId: client.id,
          footprintSummary: data.footprintSummary,
          competitors: data.competitors,
          sources: data.sources,
          generatedAt: new Date(),
        };
        const [existing] = await db
          .select({ id: briefingDossiersTable.id })
          .from(briefingDossiersTable)
          .where(eq(briefingDossiersTable.clientId, client.id))
          .orderBy(desc(briefingDossiersTable.id))
          .limit(1);
        if (existing) {
          await db
            .update(briefingDossiersTable)
            .set(values)
            .where(eq(briefingDossiersTable.id, existing.id));
        } else {
          await db.insert(briefingDossiersTable).values(values);
        }
        result.output = {
          footprintSummary: data.footprintSummary,
          competitorCount: data.competitors.length,
        };
        result.resultSummary = `Researched your public footprint and ${data.competitors.length} competitor${data.competitors.length === 1 ? "" : "s"}. Saved to the Investigator.`;
        const competitorNames = data.competitors
          .map((c) => c.name)
          .filter(Boolean)
          .join(", ");
        const handoff = `Investigator just researched the client's public footprint and ${data.competitors.length} competitor${data.competitors.length === 1 ? "" : "s"}.\nFootprint summary: ${data.footprintSummary}${competitorNames ? `\nCompetitors to watch: ${competitorNames}` : ""}`;
        return { task: result, handoff };
      }

      case "strategist": {
        const ctx = await loadContext(client.id, client);
        const history = await loadHistory(client.id);
        const reply = await generateAssistantReply({
          context: ctx,
          history,
          userMessage: task.brief,
          upstream: upstreamText,
        });
        const actions = enrichActions(reply.actions, ctx);
        // Persist as an assistant message so the client confirms/rejects in the
        // existing Strategist chat. seen:false surfaces the unread indicator.
        const [message] = await db
          .insert(assistantMessagesTable)
          .values({
            clientId: client.id,
            role: "assistant",
            content: reply.reply,
            actions,
            seen: false,
          })
          .returning();
        result.output = {
          assistantMessageId: message.id,
          reply: reply.reply,
          proposals: actions.map((a) => ({
            title: a.title,
            rationale: a.rationale,
          })),
        };
        result.resultSummary =
          actions.length > 0
            ? `Proposed ${actions.length} strategic change${actions.length === 1 ? "" : "s"}. Review and confirm in the Strategist.`
            : "Reviewed your strategy; no changes proposed.";
        // Hand the actual proposed content (incl. payloads like new themes)
        // forward so downstream agents can build on the specifics, not just
        // the headline. These changes are NOT yet applied to the DB.
        const proposalDetail = actions
          .map((a) => {
            const payloadStr = a.payload ? JSON.stringify(a.payload) : "";
            return `- [${a.kind}] ${a.title}${a.rationale ? `: ${a.rationale}` : ""}${payloadStr ? `\n  proposed content: ${payloadStr}` : ""}`;
          })
          .join("\n");
        const handoff = `Strategist just proposed (NOT yet applied):\n${reply.reply}${proposalDetail ? `\nProposed changes:\n${proposalDetail}` : ""}`;
        return { task: result, handoff };
      }

      case "planner": {
        // The Manager does NOT touch the calendar itself. It RELAYS the planning
        // brief to the conversational Planner, which proposes calendar changes
        // the client confirms in the Planner — mirroring the Strategist hand-off.
        if (!isBlueprintComplete(client)) {
          result.status = "skipped";
          result.resultSummary =
            "Skipped: complete your Blueprint before planning a calendar.";
          return { task: result, handoff: null };
        }
        const [contentStrategy] = await db
          .select({ id: contentStrategiesTable.id })
          .from(contentStrategiesTable)
          .where(eq(contentStrategiesTable.clientId, client.id))
          .orderBy(desc(contentStrategiesTable.id))
          .limit(1);
        if (!contentStrategy) {
          result.status = "skipped";
          result.resultSummary =
            "Skipped: generate a content strategy before planning a calendar.";
          return { task: result, handoff: null };
        }
        const ctx = await loadContext(client.id, client);
        const reply = await generatePlannerReply({
          context: ctx,
          history: [],
          userMessage: task.brief,
          upstream: upstreamText,
        });
        const actions = enrichPlannerActions(reply.actions, ctx);
        // Persist as a Planner message (unseen) so the client reviews and
        // confirms the calendar changes in the Planner, with an unread dot.
        const [message] = await db
          .insert(plannerMessagesTable)
          .values({
            clientId: client.id,
            role: "assistant",
            content: reply.reply,
            actions,
            seen: false,
          })
          .returning();
        result.output = {
          plannerMessageId: message.id,
          reply: reply.reply,
          proposals: actions.map((a) => ({
            title: a.title,
            rationale: a.rationale,
          })),
        };
        result.resultSummary =
          actions.length > 0
            ? `Proposed ${actions.length} calendar change${actions.length === 1 ? "" : "s"}. Review and confirm in the Planner.`
            : "Reviewed your calendar; no changes proposed.";
        // Pass the actual proposed calendar (slots/ideas in the payloads)
        // forward so a downstream ghostwriter can write to those slots.
        const plannerDetail = actions
          .map((a) => {
            const payloadStr = a.payload ? JSON.stringify(a.payload) : "";
            return `- [${a.kind}] ${a.title}${a.rationale ? `: ${a.rationale}` : ""}${payloadStr ? `\n  proposed content: ${payloadStr}` : ""}`;
          })
          .join("\n");
        const handoff = `Planner just proposed (NOT yet applied):\n${reply.reply}${plannerDetail ? `\nProposed calendar:\n${plannerDetail}` : ""}`;
        return { task: result, handoff };
      }

      case "ghostwriter": {
        const [narrative] = await db
          .select()
          .from(narrativeProfilesTable)
          .where(eq(narrativeProfilesTable.clientId, client.id))
          .orderBy(desc(narrativeProfilesTable.id))
          .limit(1);
        const platform = "linkedin";
        // Fold any upstream proposals (fresh themes/strategy/calendar) into the
        // brief so drafts are grounded in this run's current intent, not just
        // the older stored state. draftContent already accepts a freeform brief.
        const brief = upstreamText
          ? `${task.brief}\n\n[Context from earlier agents in this same workflow — proposed but NOT yet applied. Ground the drafts in this current intent:]\n${upstreamText}`
          : task.brief;
        const data = await draftContent(client, narrative ?? null, {
          format: "post",
          platform,
          brief,
        });
        result.output = { drafts: data.drafts, platform };
        result.resultSummary = `Drafted ${data.drafts.length} post${data.drafts.length === 1 ? "" : "s"} for ${platform}. Review and save the ones you want.`;
        return { task: result, handoff: null };
      }
    }
  } catch (err) {
    req.log.error({ err, agent: task.agent }, "Manager task failed");
    result.status = "failed";
    result.error = "This agent could not complete its task.";
    result.resultSummary = "Failed to complete.";
    return { task: result, handoff: null };
  }

  return { task: result, handoff: null };
}

router.post("/manager/run", aiGenerationRateLimit, async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }

  const gateError = await agentsGateError(client);
  if (gateError) {
    res.status(403).json({ error: gateError });
    return;
  }

  const instruction =
    typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";
  if (!instruction) {
    res.status(400).json({ error: "An instruction is required." });
    return;
  }
  if (instruction.length > MANAGER_INSTRUCTION_MAX_LENGTH) {
    res.status(400).json({
      error: `Instruction must be ${MANAGER_INSTRUCTION_MAX_LENGTH} characters or fewer.`,
    });
    return;
  }

  const userId = req.userId!;
  if (managerInFlight.has(userId)) {
    res.status(429).json({
      error:
        "The Manager is already working on an instruction. Please wait for it to finish.",
    });
    return;
  }
  managerInFlight.add(userId);

  try {
    const snapshot = await buildSnapshot(client);

    let decomposition;
    try {
      decomposition = await decomposeInstruction({ instruction, snapshot });
    } catch (err) {
      req.log.error({ err }, "Manager decomposition failed");
      res.status(502).json({
        error:
          "The Manager could not break down that instruction. Please try again.",
      });
      return;
    }

    // Execute sequentially so each agent reads the latest upstream output.
    // Intermediate agents' outputs are UN-applied proposals (not yet in the DB),
    // so we accumulate a compact summary of each and thread it into the next
    // agent's brief/prompt — keeping the chain coherent (e.g. the Planner plans
    // around the themes the Strategist just proposed).
    const tasks: ManagerTask[] = [];
    let upstream = "";
    for (const task of decomposition.tasks) {
      const { task: completed, handoff } = await executeTask(
        req,
        client,
        task,
        upstream,
      );
      tasks.push(completed);
      if (handoff && completed.status === "completed") {
        upstream += (upstream ? "\n\n" : "") + handoff;
      }
    }

    const [run] = await db
      .insert(managerRunsTable)
      .values({
        clientId: client.id,
        instruction,
        summary: decomposition.summary,
        status: "completed",
        tasks,
      })
      .returning();

    res.json(serializeRun(run));
  } finally {
    managerInFlight.delete(userId);
  }
});

router.get("/manager/runs", async (req, res) => {
  const client = req.activeClient;
  if (!client) {
    res.status(404).json({ error: "No client profile yet" });
    return;
  }
  const rows = await db
    .select()
    .from(managerRunsTable)
    .where(eq(managerRunsTable.clientId, client.id))
    .orderBy(desc(managerRunsTable.id));
  res.json(rows.map(serializeRun));
});

export default router;
