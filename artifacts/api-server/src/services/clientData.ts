// Shared cleanup for everything keyed by a client profile. Used by both the
// per-user reset/account-delete flows (routes/client.ts) and the agency
// remove-client flow (routes/agency.ts). Any new clientId-keyed table must be
// added here or its rows leak after a profile is deleted.
import {
  db,
  clientProfileTable,
  auditResultsTable,
  briefingDossiersTable,
  narrativeProfilesTable,
  postsTable,
  ideasTable,
  platformStrategiesTable,
  industryOverviewTable,
  contentStrategiesTable,
  assistantMessagesTable,
  plannerMessagesTable,
  assistantReviewsTable,
  assistantInsightsTable,
  profilePortraitsTable,
  managerRunsTable,
  schedulerConnectionsTable,
  agencyClientAccessTable,
  invitationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export async function deleteClientData(clientId: number) {
  await db.transaction(async (tx) => {
    await tx.delete(postsTable).where(eq(postsTable.clientId, clientId));
    await tx.delete(ideasTable).where(eq(ideasTable.clientId, clientId));
    await tx
      .delete(narrativeProfilesTable)
      .where(eq(narrativeProfilesTable.clientId, clientId));
    await tx
      .delete(auditResultsTable)
      .where(eq(auditResultsTable.clientId, clientId));
    await tx
      .delete(briefingDossiersTable)
      .where(eq(briefingDossiersTable.clientId, clientId));
    await tx
      .delete(contentStrategiesTable)
      .where(eq(contentStrategiesTable.clientId, clientId));
    await tx
      .delete(platformStrategiesTable)
      .where(eq(platformStrategiesTable.clientId, clientId));
    await tx
      .delete(industryOverviewTable)
      .where(eq(industryOverviewTable.clientId, clientId));
    await tx
      .delete(assistantMessagesTable)
      .where(eq(assistantMessagesTable.clientId, clientId));
    await tx
      .delete(plannerMessagesTable)
      .where(eq(plannerMessagesTable.clientId, clientId));
    await tx
      .delete(assistantReviewsTable)
      .where(eq(assistantReviewsTable.clientId, clientId));
    await tx
      .delete(assistantInsightsTable)
      .where(eq(assistantInsightsTable.clientId, clientId));
    await tx
      .delete(profilePortraitsTable)
      .where(eq(profilePortraitsTable.clientId, clientId));
    await tx
      .delete(managerRunsTable)
      .where(eq(managerRunsTable.clientId, clientId));
    await tx
      .delete(schedulerConnectionsTable)
      .where(eq(schedulerConnectionsTable.clientId, clientId));
    // Agency linkage rows reference this client by id with no FK cascade, so
    // remove them here or they would dangle after the profile is deleted.
    await tx
      .delete(agencyClientAccessTable)
      .where(eq(agencyClientAccessTable.clientId, clientId));
    await tx
      .delete(invitationsTable)
      .where(eq(invitationsTable.clientId, clientId));
    await tx
      .delete(clientProfileTable)
      .where(eq(clientProfileTable.id, clientId));
  });
}
