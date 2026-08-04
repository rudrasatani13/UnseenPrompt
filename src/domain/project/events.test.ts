import { describe, expect, it } from "vitest";

import { parseProjectEventV1, parseProjectUserActorV1, projectEventSchema } from "./events";

const id = "11111111-1111-4111-8111-111111111111";

const event = {
  id,
  projectId: id,
  sequenceNumber: 2,
  eventType: "requirement.confirmed" as const,
  eventSchemaVersion: 1 as const,
  actorType: "user" as const,
  actorId: id,
  idempotencyRecordId: null,
  correlationId: id,
  payload: {
    schemaVersion: 1 as const,
    entityId: id,
    beforeStatus: "proposed" as const,
    afterStatus: "confirmed" as const,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("project event contracts", () => {
  it("accepts closed event vocabulary and payloads", () => {
    expect(parseProjectEventV1(event)).toMatchObject({ eventType: "requirement.confirmed" });
    expect(projectEventSchema.safeParse({ ...event, eventType: "made.up" }).success).toBe(false);
    expect(
      projectEventSchema.safeParse({ ...event, payload: { ...event.payload, extra: true } })
        .success,
    ).toBe(false);
  });

  it("requires user attribution through the user command actor contract", () => {
    expect(parseProjectUserActorV1({ actorType: "user", actorId: id })).toEqual({
      actorType: "user",
      actorId: id,
    });
    expect(() => parseProjectUserActorV1({ actorType: "model", actorId: id })).toThrowError(
      "confirmation_required",
    );
    expect(() => parseProjectEventV1({ ...event, actorType: "model" })).toThrowError(
      "validation_failed",
    );
    expect(() => parseProjectEventV1({ ...event, actorType: "system" })).toThrowError(
      "validation_failed",
    );
    expect(() => parseProjectEventV1({ ...event, actorId: null })).toThrowError(
      "validation_failed",
    );
  });

  it("accepts every Phase 6 event variant only with its matching strict payload", () => {
    const payloads = {
      "project.mode_changed": { schemaVersion: 1, from: "new_build", to: "feature" },
      "project.stage_transitioned": {
        schemaVersion: 1,
        from: "discovery",
        to: "brief_confirmation",
      },
      "project.blocked": { schemaVersion: 1, from: "iteration", to: "blocked" },
      "project.unblocked": { schemaVersion: 1, from: "blocked", to: "iteration" },
      "project.completed": { schemaVersion: 1, from: "result_review", to: "completed" },
      "project.archived": { schemaVersion: 1, from: "completed", to: "archived" },
      "project.restored": { schemaVersion: 1, from: "archived", to: "completed" },
      "project.delta_proposed": {
        schemaVersion: 1,
        generationRunId: id,
        createdRequirementIds: [id],
        updatedRequirementIds: [],
        createdDecisionIds: [],
        updatedDecisionIds: [id],
        createdMilestoneIds: [],
        updatedMilestoneIds: [],
      },
      "requirement.confirmed": {
        schemaVersion: 1,
        entityId: id,
        beforeStatus: "proposed",
        afterStatus: "confirmed",
      },
      "requirement.rejected": {
        schemaVersion: 1,
        entityId: id,
        beforeStatus: "proposed",
        afterStatus: "rejected",
      },
      "requirement.superseded": {
        schemaVersion: 1,
        entityId: id,
        predecessorId: id,
        beforeStatus: "confirmed",
        afterStatus: "superseded",
      },
      "decision.confirmed": {
        schemaVersion: 1,
        entityId: id,
        beforeStatus: "proposed",
        afterStatus: "confirmed",
      },
      "decision.rejected": {
        schemaVersion: 1,
        entityId: id,
        beforeStatus: "proposed",
        afterStatus: "rejected",
      },
      "decision.superseded": {
        schemaVersion: 1,
        entityId: id,
        predecessorId: id,
        beforeStatus: "confirmed",
        afterStatus: "superseded",
      },
      "milestone.activated": { schemaVersion: 1, previousMilestoneId: null, milestoneId: id },
      "milestone.deactivated": { schemaVersion: 1, previousMilestoneId: id, milestoneId: null },
      "milestone.status_confirmed": {
        schemaVersion: 1,
        previousMilestoneId: null,
        milestoneId: id,
        beforeStatus: "pending",
        afterStatus: "completed",
      },
      "project.summary_replaced": {
        schemaVersion: 1,
        summaryId: id,
        summaryKind: "brief",
        version: 1,
      },
    } as const;
    for (const [eventType, payload] of Object.entries(payloads)) {
      expect(parseProjectEventV1({ ...event, eventType, payload })).toMatchObject({ eventType });
    }
    expect(
      projectEventSchema.safeParse({
        ...event,
        eventType: "project.delta_proposed",
        payload: { ...payloads["project.delta_proposed"], extra: true },
      }).success,
    ).toBe(false);
  });
});
