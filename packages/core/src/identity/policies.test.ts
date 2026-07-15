import { describe, expect, it } from "vitest";
import type { Actor } from "../authz/engine";
import { can } from "../authz/engine";
import { manageOwnAccountPolicy, viewProfilePolicy } from "./policies";

const owner: Actor = { id: "owner-1", roles: [] };
const stranger: Actor = { id: "stranger-1", roles: [] };
const moderator: Actor = { id: "mod-1", roles: ["moderator"] };
const admin: Actor = { id: "admin-1", roles: ["admin"] };

describe("viewProfilePolicy", () => {
  it("owner sees their own private profile", () => {
    const resource = { ownerId: owner.id, visibility: "private" as const };
    expect(can(viewProfilePolicy, owner, resource, { ownerFollowsViewer: false })).toBe(true);
  });

  it("admin sees a stranger's private profile", () => {
    const resource = { ownerId: owner.id, visibility: "private" as const };
    expect(can(viewProfilePolicy, admin, resource, { ownerFollowsViewer: false })).toBe(true);
  });

  it("moderator sees a stranger's private profile", () => {
    const resource = { ownerId: owner.id, visibility: "private" as const };
    expect(can(viewProfilePolicy, moderator, resource, { ownerFollowsViewer: false })).toBe(true);
  });

  it("plain user sees a public profile but not a private one", () => {
    const publicResource = { ownerId: owner.id, visibility: "public" as const };
    const privateResource = { ownerId: owner.id, visibility: "private" as const };
    expect(can(viewProfilePolicy, stranger, publicResource, { ownerFollowsViewer: false })).toBe(
      true,
    );
    expect(can(viewProfilePolicy, stranger, privateResource, { ownerFollowsViewer: false })).toBe(
      false,
    );
  });

  it("following visibility is driven by ownerFollowsViewer", () => {
    const resource = { ownerId: owner.id, visibility: "following" as const };
    expect(can(viewProfilePolicy, stranger, resource, { ownerFollowsViewer: true })).toBe(true);
    expect(can(viewProfilePolicy, stranger, resource, { ownerFollowsViewer: false })).toBe(false);
  });

  it("anonymous viewer sees only public profiles", () => {
    const publicResource = { ownerId: owner.id, visibility: "public" as const };
    const followingResource = { ownerId: owner.id, visibility: "following" as const };
    const privateResource = { ownerId: owner.id, visibility: "private" as const };
    expect(can(viewProfilePolicy, null, publicResource, { ownerFollowsViewer: false })).toBe(true);
    expect(can(viewProfilePolicy, null, followingResource, { ownerFollowsViewer: true })).toBe(
      true,
    );
    expect(can(viewProfilePolicy, null, privateResource, { ownerFollowsViewer: false })).toBe(
      false,
    );
  });
});

describe("manageOwnAccountPolicy", () => {
  const resource = { ownerId: owner.id };

  it("allows the owner", () => {
    expect(can(manageOwnAccountPolicy, owner, resource, undefined)).toBe(true);
  });

  it("denies a different user", () => {
    expect(can(manageOwnAccountPolicy, stranger, resource, undefined)).toBe(false);
  });

  it("denies an admin (no role bypass)", () => {
    expect(can(manageOwnAccountPolicy, admin, resource, undefined)).toBe(false);
  });

  it("denies an anonymous actor", () => {
    expect(can(manageOwnAccountPolicy, null, resource, undefined)).toBe(false);
  });
});
