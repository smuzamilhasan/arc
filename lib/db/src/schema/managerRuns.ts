import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";

// The four specialist agents the Manager can route work to. Kept as a string
// union (not a DB enum) to mirror the rest of the schema's JSON-typed columns.
export type ManagerAgent = "investigator" | "strategist" | "planner" | "ghostwriter";

export type ManagerTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type ManagerRunStatus = "completed" | "failed";

// A strategist proposal surfaced (read-only) on the Manager run. The actual
// confirm/reject lives on the assistant_messages row referenced by
// assistantMessageId — the Manager never duplicates that write path.
export type ManagerProposalRef = {
  title: string;
  rationale: string;
};

// A planned content slot the Planner proposed. Shape-compatible with the
// Planner's PlannedSlot and the /planner/apply body, so the web layer can apply
// a Manager-produced plan through the existing apply hook without conversion.
export type ManagerPlannedSlot = {
  platform: string;
  title: string;
  format: string;
  contentType: string;
  brief: string;
  targetDate: string;
};

export type ManagerPlannedIdea = {
  title: string;
  notes: string;
  platform: string | null;
};

// A Ghostwriter draft proposed by the Manager. Ephemeral — the client saves the
// ones they want via the normal POST /posts path.
export type ManagerDraft = {
  title: string;
  content: string;
  format: string;
};

// The agent-specific output captured for a task. Every field is optional; which
// ones are set depends on the task's agent. Outputs that require confirmation
// (strategist proposals, planner plan, ghostwriter drafts) stay un-applied here
// and are confirmed by the client through the existing per-agent surfaces.
export type ManagerTaskOutput = {
  // investigator
  footprintSummary?: string;
  competitorCount?: number;
  // strategist
  assistantMessageId?: number;
  reply?: string;
  proposals?: ManagerProposalRef[];
  // planner
  planSummary?: string;
  slots?: ManagerPlannedSlot[];
  ideas?: ManagerPlannedIdea[];
  // ghostwriter
  drafts?: ManagerDraft[];
  platform?: string;
};

// One delegated piece of work the Manager routed to a single agent.
export type ManagerTask = {
  id: string;
  agent: ManagerAgent;
  title: string;
  brief: string;
  status: ManagerTaskStatus;
  resultSummary: string;
  error: string | null;
  output: ManagerTaskOutput | null;
};

const emptyTasks: ManagerTask[] = [];

// One Manager orchestration: a high-level client instruction broken into an
// ordered set of delegated agent tasks, plus their outcomes. Persisted so the
// client can see what was delegated and the status of each piece of work.
export const managerRunsTable = pgTable("manager_runs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  instruction: text("instruction").notNull(),
  summary: text("summary").notNull().default(""),
  status: text("status").notNull().default("completed"),
  tasks: jsonb("tasks").$type<ManagerTask[]>().notNull().default(emptyTasks),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ManagerRun = typeof managerRunsTable.$inferSelect;
