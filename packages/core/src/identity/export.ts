import type { IdentityRepository } from "./service";

export type ExportSection = {
  name: string;
  collect(userId: string): Promise<unknown>;
};

export function createIdentityExportSections(repo: IdentityRepository): ExportSection[] {
  return [
    {
      name: "profile",
      async collect(userId) {
        const user = await repo.findUserById(userId);
        if (!user) return null;
        return {
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          biography: user.biography,
          locale: user.locale,
          createdAt: user.createdAt,
        };
      },
    },
    {
      name: "preferences",
      collect(userId) {
        return repo.getPreferences(userId);
      },
    },
    {
      name: "privacySettings",
      collect(userId) {
        return repo.getPrivacySettings(userId);
      },
    },
    {
      name: "consents",
      collect(userId) {
        return repo.listConsents(userId);
      },
    },
    {
      name: "roles",
      collect(userId) {
        return repo.getUserRoles(userId);
      },
    },
  ];
}
