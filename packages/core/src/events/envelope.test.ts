import { describe, expect, it } from "vitest";
import { contentModeratedEvent, contentSubmittedEvent } from "./content";
import { eventRegistry } from "./registry";
import { reportCreatedEvent } from "./report";
import { userRegisteredEvent } from "./user-registered";

describe("userRegisteredEvent", () => {
  it("creates a valid envelope", () => {
    const envelope = userRegisteredEvent.create({ userId: "u1", locale: "en" });

    expect(envelope.id).toBeTruthy();
    expect(envelope.version).toBe(1);
    expect(envelope.type).toBe("user.registered");
  });

  it("rejects a payload missing userId", () => {
    expect(() =>
      userRegisteredEvent.parse({
        id: "e1",
        type: "user.registered",
        version: 1,
        occurredAt: new Date().toISOString(),
        payload: { locale: "en" },
      }),
    ).toThrow();
  });
});

describe("contentSubmittedEvent", () => {
  it("creates a valid envelope", () => {
    const envelope = contentSubmittedEvent.create({
      subjectType: "movement",
      subjectId: "m1",
      ownerUserId: "u1",
    });

    expect(envelope.id).toBeTruthy();
    expect(envelope.version).toBe(1);
    expect(envelope.type).toBe("content.submitted");
  });

  it("rejects a payload missing subjectId", () => {
    expect(() =>
      contentSubmittedEvent.parse({
        id: "e1",
        type: "content.submitted",
        version: 1,
        occurredAt: new Date().toISOString(),
        payload: { subjectType: "movement", ownerUserId: "u1" },
      }),
    ).toThrow();
  });
});

describe("contentModeratedEvent", () => {
  it("creates a valid envelope", () => {
    const envelope = contentModeratedEvent.create({
      subjectType: "exercise",
      subjectId: "e1",
      decision: "approved",
      moderatorUserId: "mod1",
    });

    expect(envelope.id).toBeTruthy();
    expect(envelope.version).toBe(1);
    expect(envelope.type).toBe("content.moderated");
  });

  it("rejects a payload missing subjectId", () => {
    expect(() =>
      contentModeratedEvent.parse({
        id: "e1",
        type: "content.moderated",
        version: 1,
        occurredAt: new Date().toISOString(),
        payload: { subjectType: "exercise", decision: "approved", moderatorUserId: "mod1" },
      }),
    ).toThrow();
  });

  it("rejects decision pending", () => {
    expect(() =>
      contentModeratedEvent.parse({
        id: "e1",
        type: "content.moderated",
        version: 1,
        occurredAt: new Date().toISOString(),
        payload: {
          subjectType: "exercise",
          subjectId: "e1",
          decision: "pending",
          moderatorUserId: "mod1",
        },
      }),
    ).toThrow();
  });
});

describe("reportCreatedEvent", () => {
  it("creates a valid envelope", () => {
    const envelope = reportCreatedEvent.create({
      reportId: "r1",
      subjectType: "gym",
      subjectId: "g1",
      reporterUserId: "u1",
    });

    expect(envelope.id).toBeTruthy();
    expect(envelope.version).toBe(1);
    expect(envelope.type).toBe("report.created");
  });

  it("rejects a payload missing subjectId", () => {
    expect(() =>
      reportCreatedEvent.parse({
        id: "e1",
        type: "report.created",
        version: 1,
        occurredAt: new Date().toISOString(),
        payload: { reportId: "r1", subjectType: "gym", reporterUserId: "u1" },
      }),
    ).toThrow();
  });
});

describe("eventRegistry", () => {
  it("contains all three new phase 3 event types", () => {
    expect(eventRegistry["content.submitted"]).toBeDefined();
    expect(eventRegistry["content.moderated"]).toBeDefined();
    expect(eventRegistry["report.created"]).toBeDefined();
  });
});
